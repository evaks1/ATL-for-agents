/**
 * ATL Demo — Acceptance Criteria Smoke Test
 *
 * Demonstrates all 8 acceptance criteria from the MVP spec:
 * 1. Create delegation
 * 2. Agent signs receipt within scope → ALLOW
 * 3. Exceed cap → DENY
 * 4. New counterparty → STEP_UP_REQUIRED
 * 5. Complete step-up approval → ALLOW
 * 6. Generate dispute evidence bundle
 * 7. Revoke delegation → future verify returns DENY
 *
 * Run with: pnpm demo
 * (Requires server running on localhost:3000)
 */

import "dotenv/config";
import { randomUUID } from "crypto";
import { generateKeyPair, sign, canonicalize } from "../src/lib/crypto.js";

const BASE = process.env.ATL_URL ?? "http://127.0.0.1:3000";
const API_KEY = process.env.SEED_API_KEY ?? "demo-key-local";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${(data as { error?: string }).error}`);
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}

function log(msg: string) {
  console.log(`\n${"─".repeat(60)}\n${msg}`);
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✅ ${msg}`);
}

function buildSignedReceipt(
  grant_id: string,
  session_key_id: string,
  sessionPrivKey: string,
  intent: {
    action: string;
    resource: string;
    parameters?: Record<string, unknown>;
    amount?: number;
    counterparty?: string;
  }
) {
  const fullIntent = {
    action: intent.action,
    resource: intent.resource,
    parameters: intent.parameters ?? {},
    ...(intent.amount !== undefined && { amount: intent.amount }),
    ...(intent.counterparty !== undefined && { counterparty: intent.counterparty }),
    timestamp: new Date().toISOString(),
    nonce: randomUUID(),
  };

  const base = { grant_id, session_key_id, intent: fullIntent };
  const canonical = canonicalize(base);
  const agent_signature = sign(sessionPrivKey, canonical);

  return { ...base, signatures: { agent_signature } };
}

// ─── Main Demo ───────────────────────────────────────────────────────────────

