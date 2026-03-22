# HAEL — Human-Agent Enterprise Layer

Cryptographic proof that a human authorized every AI agent action.

## Architecture

HAEL operates with three actors and three keypairs.

**Actors:**

| Actor | Role |
|-------|------|
| **Principal** | The human who holds authority. Generates an Ed25519 keypair offline. Signs a UCAN delegation with their private key. |
| **Agent** | The AI (Claude). Has a long-lived keypair registered with the server. Uses a short-lived session keypair for day-to-day signing. |
| **ATL Server** | Verifies every intent receipt through a 7-layer pipeline. Stores public keys only — never principal private keys. |

**Keypairs:**

| Keypair | Who holds private key | Stored on server | Lifetime |
|---------|----------------------|------------------|----------|
| Principal keypair | Human, offline | Never | Indefinite |
| Agent keypair | Creator (returned once at `POST /agents`) | Public key only | Indefinite |
| Session keypair | Agent, in memory only | Public key only | TTL-scoped (default 1 h) |

**Trust chain:**

```
Principal (human)
  │  Signs UCAN offline with principal private key
  ▼
UCAN delegation token  ──────────────────────────┐
  │  Stored on ATL server (grant_id)              │
  ▼                                               │
Agent session keypair (ephemeral)                 │
  │  Minted via POST /sessions                    │
  │  Private key held in memory only              │
  ▼                                               │
Signed intent receipt  ──►  POST /verify  ◄───────┘
                                  │
                        7-layer pipeline:
                        1. Timestamp tolerance
                        2. Delegation resolution
                        3. UCAN validation
                        4. Session validation
                        5. Agent signature check
                        6. Nonce replay protection
                        7. Capability policy
                                  │
                     ALLOW / DENY / STEP_UP_REQUIRED
```

## Quickstart (5 minutes)

```bash
# 1. Copy environment config
cp packages/server/.env.example packages/server/.env

# 2. Start Postgres and Redis
docker compose up -d postgres redis

# 3. Install dependencies and run migrations
pnpm install
SEED_API_KEY=demo-key-local pnpm db:migrate

# 4. Start the server
SEED_API_KEY=demo-key-local pnpm dev

# 5. In a second terminal, run the acceptance-criteria demo
SEED_API_KEY=demo-key-local pnpm demo
```

Expected output: all 9 steps pass with `✅`.

## Production Setup

In production a principal signs their own UCAN rather than relying on the server-side DEV MODE fallback. The `issue-delegation` script handles this in one command.

**First run — generates a new principal keypair:**

```bash
SEED_API_KEY=<your-api-key> pnpm --filter server issue-delegation
```

The script prints two env vars. Save them securely — the private key is never sent to the server:

```
PRINCIPAL_PRIVATE_KEY=<hex>
PRINCIPAL_PUBLIC_KEY=<hex>
AGENT_ID=<uuid>
```

**Subsequent runs — reuse existing keypair and agent:**

```bash
PRINCIPAL_PRIVATE_KEY=<hex> \
PRINCIPAL_PUBLIC_KEY=<hex> \
AGENT_ID=<uuid> \
SEED_API_KEY=<your-api-key> \
  pnpm --filter server issue-delegation
```

The script outputs a ready-to-paste `openclaw.json` snippet:

```json
{
  "plugins": {
    "atl": {
      "serverUrl": "https://your-hael-server.fly.dev",
      "grantId": "<grant_id>",
      "sessionTtlSeconds": 3600
    }
  }
}
```

Place this file at your workspace root before starting Claude Code.

## Claude Code / OpenClaw

HAEL ships a first-party Claude Code plugin that enforces delegation policies before every privileged tool use.

```bash
npm install -g @atl/openclaw-plugin
```

**Session key lifecycle:**

