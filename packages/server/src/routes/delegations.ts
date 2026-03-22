import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { delegations, agents } from "../db/schema.js";
import { issueUCAN, type UCANCapability } from "../lib/ucan.js";
import { generateKeyPair } from "../lib/crypto.js";
import { appendAuditEvent } from "../lib/audit.js";
import { requireApiKey } from "../lib/apiKey.js";

const ConstraintsSchema = z.object({
  max_amount: z.number().positive().optional(),
  monthly_cap: z.number().positive().optional(),
  allowed_counterparties: z.array(z.string()).optional(),
  step_up_threshold: z.number().positive().optional(),
  frequency_limit: z
    .object({
      count: z.number().int().positive(),
      window_seconds: z.number().int().positive(),
    })
    .optional(),
});

const CapabilitySchema = z.object({
  resource: z.string(),
  action: z.string(),
  constraints: ConstraintsSchema.optional(),
});

const CreateDelegationBody = z.object({
  principal_id: z.string(),
  agent_id: z.string().uuid(),
  capabilities: z.array(CapabilitySchema).min(1),
  expires_in_seconds: z.number().int().positive().default(86400),
  ucan_token: z.string().optional(),
});

export async function delegationsRoutes(app: FastifyInstance) {
  // Create delegation
  app.post("/delegations", { preHandler: requireApiKey }, async (req, reply) => {
    const body = CreateDelegationBody.parse(req.body);

    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, body.agent_id));

    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const caps: UCANCapability[] = body.capabilities as UCANCapability[];
    const expiresAt = new Date(Date.now() + body.expires_in_seconds * 1000);

    let ucanRaw: string;
    if (body.ucan_token) {
      // Production path: caller pre-signed the UCAN with their own key.
      ucanRaw = body.ucan_token;
    } else {
      // DEV MODE: server-generated key, not production-safe.
      const principalKey = generateKeyPair();
      ucanRaw = issueUCAN(
        principalKey,
        agent.publicKey,
        caps,
        body.expires_in_seconds
      ).raw;
    }

    const [delegation] = await db
      .insert(delegations)
      .values({
        principalId: body.principal_id,
        agentId: body.agent_id,
        ucanToken: ucanRaw,
        capabilities: caps as unknown as Record<string, unknown>[],
        expiresAt,
      })
      .returning();

    await appendAuditEvent("delegation_created", {
      grant_id: delegation.id,
      principal_id: body.principal_id,
      agent_id: body.agent_id,
    });

    return reply.status(201).send({
      grant_id: delegation.id,
      ucan_token: ucanRaw,
      expires_at: expiresAt,
    });
  });

  // List delegations
  app.get("/delegations", async (_req, reply) => {
    const rows = await db
      .select()
      .from(delegations)
      .orderBy(desc(delegations.createdAt));

    return reply.send(
      rows.map((d) => ({
        grant_id: d.id,
        principal_id: d.principalId,
        agent_id: d.agentId,
        status: d.status,
        capabilities: d.capabilities,
        expires_at: d.expiresAt,
        created_at: d.createdAt,
        revoked_at: d.revokedAt,
      }))
    );
  });

  // Revoke delegation
  app.post<{ Params: { grant_id: string } }>(
    "/delegations/:grant_id/revoke",
    { preHandler: requireApiKey },
    async (req, reply) => {
      const { grant_id } = req.params;

      const [delegation] = await db
        .select()
        .from(delegations)
        .where(eq(delegations.id, grant_id));

      if (!delegation) {
        return reply.status(404).send({ error: "Delegation not found" });
      }

      if (delegation.status === "revoked") {
        return reply.status(400).send({ error: "Already revoked" });
      }

      await db
        .update(delegations)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(eq(delegations.id, grant_id));

      await appendAuditEvent("delegation_revoked", { grant_id });

      return reply.status(200).send({ grant_id, status: "revoked" });
    }
  );
}
