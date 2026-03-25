import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions, delegations } from "../db/schema.js";
import { appendAuditEvent } from "../lib/audit.js";
import { requireApiKey } from "../lib/apiKey.js";

const CreateSessionBody = z.object({
  grant_id: z.string().uuid(),
  // Caller generates the session keypair locally and sends only the public key.
  // The server stores it for signature verification but never sees the private key.
  public_key: z.string().regex(/^[0-9a-f]{64}$/, "public_key must be a 64-char hex Ed25519 public key"),
  expires_in_seconds: z.number().int().positive().default(3600),
});

export async function sessionsRoutes(app: FastifyInstance) {
  app.post("/sessions", { preHandler: requireApiKey }, async (req, reply) => {
    const body = CreateSessionBody.parse(req.body);

    const [delegation] = await db
      .select()
      .from(delegations)
      .where(eq(delegations.id, body.grant_id));

    if (!delegation) {
      return reply.status(404).send({ error: "Delegation not found" });
    }
    if (delegation.status === "revoked") {
      return reply.status(400).send({ error: "Delegation is revoked" });
    }

    const expiresAt = new Date(Date.now() + body.expires_in_seconds * 1000);

    const [session] = await db
      .insert(sessions)
      .values({
        delegationId: body.grant_id,
        publicKey: body.public_key,
        expiresAt,
      })
      .returning();

    await appendAuditEvent("session_created", {
      session_id: session.id,
      grant_id: body.grant_id,
    });

    // Private key is NOT returned — the caller already has it.
    return reply.status(201).send({
      session_key_id: session.id,
      public_key: session.publicKey,
      expires_at: expiresAt,
    });
  });
}