1. On startup, the plugin calls `POST /sessions` using the `grantId` from `openclaw.json` — minting a fresh ephemeral keypair.
2. The session private key is held **in memory only** — never written to disk.
3. The session key auto-refreshes 60 seconds before its TTL expires.
4. The `grantId` in `openclaw.json` is the **only persistent credential**. Rotating it requires running `issue-delegation` again.

```json
{
  "plugins": {
    "atl": {
      "serverUrl": "https://your-hael-server.fly.dev",
      "grantId": "<your-delegation-grant-id>",
      "sessionTtlSeconds": 3600
    }
  }
}
```

Claude will call `POST /atl/verify` before every privileged tool use.

## Other LLMs and Agent Frameworks

The HAEL server is LLM-agnostic. The OpenClaw plugin is Claude Code-specific, but two SDKs ship in the repo for integrating any other agent.

### Node.js / TypeScript agents (`packages/sdk-node`)

```typescript
import { ATLClient } from "@atl/sdk";

const atl = new ATLClient("https://your-hael-server.fly.dev");

// One-time setup: create agent + delegation (do this with issue-delegation script instead for production)
const agent = await atl.createAgent();
const delegation = await atl.createDelegation({
  principal_id: "my-principal",
  agent_id: agent.agent_id,
  capabilities: [{ resource: "*", action: "*", constraints: { step_up_threshold: 500 } }],
});

// On agent startup: mint a session key (hold in memory)
const session = await atl.mintSessionKey(delegation.grant_id);

// Before every privileged action: sign + verify
const receipt = atl.signIntentReceipt(session, {
  action: "execute",
  resource: "payment:transfer",
  amount: 200,
  counterparty: "acme-corp",
});

await atl.verifyBeforeExecute(receipt, async () => {
  // Your tool execution here — only runs if HAEL returns ALLOW
  await runPayment(...);
});
```

`verifyBeforeExecute` throws with `decision: "DENY"` or `decision: "STEP_UP_REQUIRED"` if the action is blocked. Catch the error in your agent's tool dispatcher.

### Python agents (`packages/sdk-python`)

```python
from atl_sdk import ATLClient

atl = ATLClient("https://your-hael-server.fly.dev")

# On startup: mint session key
session = atl.mint_session_key(grant_id="<your-grant-id>")

# Before every tool call
receipt = atl.sign_intent_receipt(session, {
    "action": "execute",
    "resource": "payment:transfer",
    "amount": 200,
    "counterparty": "acme-corp",
})

result = atl.verify_intent(receipt)
if result["decision"] == "ALLOW":
    run_payment(...)
elif result["decision"] == "STEP_UP_REQUIRED":
    # Prompt the human to approve via POST /approvals/:challenge_id/complete
    request_human_approval(result["challenge_id"])
```

### Integration pattern for any framework

The three-step pattern works the same regardless of framework (LangChain, AutoGen, GPT function calling, etc.):

```
1. On startup     →  POST /sessions  →  hold session keypair in memory
2. Before action  →  sign receipt locally (no network)  →  POST /verify
3. On ALLOW       →  execute the tool
   On DENY        →  abort, surface reason_code to user
   On STEP_UP     →  pause, send challenge_id to human for approval
```

