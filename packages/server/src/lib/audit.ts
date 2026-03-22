import { db } from "../db/index.js";
import { auditLog } from "../db/schema.js";
import { hashSha256 } from "./crypto.js";
import { desc } from "drizzle-orm";

export type AuditEventType =
  | "delegation_created"
  | "delegation_revoked"
  | "session_created"
  | "receipt_verified"
  | "step_up_initiated"
  | "step_up_completed"
  | "dispute_exported";

export async function appendAuditEvent(
  eventType: AuditEventType,
  payload: Record<string, unknown>
): Promise<void> {
  const lastRow = await db
    .select({ currentHash: auditLog.currentHash })
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  const previousHash =
    lastRow.length > 0 ? lastRow[0].currentHash : "genesis";

  const eventData = {
    event_type: eventType,
    payload,
    previous_hash: previousHash,
    timestamp: new Date().toISOString(),
  };

  const currentHash = hashSha256(JSON.stringify(eventData));

  const humanId =
    typeof payload.human_id === "string" ? payload.human_id : null;

  await db.insert(auditLog).values({
    eventType,
    payload,
    humanId,
    previousHash,
    currentHash,
  });
}
