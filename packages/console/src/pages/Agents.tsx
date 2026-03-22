import { useState, useEffect } from "react";
import { api, type Agent } from "../api/client";

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const agent = await api.agents.create();
      setAgents((prev) => [agent, ...prev]);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <button
          onClick={createAgent}
          disabled={creating}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
        >
          {creating ? "Creating…" : "+ New Agent"}
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
                  <td className="py-3 pr-4 font-mono text-xs text-indigo-400">
                    {a.agent_id}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-400 truncate max-w-xs">
                    {a.public_key}
                  </td>
                  <td className="py-3 text-gray-500 text-xs">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
