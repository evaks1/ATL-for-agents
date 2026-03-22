import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { generateKeyPair } from "../lib/crypto.js";
import { desc } from "drizzle-orm";
import { requireApiKey } from "../lib/apiKey.js";

export async function agentsRoutes(app: FastifyInstance) {
  // Create agent
  app.post("/agents", { preHandler: requireApiKey }, async (_req, reply) => {
    const { publicKey } = generateKeyPair();

    const [agent] = await db
      .insert(agents)
      .values({ publicKey })
      .returning();

    return reply.status(201).send({
      agent_id: agent.id,
      public_key: agent.publicKey,
    });
  });

  // List agents
  app.get("/agents", async (_req, reply) => {
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
