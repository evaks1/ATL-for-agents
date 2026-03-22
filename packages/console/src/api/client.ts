const BASE = "/api";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  agents: {
    list: () => req<Agent[]>("GET", "/agents"),
    create: () => req<Agent>("POST", "/agents", {}),
  },
  delegations: {
    list: () => req<Delegation[]>("GET", "/delegations"),
    create: (body: CreateDelegationBody) =>
      req<Delegation>("POST", "/delegations", body),
    revoke: (grantId: string) =>
      req("POST", `/delegations/${grantId}/revoke`, {}),
  },
  receipts: {
    list: () => req<Receipt[]>("GET", "/receipts"),
    get: (id: string) => req<ReceiptDetail>("GET", `/receipts/${id}`),
  },
  disputes: {
    export: (receiptId: string) =>
      req("POST", "/disputes/export", { receipt_id: receiptId }),
  },
};

export interface CreateDelegationBody {
  principal_id: string;
  agent_id: string;
  capabilities: Capability[];
  expires_in_seconds?: number;
}

export interface Agent {
  agent_id: string;
  public_key: string;
  created_at: string;
}

export interface Capability {
  resource: string;
  action: string;
  constraints?: Record<string, unknown>;
}

export interface Delegation {
  grant_id: string;
  principal_id: string;
  agent_id: string;
  status: "active" | "revoked";
  capabilities: Capability[];
  expires_at: string;
  created_at: string;
  revoked_at?: string;
}

export interface Receipt {
  id: string;
  grant_id: string;
  session_key_id: string;
  intent: Record<string, unknown>;
  created_at: string;
}

export interface ReceiptDetail extends Receipt {
  signatures: Record<string, string>;
  verification: {
    decision: "ALLOW" | "DENY" | "STEP_UP_REQUIRED";
    reason_code: string;
    challenge_id?: string;
    created_at: string;
  } | null;
}
