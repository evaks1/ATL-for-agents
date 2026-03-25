import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getApiKey, setApiKey } from "../api/client";

const NAV = [
  { path: "/agents", label: "Agents" },
  { path: "/delegations", label: "Delegations" },
  { path: "/receipts", label: "Receipts" },
  { path: "/openclaw", label: "OpenClaw" },
  { path: "/verify", label: "Verify" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState(getApiKey());

  const saveKey = () => {
    setApiKey(keyDraft);
    setEditingKey(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-8">
        <Link to="/" className="text-lg font-bold tracking-tight text-white shrink-0">
          🔐 ATL Console
        </Link>
        <nav className="flex gap-1">
          {NAV.map((n) => (
            <Link
              key={n.path}
              to={n.path}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                pathname.startsWith(n.path)
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {editingKey ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveKey()}
                className="px-2 py-1 text-xs font-mono rounded bg-gray-900 border border-gray-600 text-white w-48 focus:border-indigo-500 focus:outline-none"
                placeholder="x-api-key"
              />
              <button onClick={saveKey} className="px-2 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white">
                Save
              </button>
              <button onClick={() => setEditingKey(false)} className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setKeyDraft(getApiKey()); setEditingKey(true); }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Set API key"
            >
              <span>🔑</span>
              <span className="font-mono">{getApiKey().slice(0, 14)}…</span>
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