async function runDemo() {
  console.log("🔐 Agent Trust Layer — MVP Acceptance Criteria Demo");
  console.log("=".repeat(60));

  // ── 1. Create Agent ──────────────────────────────────────────
  log("Step 1: Create Agent");
  // Generate keypair locally — private key never sent to server
  const agentKeyPair = generateKeyPair();
  const agent = await post<{ agent_id: string; public_key: string }>("/agents", {
    public_key: agentKeyPair.publicKey,
  });
  console.log(`  agent_id : ${agent.agent_id}`);
  console.log(`  pub_key  : ${agent.public_key.slice(0, 16)}…`);
  assert(!!agent.agent_id, "Agent created with ID");

  // ── 2. Create Delegation ─────────────────────────────────────
  log("Step 2: Create Delegation (UCAN) — $1000 cap, known counterparties, step-up at $500");
  const delegation = await post<{
    grant_id: string;
    ucan_token: string;
    expires_at: string;
  }>("/delegations", {
    principal_id: "demo-principal",
    agent_id: agent.agent_id,
    capabilities: [
      {
        resource: "payment:transfer",
        action: "execute",
        constraints: {
          max_amount: 1000,
          allowed_counterparties: ["acme-corp", "globex-inc"],
          step_up_threshold: 500,
          frequency_limit: { count: 10, window_seconds: 3600 },
        },
      },
    ],
    expires_in_seconds: 3600,
  });

  console.log(`  grant_id   : ${delegation.grant_id}`);
  console.log(`  ucan_token : ${delegation.ucan_token.slice(0, 32)}…`);
  assert(!!delegation.grant_id, "Delegation created with grant_id");
  assert(!!delegation.ucan_token, "UCAN token issued");

  // ── 3. Mint Session Key ──────────────────────────────────────
  log("Step 3: Mint ephemeral session key");
  // Generate session keypair locally — private key stays here, never sent to server
  const sessionKeyPair = generateKeyPair();
  const session = await post<{
    session_key_id: string;
    public_key: string;
    expires_at: string;
  }>("/sessions", {
    grant_id: delegation.grant_id,
    public_key: sessionKeyPair.publicKey,
    expires_in_seconds: 3600,
  });

  // Attach locally-generated private key for signing
  const sessionPrivKey = sessionKeyPair.privateKey;

  console.log(`  session_key_id : ${session.session_key_id}`);
  assert(!!session.session_key_id, "Session key minted");
  assert(!!sessionPrivKey, "Private key held locally (never sent to server)");

  // ── 4. ALLOW: within-scope payment ───────────────────────────
  log("Step 4: Verify within-scope intent → expect ALLOW");
  const receipt1 = buildSignedReceipt(
    delegation.grant_id,
    session.session_key_id,
    sessionPrivKey,
    { action: "execute", resource: "payment:transfer", amount: 200, counterparty: "acme-corp" }
  );

  const v1 = await post<{ decision: string; reason_code: string; receipt_id: string }>(
    "/verify",
    { intent_receipt: receipt1 }
  );
  console.log(`  decision    : ${v1.decision}`);
  console.log(`  reason_code : ${v1.reason_code}`);
  assert(v1.decision === "ALLOW", "Within-scope payment returns ALLOW");

  // ── 5. DENY: exceeds cap ─────────────────────────────────────
  log("Step 5: Verify over-cap intent → expect DENY");
  const receipt2 = buildSignedReceipt(
    delegation.grant_id,
    session.session_key_id,
    sessionPrivKey,
    { action: "execute", resource: "payment:transfer", amount: 2000, counterparty: "acme-corp" }
  );

  const v2 = await post<{ decision: string; reason_code: string }>(
    "/verify",
    { intent_receipt: receipt2 }
  );
  console.log(`  decision    : ${v2.decision}`);
  console.log(`  reason_code : ${v2.reason_code}`);
  assert(v2.decision === "DENY", "Over-cap payment returns DENY");
  assert(v2.reason_code === "AMOUNT_EXCEEDS_CAP", "Correct reason code");

  // ── 6. STEP_UP: unknown counterparty ─────────────────────────
  log("Step 6: Unknown counterparty → expect STEP_UP_REQUIRED");
  const receipt3 = buildSignedReceipt(
    delegation.grant_id,
    session.session_key_id,
    sessionPrivKey,
    { action: "execute", resource: "payment:transfer", amount: 100, counterparty: "mystery-vendor" }
  );

  const v3 = await post<{ decision: string; reason_code: string; challenge_id?: string }>(
    "/verify",
    { intent_receipt: receipt3 }
  );
  console.log(`  decision     : ${v3.decision}`);
  console.log(`  reason_code  : ${v3.reason_code}`);
  console.log(`  challenge_id : ${v3.challenge_id}`);
  assert(v3.decision === "STEP_UP_REQUIRED", "Unknown counterparty returns STEP_UP_REQUIRED");
  assert(!!v3.challenge_id, "Challenge ID issued");

  // ── 7. Complete step-up → ALLOW ──────────────────────────────
  log("Step 7: Complete step-up approval → expect decision becomes ALLOW");
  const approval = await post<{ decision: string; status: string }>(
    `/approvals/${v3.challenge_id}/complete`,
    {}
  );
  console.log(`  status   : ${approval.status}`);
  console.log(`  decision : ${approval.decision}`);
  assert(approval.status === "completed", "Challenge marked completed");
  assert(approval.decision === "ALLOW", "After step-up decision is ALLOW");

  // ── 8. Dispute bundle ────────────────────────────────────────
  log("Step 8: Export dispute evidence bundle");
  const bundle = await post<{
    delegation: unknown;
    receipt: unknown;
    verification_snapshot: unknown;
    audit_hash: string;
    bundle_hash: string;
  }>("/disputes/export", { receipt_id: v1.receipt_id });
  console.log(`  audit_hash  : ${bundle.audit_hash.slice(0, 16)}…`);
  console.log(`  bundle_hash : ${bundle.bundle_hash.slice(0, 16)}…`);
  assert(!!bundle.delegation, "Bundle contains delegation");
  assert(!!bundle.receipt, "Bundle contains receipt");
  assert(!!bundle.verification_snapshot, "Bundle contains verification snapshot");
  assert(!!bundle.audit_hash, "Bundle contains audit hash");

  // ── 9. Revoke → DENY ─────────────────────────────────────────
  log("Step 9: Revoke delegation → subsequent verify returns DENY");
  await post(`/delegations/${delegation.grant_id}/revoke`, {});
  console.log(`  Delegation revoked.`);

  // Need a fresh nonce — create a new receipt
  const receipt4 = buildSignedReceipt(
    delegation.grant_id,
    session.session_key_id,
    sessionPrivKey,
    { action: "execute", resource: "payment:transfer", amount: 100, counterparty: "acme-corp" }
  );
  const v4 = await post<{ decision: string; reason_code: string }>(
    "/verify",
    { intent_receipt: receipt4 }
  );
  console.log(`  decision    : ${v4.decision}`);
  console.log(`  reason_code : ${v4.reason_code}`);
  assert(v4.decision === "DENY", "Revoked delegation returns DENY");
  assert(v4.reason_code === "DELEGATION_REVOKED", "Correct revocation reason");

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ All acceptance criteria passed.\n");
}

runDemo().catch((err) => {
  console.error("\n❌ Demo failed:", err.message);
  process.exit(1);
});
