import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyIntentReceipt } from "../services/verification.service.js";
import { requireApiKey } from "../lib/apiKey.js";

const IntentSchema = z.object({
  action: z.string(),
  resource: z.string(),
  parameters: z.record(z.unknown()),
  amount: z.number().optional(),
  counterparty: z.string().optional(),
  timestamp: z.string(),
  nonce: z.string(),
});

const ReceiptBody = z.object({
  intent_receipt: z.object({
    grant_id: z.string().uuid(),
    session_key_id: z.string().uuid(),
    intent: IntentSchema,
    signatures: z.object({
      agent_signature: z.string(),
      user_signature: z.string().optional(),
    }),
  }),
});

export async function verifyRoutes(app: FastifyInstance) {
  app.post("/verify", { preHandler: requireApiKey }, async (req, reply) => {
    const { intent_receipt } = ReceiptBody.parse(req.body);
    const result = await verifyIntentReceipt(intent_receipt);

    return reply.status(200).send({
      decision: result.decision,
      reason_code: result.reason_code,
      receipt_id: result.receipt_id,
      human_id: result.human_id,
      ...(result.challenge_id && { challenge_id: result.challenge_id }),
    });
  });
}
