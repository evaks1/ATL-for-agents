import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { receipts, verifications } from "../db/schema.js";

export async function receiptsRoutes(app: FastifyInstance) {
  app.get("/receipts", async (_req, reply) => {
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
              challenge_id: verification.challengeId,
              created_at: verification.createdAt,
            }
          : null,
      });
    }
  );
}