| Framework | Integration point |
|-----------|------------------|
| LangChain | Wrap tools with a `before_run` hook that calls `verify_before_execute` |
| AutoGen | Subclass `ConversableAgent` and override `execute_function` |
| OpenAI function calling | Intercept tool calls before dispatching in your run loop |
| Any HTTP agent | Call `POST /verify` directly; check `decision` before executing |

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/agents` | ✓ | Register a new agent keypair |
| `GET`  | `/agents` | — | List all agents |
| `POST` | `/delegations` | ✓ | Issue a UCAN delegation from principal to agent |
| `GET`  | `/delegations` | — | List all delegations |
| `POST` | `/delegations/:grant_id/revoke` | ✓ | Revoke a delegation immediately |
| `POST` | `/sessions` | ✓ | Mint an ephemeral session key under a delegation |
| `POST` | `/verify` | ✓ | Submit a signed intent receipt for verification |
| `POST` | `/approvals/:challenge_id/complete` | ✓ | Complete a step-up challenge |
| `GET`  | `/receipts` | — | List all intent receipts |
| `GET`  | `/receipts/:id` | — | Get a receipt with its verification snapshot |
| `POST` | `/disputes/export` | ✓ | Export a cryptographic evidence bundle |

Auth ✓ = requires `x-api-key` header.

## How HAEL Differs

- **Per-action signed receipts** — every agent action produces an Ed25519-signed receipt that is stored and auditable, not just a session token that covers an entire conversation.
- **7-layer pipeline on every verify call** — timestamp tolerance, delegation resolution, UCAN validation, session validation, agent signature verification, nonce replay protection, and capability policy evaluation run on each `POST /verify`.
- **Dispute export** — `POST /disputes/export` returns a full cryptographic evidence bundle (delegation, receipt, verification snapshot, audit hash, bundle hash) suitable for legal or compliance review.

## Deploy to Fly.io

**Launch and deploy:**

```bash
fly launch    # first time: creates app, sets primary_region
fly deploy    # subsequent deploys
```

**Provision Postgres:**

```bash
# Option A: Fly-managed Postgres cluster
fly postgres create --name hael-db
fly postgres attach hael-db
# DATABASE_URL is set automatically after attach

# Option B: External Postgres (Supabase, Neon, etc.)
# Skip attach and set DATABASE_URL manually in secrets below
```

**Redis:**

Use [Upstash](https://upstash.com) (serverless Redis, free tier) or Fly Redis. Copy the `rediss://` connection URL.

**Set secrets:**

```bash
fly secrets set \
  DATABASE_URL="postgres://..." \
  REDIS_URL="rediss://..." \
  SEED_API_KEY="<strong-random-string>"
```

Then run migrations once via a one-off machine:

```bash
fly ssh console -C "node packages/server/dist/db/migrate.js"
```

Or set `SEED_API_KEY` and run migrations before deploying.

## Security Model

- **Principal private keys never leave the principal** — the HAEL server receives only the signed UCAN token, never the private key that produced it.
- **Ephemeral session keys** — session keypairs are short-lived and held in memory only. A compromised session key expires within its TTL window (default 1 hour).
- **Nonce replay protection** — each intent receipt includes a UUID nonce stored in Redis. The server rejects any receipt whose nonce has been seen before (24-hour window).
- **Hash-chained audit log** — every audit event records the SHA-256 hash of the previous event. The chain is tamper-evident: any insertion or modification invalidates all subsequent hashes.
- **`human_id` on every receipt** — the `delegation.principalId` (the principal's public key) is recorded in the `audit_log.human_id` column and returned in every `POST /verify` response, giving a verifiable link from action to human identity.

## Troubleshooting

**`Error: Missing x-api-key header`**
Start the server with `SEED_API_KEY=<value> pnpm dev`. Pass the same value as the `x-api-key` header on all mutating requests.

**`pnpm install` fails with `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY`**
The lockfile predates the `plugins/*` workspace entry. Delete `pnpm-lock.yaml` and run `pnpm install` again.

**`POST /sessions` returns `404 Delegation not found`**
The `grantId` in `openclaw.json` does not exist on this server. Run `pnpm --filter server issue-delegation` to create a new delegation, then update `openclaw.json` with the returned `grant_id`.

**`SIGNATURE_INVALID` on `POST /verify`**
The session key's `agent_id` does not match the delegation's `agent_id`. This typically means the session was minted under a different grant. Verify that `grantId` in `openclaw.json` corresponds to the correct agent, or re-run `issue-delegation` with the correct `AGENT_ID`.

## Self-host (Docker Compose)

```bash
docker compose up -d
```

Starts Postgres, Redis, the HAEL server (port 3000), and the console UI (port 5173).

## License

MIT
