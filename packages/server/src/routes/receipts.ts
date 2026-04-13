import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { receipts, verifications, delegations } from "../db/schema.js";
import { requireApiKey } from "../lib/apiKey.js";

export async function receiptsRoutes(app: FastifyInstance) {
  app.get("/receipts", { preHandler: requireApiKey }, async (_req, reply) => {
    const rows = await db
      .select()
      .from(receipts)
      .orderBy(desc(receipts.createdAt));

    return reply.send(
      rows.map((r) => ({
        id: r.id,
        grant_id: r.grantId,
        session_key_id: r.sessionKeyId,
        intent: r.intent,
        created_at: r.createdAt,
      }))
    );
  });

  app.get(
    "/receipts/:id",
    { preHandler: requireApiKey },
    async (req: { params: { id: string } }, reply) => {
      const [receipt] = await db
        .select()
        .from(receipts)
        .where(eq(receipts.id, req.params.id));

      if (!receipt) {
        return reply.status(404).send({ error: "Receipt not found" });
      }

      const [verification] = await db
        .select()
        .from(verifications)
        .where(eq(verifications.receiptId, receipt.id))
        .orderBy(desc(verifications.createdAt));

      // Resolve human_id from the delegation's principalId
      let human_id: string | undefined;
      const [delegation] = await db
        .select()
        .from(delegations)
        .where(eq(delegations.id, receipt.grantId));
      if (delegation) human_id = delegation.principalId;

      return reply.send({
        id: receipt.id,
        grant_id: receipt.grantId,
        session_key_id: receipt.sessionKeyId,
        intent: receipt.intent,
        signatures: receipt.signatures,
        created_at: receipt.createdAt,
        verification: verification
          ? {
              decision: verification.decision,
              reason_code: verification.reasonCode,
              human_id,
              challenge_id: verification.challengeId,
              created_at: verification.createdAt,
            }
          : null,
      });
    }
  );
}
