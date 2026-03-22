import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  receipts,
  verifications,
  delegations,
  auditLog,
} from "../db/schema.js";
import { hashSha256 } from "../lib/crypto.js";
import { appendAuditEvent } from "../lib/audit.js";
import { requireApiKey } from "../lib/apiKey.js";

const ExportBody = z.object({
  receipt_id: z.string().uuid(),
});

export async function disputesRoutes(app: FastifyInstance) {
  app.post("/disputes/export", { preHandler: requireApiKey }, async (req, reply) => {
    const { receipt_id } = ExportBody.parse(req.body);

    const [receipt] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.id, receipt_id));

    if (!receipt) {
      return reply.status(404).send({ error: "Receipt not found" });
    }

    const [delegation] = await db
      .select()
      .from(delegations)
      .where(eq(delegations.id, receipt.grantId));

    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.receiptId, receipt_id))
      .orderBy(desc(verifications.createdAt));

    // Get the latest audit hash at time of export
    const [latestAudit] = await db
      .select({ currentHash: auditLog.currentHash })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    const bundle = {
      delegation: {
        grant_id: delegation?.id,
        principal_id: delegation?.principalId,
        agent_id: delegation?.agentId,
        capabilities: delegation?.capabilities,
        status: delegation?.status,
        expires_at: delegation?.expiresAt,
        created_at: delegation?.createdAt,
        revoked_at: delegation?.revokedAt,
      },
      receipt: {
        id: receipt.id,
        grant_id: receipt.grantId,
        session_key_id: receipt.sessionKeyId,
        intent: receipt.intent,
        signatures: receipt.signatures,
        created_at: receipt.createdAt,
      },
      verification_snapshot: verification
        ? {
            decision: verification.decision,
            reason_code: verification.reasonCode,
            created_at: verification.createdAt,
          }
        : null,
      audit_hash: latestAudit?.currentHash ?? "no_audit_events",
      exported_at: new Date().toISOString(),
    };

    const bundleHash = hashSha256(JSON.stringify(bundle));

    await appendAuditEvent("dispute_exported", {
      receipt_id,
      bundle_hash: bundleHash,
    });

    return reply.status(200).send({ ...bundle, bundle_hash: bundleHash });
  });
}
