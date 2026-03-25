const BASE = "/api";

// API key stored in localStorage so it persists across reloads.
// Falls back to demo-key-local for local development.
export function getApiKey(): string {
  return localStorage.getItem("atl_api_key") ?? "demo-key-local";
}
export function setApiKey(key: string) {
  localStorage.setItem("atl_api_key", key);
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    "x-api-key": getApiKey(),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  agents: {
    list: () => req<Agent[]>("GET", "/agents"),
    // Caller generates keypair locally and passes only the public key.
    create: (publicKey: string) => req<Agent>("POST", "/agents", { public_key: publicKey }),
  },
  delegations: {
    list: () => req<Delegation[]>("GET", "/delegations"),
    create: (body: CreateDelegationBody) =>
      req<Delegation>("POST", "/delegations", body),
    revoke: (grantId: string) =>
      req("POST", `/delegations/${grantId}/revoke`, {}),
  },
  sessions: {
    create: (body: { grant_id: string; public_key: string; expires_in_seconds?: number }) =>
      req<{ session_key_id: string; public_key: string; expires_at: string }>(
        "POST",
        "/sessions",
        body
      ),
  },
  receipts: {
    list: () => req<Receipt[]>("GET", "/receipts"),
    get: (id: string) => req<ReceiptDetail>("GET", `/receipts/${id}`),
  },
  verify: (body: {
    intent_receipt: {
      grant_id: string;
      session_key_id: string;
      intent: Record<string, unknown>;
      signatures: { agent_signature: string; user_signature?: string };
    };
  }) =>
    req<{
      decision: "ALLOW" | "DENY" | "STEP_UP_REQUIRED";
      reason_code: string;
      receipt_id?: string;
      human_id?: string;
      challenge_id?: string;
    }>("POST", "/verify", body),
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
    human_id?: string;
    challenge_id?: string;
    created_at: string;
  } | null;
}
