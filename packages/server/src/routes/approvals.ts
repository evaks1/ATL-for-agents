import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { challenges, verifications, receipts } from "../db/schema.js";
import { appendAuditEvent } from "../lib/audit.js";
import { requireApiKey } from "../lib/apiKey.js";

export async function approvalsRoutes(app: FastifyInstance) {
  app.post<{ Params: { challenge_id: string } }>(
    "/approvals/:challenge_id/complete",
    { preHandler: requireApiKey },
    async (req, reply) => {
      const { challenge_id } = req.params;

      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, challenge_id));

      if (!challenge) {
        return reply.status(404).send({ error: "Challenge not found" });
      }

      if (challenge.status === "completed") {
        return reply.status(400).send({ error: "Challenge already completed" });
      }

      await db
        .update(challenges)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(challenges.id, challenge_id));

      // Update the verification record to ALLOW
      await db
        .update(verifications)
        .set({ decision: "ALLOW", reasonCode: "STEP_UP_COMPLETED" })
        .where(eq(verifications.challengeId, challenge_id));

      // Get receipt for audit
      const [verification] = await db
        .select()
        .from(verifications)
        .where(eq(verifications.challengeId, challenge_id));

      await appendAuditEvent("step_up_completed", {
        challenge_id,
        receipt_id: challenge.receiptId,
      });

      return reply.status(200).send({
        challenge_id,
        status: "completed",
        decision: "ALLOW",
      });
    }
  );
}
