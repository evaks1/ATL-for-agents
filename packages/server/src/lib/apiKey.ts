import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";

declare module "fastify" {
  interface FastifyRequest {
    principalId: string;
  }
}

export async function requireApiKey(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const key = req.headers["x-api-key"];
  if (!key || typeof key !== "string") {
    return reply.status(401).send({ error: "Missing x-api-key header" });
  }

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.key, key));

  if (!row) {
    return reply.status(401).send({ error: "Invalid API key" });
  }

  req.principalId = row.principalId;
}
