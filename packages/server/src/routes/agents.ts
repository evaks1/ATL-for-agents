import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { desc } from "drizzle-orm";
import { requireApiKey } from "../lib/apiKey.js";

const CreateAgentBody = z.object({
  // Caller generates the keypair locally and submits only the public key.
  // The server never sees the agent's private key.
  public_key: z.string().regex(/^[0-9a-f]{64}$/, "public_key must be a 64-char hex Ed25519 public key"),
});

export async function agentsRoutes(app: FastifyInstance) {
  // Register agent — private key stays with the caller, never sent here.
  app.post("/agents", { preHandler: requireApiKey }, async (req, reply) => {
    const { public_key } = CreateAgentBody.parse(req.body);

    const [agent] = await db
      .insert(agents)
      .values({ publicKey: public_key })
      .returning();

    return reply.status(201).send({
      agent_id: agent.id,
      public_key: agent.publicKey,
    });
  });

  // List agents
  app.get("/agents", { preHandler: requireApiKey }, async (_req, reply) => {
    const rows = await db
      .select()
      .from(agents)
      .orderBy(desc(agents.createdAt));

    return reply.send(
      rows.map((a) => ({
        agent_id: a.id,
        public_key: a.publicKey,
        created_at: a.createdAt,
      }))
    );
  });
}
