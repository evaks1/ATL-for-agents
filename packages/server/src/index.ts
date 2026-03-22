import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { redis } from "./lib/redis.js";
import { agentsRoutes } from "./routes/agents.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { delegationsRoutes } from "./routes/delegations.js";
import { verifyRoutes } from "./routes/verify.js";
import { approvalsRoutes } from "./routes/approvals.js";
import { disputesRoutes } from "./routes/disputes.js";
import { receiptsRoutes } from "./routes/receipts.js";

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "development" ? "info" : "warn",
  },
});

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: "1 minute",
  // Tighter limit on verify endpoint
});

// Health check
app.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

// Routes
await app.register(agentsRoutes);
await app.register(sessionsRoutes);
await app.register(delegationsRoutes);
await app.register(verifyRoutes);
await app.register(approvalsRoutes);
await app.register(disputesRoutes);
await app.register(receiptsRoutes);

// Tighter rate limit on verify
app.addHook("onRequest", async (req, reply) => {
  // Validation errors from zod surface as 400
});

app.setErrorHandler((error, _req, reply) => {
  if (error.name === "ZodError") {
    return reply.status(400).send({
      error: "Validation error",
      details: JSON.parse(error.message),
    });
  }
  app.log.error(error);
  return reply.status(error.statusCode ?? 500).send({
    error: error.message ?? "Internal server error",
  });
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await redis.connect();
  await app.listen({ port, host });
  app.log.info(`ATL server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
