import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AgentsPage } from "./pages/Agents";
import { DelegationsPage } from "./pages/Delegations";
import { ReceiptsPage } from "./pages/Receipts";
import { ReceiptDetailPage } from "./pages/ReceiptDetail";
import { OpenClawPage } from "./pages/OpenClaw";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/agents" replace />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/delegations" element={<DelegationsPage />} />
        <Route path="/receipts" element={<ReceiptsPage />} />
        <Route path="/receipts/:id" element={<ReceiptDetailPage />} />
        <Route path="/openclaw" element={<OpenClawPage />} />
      </Routes>
    </Layout>
  );
}
