/**
 * @atl/sdk — Node.js SDK for Agent Trust Layer
 *
 * Usage:
 *   const atl = new ATLClient("http://localhost:3000");
 *   const agent = await atl.createAgent();
 *   const delegation = await atl.createDelegation({ ... });
 *   const session = await atl.mintSessionKey(delegation.grant_id);
 *   const receipt = atl.signIntentReceipt(session, { ... });
 *   const result = await atl.verifyIntent(receipt);
 *   await atl.verifyBeforeExecute(receipt, async () => { ... });
 */

import { generateKeyPair, sign, canonicalize } from "./crypto.js";

export interface ATLAgent {
  agent_id: string;
  public_key: string;
}

export interface ATLSessionKey {
  session_key_id: string;
  public_key: string;
  private_key: string;
  expires_at: string;
  grant_id: string;
}

export interface ATLDelegation {
  grant_id: string;
  ucan_token: string;
  expires_at: string;
}

export interface CapabilityConstraints {
  max_amount?: number;
  monthly_cap?: number;
  allowed_counterparties?: string[];
  step_up_threshold?: number;
  frequency_limit?: { count: number; window_seconds: number };
}

export interface Capability {
  resource: string;
  action: string;
  constraints?: CapabilityConstraints;
}

export interface Intent {
  action: string;
  resource: string;
  parameters?: Record<string, unknown>;
  amount?: number;
  counterparty?: string;
}

export interface IntentReceipt {
  grant_id: string;
  session_key_id: string;
  intent: {
    action: string;
    resource: string;
    parameters: Record<string, unknown>;
    amount?: number;
    counterparty?: string;
    timestamp: string;
    nonce: string;
  };
  signatures: {
    agent_signature: string;
    user_signature?: string;
  };
}

export interface VerifyResult {
  decision: "ALLOW" | "DENY" | "STEP_UP_REQUIRED";
  reason_code: string;
  receipt_id?: string;
  challenge_id?: string;
}

export class ATLClient {
  constructor(private readonly baseUrl: string) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as T & { error?: string };
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
    return data;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    const data = await res.json() as T;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return data;
  }

  /**
   * Register a new agent. Generates the keypair locally — private key never
   * leaves this process. Returns agent_id and the KeyPair (caller stores private key).
   */
  async createAgent(): Promise<ATLAgent & { key_pair: import("./crypto.js").KeyPair }> {
    const key_pair = generateKeyPair();
    const agent = await this.post<ATLAgent>("/agents", { public_key: key_pair.publicKey });
    return { ...agent, key_pair };
  }

  /** Create a delegation granting an agent scoped capabilities. */
  async createDelegation(params: {
    principal_id: string;
    agent_id: string;
    capabilities: Capability[];
    expires_in_seconds?: number;
  }): Promise<ATLDelegation> {
    return this.post<ATLDelegation>("/delegations", params);
  }

  /** Revoke a delegation immediately. */
  async revokeDelegation(grant_id: string): Promise<void> {
    await this.post(`/delegations/${grant_id}/revoke`, {});
  }

  /**
   * Mint an ephemeral session key bound to a delegation.
   * The keypair is generated locally — private key never sent to the server.
   */
  async mintSessionKey(
    grant_id: string,
    expires_in_seconds = 3600
  ): Promise<ATLSessionKey> {
    const key_pair = generateKeyPair();
    const result = await this.post<Omit<ATLSessionKey, "grant_id" | "private_key">>("/sessions", {
      grant_id,
      public_key: key_pair.publicKey,
      expires_in_seconds,
    });
    // Attach the locally-generated private key — server never saw it.
    return { ...result, private_key: key_pair.privateKey, grant_id };
  }

  /**
   * Sign an intent receipt with the session key.
   * Pure function — no network call.
   */
  signIntentReceipt(session: ATLSessionKey, intent: Intent): IntentReceipt {
    const fullIntent = {
      action: intent.action,
      resource: intent.resource,
      parameters: intent.parameters ?? {},
      ...(intent.amount !== undefined && { amount: intent.amount }),
      ...(intent.counterparty !== undefined && { counterparty: intent.counterparty }),
      timestamp: new Date().toISOString(),
      nonce: crypto.randomUUID(),
    };

    const receiptBase = {
      grant_id: session.grant_id,
      session_key_id: session.session_key_id,
      intent: fullIntent,
    };

    const canonical = canonicalize(receiptBase);
    const agent_signature = sign(session.private_key, canonical);

    return {
      ...receiptBase,
      signatures: { agent_signature },
    };
  }

  /** Submit a signed intent receipt for verification. */
  async verifyIntent(receipt: IntentReceipt): Promise<VerifyResult> {
    return this.post<VerifyResult>("/verify", { intent_receipt: receipt });
  }

  /**
   * Verify-before-execute middleware pattern.
   * Executes fn only if ATL returns ALLOW.
   * Throws for DENY or STEP_UP_REQUIRED.
   */
  async verifyBeforeExecute<T>(
    receipt: IntentReceipt,
    fn: () => Promise<T>
  ): Promise<T> {
    const result = await this.verifyIntent(receipt);
    if (result.decision === "ALLOW") {
      return fn();
    }
    if (result.decision === "STEP_UP_REQUIRED") {
      const err = new Error("Step-up authentication required");
      (err as Error & { challenge_id?: string; decision: string }).challenge_id = result.challenge_id;
      (err as Error & { decision: string }).decision = result.decision;
      throw err;
    }
    const err = new Error(`Action denied: ${result.reason_code}`);
    (err as Error & { decision: string; reason_code: string }).decision = result.decision;
    (err as Error & { reason_code: string }).reason_code = result.reason_code;
    throw err;
  }

  /** Complete a step-up challenge (simulates user approval). */
  async completeStepUp(challenge_id: string): Promise<{ decision: string }> {
    return this.post(`/approvals/${challenge_id}/complete`, {});
  }

  /** Export a dispute evidence bundle for a receipt. */
  async exportDisputeBundle(receipt_id: string): Promise<unknown> {
    return this.post("/disputes/export", { receipt_id });
  }

  async listAgents(): Promise<ATLAgent[]> {
    return this.get("/agents");
  }

  async listDelegations(): Promise<ATLDelegation[]> {
    return this.get("/delegations");
  }

  async listReceipts(): Promise<unknown[]> {
    return this.get("/receipts");
  }

  async getReceipt(receipt_id: string): Promise<unknown> {
    return this.get(`/receipts/${receipt_id}`);
  }
}

export { generateKeyPair, sign, canonicalize };
export type { KeyPair } from "./crypto.js";
