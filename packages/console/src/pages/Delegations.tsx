import { useState, useEffect } from "react";
import { api, type Delegation } from "../api/client";
import { Badge } from "../components/Badge";

export function DelegationsPage() {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = async () => {
    try {
      setDelegations(await api.delegations.list());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const revoke = async (grantId: string) => {
    setRevoking(grantId);
    try {
      await api.delegations.revoke(grantId);
      setDelegations((prev) =>
        prev.map((d) =>
          d.grant_id === grantId ? { ...d, status: "revoked" } : d
        )
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Delegations</h1>
      {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : delegations.length === 0 ? (
        <p className="text-gray-500">No delegations yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="pb-3 pr-4 font-medium">Grant ID</th>
                <th className="pb-3 pr-4 font-medium">Principal</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Capabilities</th>
                <th className="pb-3 pr-4 font-medium">Expires</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {delegations.map((d) => (
                <tr key={d.grant_id} className="hover:bg-gray-900">
                  <td className="py-3 pr-4 font-mono text-xs text-indigo-400">
                    {d.grant_id.slice(0, 8)}…
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-300">
                    {d.principal_id}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge value={d.status} />
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {d.capabilities.map((c, i) => (
                        <span
                          key={i}
                          className="text-xs font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-300"
                        >
                          {c.resource}/{c.action}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-500">
                    {new Date(d.expires_at).toLocaleString()}
                  </td>
                  <td className="py-3">
                    {d.status === "active" && (
                      <button
                        onClick={() => revoke(d.grant_id)}
                        disabled={revoking === d.grant_id}
                        className="px-2 py-1 text-xs bg-red-900/40 hover:bg-red-800/60 text-red-400 rounded transition-colors disabled:opacity-50"
                      >
                        {revoking === d.grant_id ? "…" : "Revoke"}
                      </button>
                    )}
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
