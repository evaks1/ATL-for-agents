/**
 * issue-delegation.ts
 *
 * Production helper: sign a UCAN with a principal's own Ed25519 key
 * and create a delegation on the HAEL server.
 *
 * First run (generates a new principal keypair):
 *   SEED_API_KEY=<key> pnpm issue-delegation
 *
 * Subsequent runs (reuse existing keypair + agent):
 *   PRINCIPAL_PRIVATE_KEY=<hex> \
 *   PRINCIPAL_PUBLIC_KEY=<hex> \
 *   AGENT_ID=<uuid> \
 *   SEED_API_KEY=<key> \
 *   pnpm issue-delegation
 *
 * Optional env vars:
 *   ATL_URL             — defaults to http://localhost:3000
 *   EXPIRES_IN_SECONDS  — defaults to 86400 (24 h)
 */

import "dotenv/config";
import { generateKeyPair } from "../src/lib/crypto.js";
import { issueUCAN, type UCANCapability } from "../src/lib/ucan.js";

const BASE = process.env.ATL_URL ?? "http://localhost:3000";
const API_KEY = process.env.SEED_API_KEY ?? "";
const EXPIRES_IN_SECONDS = parseInt(process.env.EXPIRES_IN_SECONDS ?? "86400", 10);

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) {
    throw new Error(`POST ${path} → HTTP ${res.status}: ${(data as { error?: string }).error}`);
  }
  return data as T;
}

async function getAgents(): Promise<Array<{ agent_id: string; public_key: string }>> {
  const res = await fetch(`${BASE}/agents`, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) throw new Error(`GET /agents → HTTP ${res.status}`);
  return res.json() as Promise<Array<{ agent_id: string; public_key: string }>>;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log("HAEL — Issue Principal Delegation");
  console.log("=".repeat(50));

  // Phase 1: Resolve principal keypair
  let principalKey: { privateKey: string; publicKey: string };

  if (process.env.PRINCIPAL_PRIVATE_KEY) {
    if (!process.env.PRINCIPAL_PUBLIC_KEY) {
      console.error(
        "Error: PRINCIPAL_PUBLIC_KEY is required when PRINCIPAL_PRIVATE_KEY is set."
      );
      process.exit(1);
    }
    principalKey = {
      privateKey: process.env.PRINCIPAL_PRIVATE_KEY,
      publicKey: process.env.PRINCIPAL_PUBLIC_KEY,
    };
    console.log("\nUsing existing principal keypair.");
    console.log(`  public_key: ${principalKey.publicKey.slice(0, 16)}…`);
  } else {
    principalKey = generateKeyPair();
    console.log("\nGenerated new principal keypair.");
    console.log("  Save these — the private key cannot be recovered:\n");
    console.log(`  PRINCIPAL_PRIVATE_KEY=${principalKey.privateKey}`);
    console.log(`  PRINCIPAL_PUBLIC_KEY=${principalKey.publicKey}\n`);
  }

  // Phase 2: Resolve agent
  let agentId: string;
  let agentPublicKey: string;

  if (process.env.AGENT_ID) {
    agentId = process.env.AGENT_ID;
    const agents = await getAgents();
    const agent = agents.find((a) => a.agent_id === agentId);
    if (!agent) {
      console.error(`Error: Agent ${agentId} not found on server.`);
      process.exit(1);
    }
    agentPublicKey = agent.public_key;
    console.log(`\nUsing existing agent: ${agentId}`);
  } else {
    const agent = await post<{ agent_id: string; public_key: string }>("/agents", {});
    agentId = agent.agent_id;
    agentPublicKey = agent.public_key;
    console.log(`\nCreated new agent:`);
    console.log(`  agent_id:   ${agentId}`);
    console.log(`  public_key: ${agentPublicKey.slice(0, 16)}…`);
    console.log(`\n  Set this for future runs:`);
    console.log(`  AGENT_ID=${agentId}`);
  }

  // Phase 3: Issue UCAN locally (no network call — principal key never leaves this process)
  const capabilities: UCANCapability[] = [
    {
      resource: "*",
      action: "*",
      constraints: {
        step_up_threshold: 500,
      },
    },
  ];

  const ucan = issueUCAN(principalKey, agentPublicKey, capabilities, EXPIRES_IN_SECONDS);
  const expiresAt = new Date(Date.now() + EXPIRES_IN_SECONDS * 1000);
  console.log(`\nUCAN signed locally (principal key never sent to server).`);
  console.log(`  expires: ${expiresAt.toISOString()}`);

  // Phase 4: Create delegation with pre-signed UCAN
  const delegation = await post<{
    grant_id: string;
    ucan_token: string;
    expires_at: string;
  }>("/delegations", {
    principal_id: principalKey.publicKey,
    agent_id: agentId,
    capabilities,
    expires_in_seconds: EXPIRES_IN_SECONDS,
    ucan_token: ucan.raw,
  });

  // Phase 5: Output
  console.log(`\nDelegation created:`);
  console.log(`  grant_id:   ${delegation.grant_id}`);
  console.log(`  expires_at: ${delegation.expires_at}`);

  const openclaw = {
    plugins: {
      atl: {
        serverUrl: BASE,
        grantId: delegation.grant_id,
        sessionTtlSeconds: 3600,
      },
    },
  };

  console.log("\n" + "─".repeat(50));
  console.log("Add this to your openclaw.json:\n");
  console.log(JSON.stringify(openclaw, null, 2));
  console.log("─".repeat(50) + "\n");
}

run().catch((err: Error) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
