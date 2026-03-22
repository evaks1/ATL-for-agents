import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  delegations,
  sessions,
  receipts,
  verifications,
  challenges,
} from "../db/schema.js";
import { verify as verifySignature, canonicalize } from "../lib/crypto.js";
import { parseUCAN, type UCANCapability } from "../lib/ucan.js";
import { checkNonce } from "../lib/redis.js";
import { evaluatePolicy } from "./policy.service.js";
import { appendAuditEvent } from "../lib/audit.js";
import type { IntentReceipt } from "../lib/receipt.js";

export type VerifyDecision = "ALLOW" | "DENY" | "STEP_UP_REQUIRED";

export interface VerifyResult {
  decision: VerifyDecision;
  reason_code: string;
  receipt_id?: string;
  challenge_id?: string;
  human_id?: string;
}

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export async function verifyIntentReceipt(
  intentReceipt: IntentReceipt
): Promise<VerifyResult> {
  const { grant_id, session_key_id, intent, signatures } = intentReceipt;

  // 1. Timestamp tolerance
  const intentTime = new Date(intent.timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - intentTime) > TIMESTAMP_TOLERANCE_MS) {
    return { decision: "DENY", reason_code: "TIMESTAMP_OUT_OF_RANGE" };
  }

  // 2. Resolve delegation
  const [delegation] = await db
    .select()
    .from(delegations)
    .where(eq(delegations.id, grant_id));

  if (!delegation) {
    return { decision: "DENY", reason_code: "DELEGATION_NOT_FOUND" };
  }

  if (delegation.status === "revoked") {
    return { decision: "DENY", reason_code: "DELEGATION_REVOKED" };
  }

  if (delegation.expiresAt < new Date()) {
    return { decision: "DENY", reason_code: "DELEGATION_EXPIRED" };
  }

  // 3. Validate UCAN token
  let caps: UCANCapability[];
  try {
    const parsed = parseUCAN(delegation.ucanToken);
    if (parsed.isExpired) {
      return { decision: "DENY", reason_code: "UCAN_EXPIRED" };
    }
    caps = parsed.payload.att;
  } catch (err) {
    return { decision: "DENY", reason_code: "UCAN_INVALID" };
  }

  // 4. Validate session key
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, session_key_id));

  if (!session) {
    return { decision: "DENY", reason_code: "SESSION_NOT_FOUND" };
  }

  if (session.delegationId !== grant_id) {
    return { decision: "DENY", reason_code: "SESSION_DELEGATION_MISMATCH" };
  }

  if (session.expiresAt < new Date()) {
    return { decision: "DENY", reason_code: "SESSION_EXPIRED" };
  }

  // 5. Verify agent signature
  const { signatures: _sigs, ...receiptBase } = intentReceipt;
  const canonical = canonicalize(receiptBase);
  const sigValid = verifySignature(
    session.publicKey,
    canonical,
    signatures.agent_signature
  );

  if (!sigValid) {
    return { decision: "DENY", reason_code: "SIGNATURE_INVALID" };
  }

  // 6. Nonce replay protection
  const nonceOk = await checkNonce(intent.nonce);
  if (!nonceOk) {
    return { decision: "DENY", reason_code: "NONCE_REPLAYED" };
  }

  // 7. Policy evaluation
  const policyResult = await evaluatePolicy(caps, grant_id, {
    action: intent.action,
    resource: intent.resource,
    amount: intent.amount,
    counterparty: intent.counterparty,
  });

  // 8. Store receipt
  const [receipt] = await db
    .insert(receipts)
    .values({
      grantId: grant_id,
      sessionKeyId: session_key_id,
      intent: intent as unknown as Record<string, unknown>,
      signatures: signatures as Record<string, unknown>,
    })
    .returning();

  // 9. Handle step-up
  let challengeId: string | undefined;
  if (policyResult.decision === "STEP_UP_REQUIRED") {
    const [challenge] = await db
      .insert(challenges)
      .values({ receiptId: receipt.id })
      .returning();
    challengeId = challenge.id;
  }

  // 10. Store verification
  await db.insert(verifications).values({
    receiptId: receipt.id,
    decision: policyResult.decision,
    reasonCode: policyResult.reason_code,
    challengeId: challengeId ?? null,
  });

  const human_id = delegation.principalId;

  // 11. Audit
  await appendAuditEvent("receipt_verified", {
    receipt_id: receipt.id,
    grant_id,
    decision: policyResult.decision,
    reason_code: policyResult.reason_code,
    human_id,
  });

  return {
    decision: policyResult.decision,
    reason_code: policyResult.reason_code,
    receipt_id: receipt.id,
    challenge_id: challengeId,
    human_id,
  };
}
