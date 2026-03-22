import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const delegationStatusEnum = pgEnum("delegation_status", [
  "active",
  "revoked",
]);

export const decisionEnum = pgEnum("decision", [
  "ALLOW",
  "DENY",
  "STEP_UP_REQUIRED",
]);

export const challengeStatusEnum = pgEnum("challenge_status", [
  "pending",
  "completed",
]);

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicKey: text("public_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const delegations = pgTable("delegations", {
  id: uuid("id").primaryKey().defaultRandom(),
  principalId: text("principal_id").notNull(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  ucanToken: text("ucan_token").notNull(),
  capabilities: jsonb("capabilities").notNull(),
  status: delegationStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  delegationId: uuid("delegation_id")
    .notNull()
    .references(() => delegations.id),
  publicKey: text("public_key").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  grantId: uuid("grant_id")
    .notNull()
    .references(() => delegations.id),
  sessionKeyId: uuid("session_key_id")
    .notNull()
    .references(() => sessions.id),
  intent: jsonb("intent").notNull(),
  signatures: jsonb("signatures").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => receipts.id),
  decision: decisionEnum("decision").notNull(),
  reasonCode: text("reason_code").notNull(),
  challengeId: uuid("challenge_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const challenges = pgTable("challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => receipts.id),
  status: challengeStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  humanId: text("human_id"),
  previousHash: text("previous_hash").notNull(),
  currentHash: text("current_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  principalId: text("principal_id").notNull(),
  name: text("name").notNull().default("default"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Delegation = typeof delegations.$inferSelect;
export type NewDelegation = typeof delegations.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type AuditEvent = typeof auditLog.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
