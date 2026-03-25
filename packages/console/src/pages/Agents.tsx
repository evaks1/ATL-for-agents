import { useState, useEffect } from "react";
import { api, type Agent } from "../api/client";
import { generateKeyPair } from "../lib/crypto";

interface NewAgentResult {
  agent: Agent;
  privateKey: string;
}

function PrivateKeyModal({ result, onClose }: { result: NewAgentResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(result.privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-amber-600/50 rounded-xl p-6 max-w-lg w-full space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-lg">⚠️</span>
          <h2 className="font-bold text-white">Save your agent private key</h2>
        </div>
        <p className="text-sm text-gray-400">
          This is shown <span className="text-white font-semibold">once only</span>. The server never
          received it. Store it securely — you'll need it to sign intent receipts.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Agent ID</span>
            <span className="font-mono text-xs text-indigo-400">{result.agent.agent_id}</span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Private key — store this</span>
              <button
                onClick={copy}
                className="text-xs px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="bg-black border border-amber-800/50 rounded p-3 text-xs font-mono text-amber-300 break-all whitespace-pre-wrap">
              {result.privateKey}
            </pre>
          </div>
          <div>
            <span className="text-xs text-gray-500">Public key (safe to share)</span>
            <pre className="bg-black border border-gray-700 rounded p-2 text-xs font-mono text-gray-400 break-all whitespace-pre-wrap mt-1">
              {result.agent.public_key}
            </pre>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium transition-colors"
        >
          I've saved the private key
        </button>
      </div>
    </div>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newAgent, setNewAgent] = useState<NewAgentResult | null>(null);

  const load = async () => {
    try {
      setAgents(await api.agents.list());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createAgent = async () => {
    setCreating(true);
    setError(null);
    try {
      // Generate keypair in browser — private key never sent to server
      const keyPair = generateKeyPair();
      const agent = await api.agents.create(keyPair.publicKey);
      setAgents((prev) => [agent, ...prev]);
      setNewAgent({ agent, privateKey: keyPair.privateKey });
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {newAgent && (
        <PrivateKeyModal result={newAgent} onClose={() => setNewAgent(null)} />
      )}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <button
          onClick={createAgent}
          disabled={creating}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
        >
          {creating ? "Generating keypair…" : "+ New Agent"}
        </button>
      </div>
      {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : agents.length === 0 ? (
        <p className="text-gray-500">No agents yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="pb-3 pr-4 font-medium">Agent ID</th>
                <th className="pb-3 pr-4 font-medium">Public Key</th>
                <th className="pb-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {agents.map((a) => (
                <tr key={a.agent_id} className="hover:bg-gray-900">
                  <td className="py-3 pr-4 font-mono text-xs text-indigo-400">{a.agent_id}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-400 truncate max-w-xs">{a.public_key}</td>
                  <td className="py-3 text-gray-500 text-xs">{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
