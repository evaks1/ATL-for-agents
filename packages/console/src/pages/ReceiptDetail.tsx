import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type ReceiptDetail } from "../api/client";
import { Badge } from "../components/Badge";

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.receipts
      .get(id)
      .then(setReceipt)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const exportDispute = async () => {
    if (!id) return;
    setExporting(true);
    try {
      const b = await api.disputes.export(id);
      setBundle(b as Record<string, unknown>);
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!receipt) return null;

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link to="/receipts" className="text-indigo-400 hover:underline text-sm">
          ← Receipts
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Receipt</h1>
        <span className="font-mono text-sm text-gray-400">{receipt.id}</span>
        {receipt.verification && (
          <Badge value={receipt.verification.decision} />
        )}
      </div>

      <div className="space-y-6">
        <Section title="Intent">
          <CodeBlock value={receipt.intent} />
        </Section>

        {receipt.verification && (
          <Section title="Verification">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500">Decision</dt>
              <dd><Badge value={receipt.verification.decision} /></dd>
              <dt className="text-gray-500">Reason</dt>
              <dd className="font-mono text-xs">{receipt.verification.reason_code}</dd>
              {receipt.verification.human_id && (
                <>
                  <dt className="text-gray-500">Authorized by</dt>
                  <dd className="font-mono text-xs text-indigo-400 break-all">{receipt.verification.human_id}</dd>
                </>
              )}
              {receipt.verification.challenge_id && (
                <>
                  <dt className="text-gray-500">Challenge</dt>
                  <dd className="font-mono text-xs">{receipt.verification.challenge_id}</dd>
                </>
              )}
              <dt className="text-gray-500">Verified At</dt>
              <dd className="text-xs text-gray-400">
                {new Date(receipt.verification.created_at).toLocaleString()}
              </dd>
            </dl>
          </Section>
        )}

        <Section title="Signatures">
          <CodeBlock value={receipt.signatures} />
        </Section>

        <div className="flex items-center gap-3">
          <button
            onClick={exportDispute}
            disabled={exporting}
            className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/40 text-amber-400 rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export Dispute Bundle"}
          </button>
        </div>

        {bundle && (
          <Section title="Dispute Bundle">
            <CodeBlock value={bundle} />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {title}
      </h2>
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        {children}
      </div>
    </div>
  );
}

function CodeBlock({ value }: { value: unknown }) {
  return (
    <pre className="text-xs font-mono text-gray-300 overflow-auto max-h-72 whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
