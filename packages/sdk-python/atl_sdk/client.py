"""ATL Python SDK client."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Callable, TypeVar

import httpx

from .crypto import sign_message, canonicalize

T = TypeVar("T")


class ATLError(Exception):
    def __init__(self, message: str, decision: str | None = None, reason_code: str | None = None, challenge_id: str | None = None):
        super().__init__(message)
        self.decision = decision
        self.reason_code = reason_code
        self.challenge_id = challenge_id


class ATLClient:
    """
    Agent Trust Layer client.

    Example::

        atl = ATLClient("http://localhost:3000")
        agent = atl.create_agent()
        delegation = atl.create_delegation(
            principal_id="principal-1",
            agent_id=agent["agent_id"],
            capabilities=[{
                "resource": "payment:transfer",
                "action": "execute",
                "constraints": {"max_amount": 1000},
            }],
        )
        session = atl.mint_session_key(delegation["grant_id"])
        receipt = atl.sign_intent_receipt(session, {
            "action": "execute",
            "resource": "payment:transfer",
            "amount": 500,
            "counterparty": "acme-corp",
        })
        result = atl.verify_intent(receipt)
    """

    def __init__(self, base_url: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout)

    def _post(self, path: str, body: dict) -> dict:
        resp = self._client.post(path, json=body)
        data = resp.json()
        if not resp.is_success:
            raise ATLError(data.get("error", f"HTTP {resp.status_code}"))
        return data

    def _get(self, path: str) -> Any:
        resp = self._client.get(path)
        data = resp.json()
        if not resp.is_success:
            raise ATLError(data.get("error", f"HTTP {resp.status_code}"))
        return data

    def create_agent(self) -> dict:
        """Register a new agent. Returns {"agent_id": ..., "public_key": ...}."""
        return self._post("/agents", {})

    def create_delegation(
        self,
        principal_id: str,
        agent_id: str,
        capabilities: list[dict],
        expires_in_seconds: int = 86400,
    ) -> dict:
        """Create a UCAN delegation. Returns {"grant_id": ..., "ucan_token": ...}."""
        return self._post("/delegations", {
            "principal_id": principal_id,
            "agent_id": agent_id,
            "capabilities": capabilities,
            "expires_in_seconds": expires_in_seconds,
        })

    def revoke_delegation(self, grant_id: str) -> dict:
        """Revoke a delegation immediately."""
        return self._post(f"/delegations/{grant_id}/revoke", {})

    def mint_session_key(self, grant_id: str, expires_in_seconds: int = 3600) -> dict:
        """
        Mint an ephemeral session key bound to a delegation.
        Returns {"session_key_id", "public_key", "private_key", "expires_at", "grant_id"}.
        The private_key is returned once — persist it yourself.
        """
        result = self._post("/sessions", {
            "grant_id": grant_id,
            "expires_in_seconds": expires_in_seconds,
        })
        result["grant_id"] = grant_id
        return result

    def sign_intent_receipt(self, session: dict, intent: dict) -> dict:
        """
        Sign an intent receipt with the session key. Pure function — no network call.

        :param session: dict returned by mint_session_key
        :param intent: {"action", "resource", "amount"?, "counterparty"?, "parameters"?}
        :returns: Signed IntentReceipt dict
        """
        full_intent: dict[str, Any] = {
            "action": intent["action"],
            "resource": intent["resource"],
            "parameters": intent.get("parameters", {}),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "nonce": str(uuid.uuid4()),
        }
        if "amount" in intent:
            full_intent["amount"] = intent["amount"]
        if "counterparty" in intent:
            full_intent["counterparty"] = intent["counterparty"]

        receipt_base = {
            "grant_id": session["grant_id"],
            "session_key_id": session["session_key_id"],
            "intent": full_intent,
        }

        canonical = canonicalize(receipt_base)
        agent_signature = sign_message(session["private_key"], canonical)

        return {
            **receipt_base,
            "signatures": {"agent_signature": agent_signature},
        }

    def verify_intent(self, receipt: dict) -> dict:
        """Submit a signed receipt for verification. Returns {decision, reason_code, ...}."""
        return self._post("/verify", {"intent_receipt": receipt})

    def verify_before_execute(self, receipt: dict, fn: Callable[[], T]) -> T:
        """
        Verify-before-execute pattern. Calls fn() only if decision is ALLOW.
        Raises ATLError for DENY or STEP_UP_REQUIRED.
        """
        result = self.verify_intent(receipt)
        decision = result["decision"]

        if decision == "ALLOW":
            return fn()

        raise ATLError(
            f"Action blocked: {result.get('reason_code', decision)}",
            decision=decision,
            reason_code=result.get("reason_code"),
            challenge_id=result.get("challenge_id"),
        )

    def complete_step_up(self, challenge_id: str) -> dict:
        """Complete a step-up challenge (simulates user approval)."""
        return self._post(f"/approvals/{challenge_id}/complete", {})

    def export_dispute_bundle(self, receipt_id: str) -> dict:
        """Export a cryptographic dispute evidence bundle."""
        return self._post("/disputes/export", {"receipt_id": receipt_id})

    def list_agents(self) -> list[dict]:
        return self._get("/agents")

    def list_delegations(self) -> list[dict]:
        return self._get("/delegations")

    def list_receipts(self) -> list[dict]:
        return self._get("/receipts")

    def get_receipt(self, receipt_id: str) -> dict:
        return self._get(f"/receipts/{receipt_id}")

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
