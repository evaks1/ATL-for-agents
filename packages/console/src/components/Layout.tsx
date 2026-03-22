import { Link, useLocation } from "react-router-dom";

const NAV = [
  { path: "/agents", label: "Agents" },
  { path: "/delegations", label: "Delegations" },
  { path: "/receipts", label: "Receipts" },
  { path: "/openclaw", label: "OpenClaw" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-8">
        <Link to="/" className="text-lg font-bold tracking-tight text-white">
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
        <div className="ml-auto">
          <span className="text-xs text-gray-500 font-mono">ATL MVP v0.1</span>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
