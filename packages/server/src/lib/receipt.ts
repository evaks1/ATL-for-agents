import { randomUUID } from "crypto";
import { canonicalize, sign } from "./crypto.js";

export interface Intent {
  action: string;
  resource: string;
  parameters: Record<string, unknown>;
  amount?: number;
  counterparty?: string;
  timestamp: string;
  nonce: string;
}

export interface IntentReceipt {
  grant_id: string;
  session_key_id: string;
  intent: Intent;
  signatures: {
    agent_signature: string;
    user_signature?: string;
  };
}

export function buildReceipt(
  grant_id: string,
  session_key_id: string,
  intent: Omit<Intent, "timestamp" | "nonce"> & {
    timestamp?: string;
    nonce?: string;
  }
): Omit<IntentReceipt, "signatures"> {
  return {
    grant_id,
    session_key_id,
    intent: {
      ...intent,
      timestamp: intent.timestamp ?? new Date().toISOString(),
      nonce: intent.nonce ?? randomUUID(),
    },
  };
}

export function signReceipt(
  receipt: Omit<IntentReceipt, "signatures">,
  agentPrivateKeyHex: string
): IntentReceipt {
  const canonical = canonicalize(receipt);
  const agentSig = sign(agentPrivateKeyHex, canonical);
  return {
    ...receipt,
    signatures: {
      agent_signature: agentSig,
    },
  };
}

/** Sign with an additional user key (optional step-up flow) */
export function addUserSignature(
  receipt: IntentReceipt,
  userPrivateKeyHex: string
): IntentReceipt {
  const { signatures: _, ...base } = receipt;
  const canonical = canonicalize(base);
  const userSig = sign(userPrivateKeyHex, canonical);
  return {
    ...receipt,
    signatures: {
      ...receipt.signatures,
      user_signature: userSig,
    },
  };
}
