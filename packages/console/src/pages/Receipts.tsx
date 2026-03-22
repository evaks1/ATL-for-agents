import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, type Receipt } from "../api/client";

export function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.receipts
      .list()
      .then(setReceipts)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Intent Receipts</h1>
      {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : receipts.length === 0 ? (
        <p className="text-gray-500">No receipts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="pb-3 pr-4 font-medium">Receipt ID</th>
                <th className="pb-3 pr-4 font-medium">Grant ID</th>
                <th className="pb-3 pr-4 font-medium">Action</th>
                <th className="pb-3 pr-4 font-medium">Resource</th>
                <th className="pb-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-gray-900">
                  <td className="py-3 pr-4">
                    <Link
                      to={`/receipts/${r.id}`}
                      className="font-mono text-xs text-indigo-400 hover:underline"
                    >
                      {r.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-400">
                    {r.grant_id.slice(0, 8)}…
                  </td>
                  <td className="py-3 pr-4 text-xs font-mono text-gray-300">
                    {String(r.intent.action ?? "—")}
                  </td>
                  <td className="py-3 pr-4 text-xs font-mono text-gray-300">
                    {String(r.intent.resource ?? "—")}
                  </td>
                  <td className="py-3 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString()}
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
