import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { randomBytes } from "crypto";

ed.etc.sha512Sync = (...m) => sha512(...m);

export interface SessionKey {
  session_key_id: string;
  public_key: string;
  private_key: string;
  expires_at: string;
  grant_id: string;
}

export interface Intent {
  action: string;
  resource: string;
  parameters?: Record<string, unknown>;
  amount?: number;
  counterparty?: string;
}

export interface SignedReceipt {
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
  };
}

/** Canonical JSON (keys sorted recursively, no whitespace) for deterministic signing. */
function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k]))
    .join(",");
  return "{" + sorted + "}";
}

function signMessage(privateKeyHex: string, message: string): string {
  const priv = hexToBytes(privateKeyHex);
  const msg = new TextEncoder().encode(message);
  const sig = ed.sign(msg, priv);
  return Buffer.from(sig).toString("base64url");
}

export class SessionManager {
  private session: SessionKey | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sessionTtlSeconds: number;

  constructor(
    private readonly serverUrl: string,
    private readonly grantId: string,
    sessionTtlSeconds = 3600
  ) {
    this.sessionTtlSeconds = sessionTtlSeconds;
  }

  async init(): Promise<void> {
    await this.mintSession();
  }

  private async mintSession(): Promise<void> {
    // Generate session keypair locally — private key never leaves this process.
    const privBytes = randomBytes(32);
    const privateKeyHex = bytesToHex(new Uint8Array(privBytes.buffer, privBytes.byteOffset, 32));
    const publicKeyHex = bytesToHex(ed.getPublicKey(new Uint8Array(privBytes.buffer, privBytes.byteOffset, 32)));

    const res = await fetch(`${this.serverUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_id: this.grantId,
        public_key: publicKeyHex,
        expires_in_seconds: this.sessionTtlSeconds,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(`ATL session mint failed: ${body.error ?? res.status}`);
    }

    const data = await res.json() as {
      session_key_id: string;
      public_key: string;
      expires_at: string;
    };

    // Attach our locally-generated private key — server never saw it.
    this.session = { ...data, private_key: privateKeyHex, grant_id: this.grantId };

    // Schedule refresh 60 seconds before expiry
    const expiresMs = new Date(data.expires_at).getTime();
    const refreshInMs = Math.max(0, expiresMs - Date.now() - 60_000);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.mintSession(), refreshInMs);
  }

  /** Sign an intent and return a ready-to-submit receipt. */
  signIntent(intent: Intent): SignedReceipt {
    if (!this.session) throw new Error("ATL session not initialized");

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
      grant_id: this.session.grant_id,
      session_key_id: this.session.session_key_id,
      intent: fullIntent,
    };

    const canonical = canonicalize(receiptBase);
    const agent_signature = signMessage(this.session.private_key, canonical);

    return { ...receiptBase, signatures: { agent_signature } };
  }

  destroy(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.session = null;
  }
}
