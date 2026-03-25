import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Delegation } from "../api/client";
import { generateKeyPair, canonicalize, sign } from "../lib/crypto";
import { Badge } from "../components/Badge";

type Decision = "ALLOW" | "DENY" | "STEP_UP_REQUIRED";

interface VerifyResult {
  decision: Decision;
  reason_code: string;
  receipt_id?: string;
  human_id?: string;
  challenge_id?: string;
}

const DECISION_STYLES: Record<Decision, string> = {
  ALLOW: "text-green-400 border-green-700/50 bg-green-900/20",
  DENY: "text-red-400 border-red-700/50 bg-red-900/20",
  STEP_UP_REQUIRED: "text-amber-400 border-amber-700/50 bg-amber-900/20",
};

export function VerifyPage() {
  const navigate = useNavigate();
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loadingDelegations, setLoadingDelegations] = useState(true);

  const [grantId, setGrantId] = useState("");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [parametersRaw, setParametersRaw] = useState("{}");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    api.delegations
      .list()
      .then((ds) => setDelegations(ds.filter((d) => d.status === "active")))
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingDelegations(false));
  }, []);

  const submit = async () => {
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      // Parse parameters
      let parameters: Record<string, unknown>;
      try {
        parameters = JSON.parse(parametersRaw);
      } catch {
        throw new Error("Parameters must be valid JSON");
      }

      // 1. Generate ephemeral session keypair in browser
      const sessionKey = generateKeyPair();

      // 2. Register session with server (only public key sent)
      const session = await api.sessions.create({
        grant_id: grantId,
        public_key: sessionKey.publicKey,
        expires_in_seconds: 300,
      });

      // 3. Build intent
      const intent: Record<string, unknown> = {
        action,
        resource,
        parameters,
        timestamp: new Date().toISOString(),
        nonce: crypto.randomUUID(),
      };
      if (amount !== "") intent.amount = Number(amount);
      if (counterparty !== "") intent.counterparty = counterparty;

      // 4. Canonicalize payload (excluding signatures — same as server does)
      const receiptBase = {
        grant_id: grantId,
        session_key_id: session.session_key_id,
        intent,
      };
      const canonical = canonicalize(receiptBase);

      // 5. Sign with session private key
      const agent_signature = sign(sessionKey.privateKey, canonical);

      // 6. POST /verify
      const verifyResult = await api.verify({
        intent_receipt: {
          grant_id: grantId,
          session_key_id: session.session_key_id,
          intent,
          signatures: { agent_signature },
        },
      });

      setResult(verifyResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const activeDelegations = delegations;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Verify Intent</h1>
      <p className="text-sm text-gray-400 mb-6">
        Signs an intent with an ephemeral session key generated in your browser — the private key
        never leaves this page. Pick an active delegation, fill in the intent, and click Verify.
      </p>

      <div className="space-y-4">
        {/* Delegation selector */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Delegation (grant ID)</label>
          {loadingDelegations ? (
            <p className="text-xs text-gray-500">Loading delegations…</p>
          ) : activeDelegations.length === 0 ? (
            <p className="text-xs text-red-400">No active delegations. Create one first.</p>
          ) : (
            <select
              value={grantId}
              onChange={(e) => setGrantId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded bg-gray-900 border border-gray-700 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="">— select —</option>
              {activeDelegations.map((d) => (
                <option key={d.grant_id} value={d.grant_id}>
                  {d.grant_id.slice(0, 8)}… · {d.principal_id.slice(0, 12)}… ·{" "}
                  {d.capabilities.map((c) => `${c.resource}/${c.action}`).join(", ")}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Action + Resource */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Action</label>
            <input
              type="text"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. write_file"
              className="w-full px-3 py-2 text-sm rounded bg-gray-900 border border-gray-700 text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Resource</label>
            <input
              type="text"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              placeholder="e.g. /tmp/output.txt"
              className="w-full px-3 py-2 text-sm rounded bg-gray-900 border border-gray-700 text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Amount + Counterparty (optional) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Amount (optional)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 100"
              className="w-full px-3 py-2 text-sm rounded bg-gray-900 border border-gray-700 text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Counterparty (optional)</label>
            <input
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="e.g. alice@example.com"
              className="w-full px-3 py-2 text-sm rounded bg-gray-900 border border-gray-700 text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Parameters */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Parameters (JSON)</label>
          <textarea
            value={parametersRaw}
            onChange={(e) => setParametersRaw(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm font-mono rounded bg-gray-900 border border-gray-700 text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none resize-none"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting || !grantId || !action || !resource}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-medium transition-colors"
        >
          {submitting ? "Signing & verifying…" : "Sign & Verify"}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`mt-6 border rounded-xl p-5 space-y-3 ${DECISION_STYLES[result.decision]}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">{result.decision}</span>
            <Badge value={result.decision} />
          </div>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-gray-400">Reason: </span>
              <span className="font-mono">{result.reason_code}</span>
            </p>
            {result.human_id && (
              <p>
                <span className="text-gray-400">Authorized by: </span>
                <span className="font-mono text-xs">{result.human_id.slice(0, 16)}…</span>
              </p>
            )}
            {result.receipt_id && (
              <p>
                <span className="text-gray-400">Receipt: </span>
                <button
                  onClick={() => navigate(`/receipts/${result.receipt_id}`)}
                  className="font-mono text-xs text-indigo-400 hover:underline"
                >
                  {result.receipt_id.slice(0, 8)}…
                </button>
              </p>
            )}
            {result.challenge_id && (
              <p>
                <span className="text-gray-400">Challenge ID: </span>
                <span className="font-mono text-xs">{result.challenge_id}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
