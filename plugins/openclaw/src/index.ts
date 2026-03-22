/**
 * @atl/openclaw-plugin
 *
 * OpenClaw plugin that integrates Agent Trust Layer (ATL) permission enforcement.
 *
 * On startup:
 *   1. Reads config from openclaw.json: plugins.atl.{ serverUrl, grantId, toolMappings? }
 *   2. Mints an ATL session key (kept in memory, auto-refreshed)
 *   3. Starts a local HTTP server on plugins.atl.port (default 3001)
 *   4. Writes a dynamic SKILL.md to the workspace so Claude knows what to verify
 *
 * The skill instructs Claude to call POST /atl/verify before using any tool
 * that appears in the active tool map (built-in + user-defined toolMappings).
 *
 * Enforcement is soft (LLM follows skill instructions). The local /atl/verify
 * endpoint signs the intent and calls the ATL server, returning ALLOW/DENY/STEP_UP_REQUIRED.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { SessionManager, type Intent } from "./session-manager.js";
import { buildToolMap, type ToolMapping } from "./tool-mapper.js";

interface ATLPluginConfig {
  serverUrl: string;
  grantId: string;
  sessionTtlSeconds?: number;
  port?: number;
  toolMappings?: Record<string, ToolMapping>;
}

interface VerifyDecisionResponse {
  decision: "ALLOW" | "DENY" | "STEP_UP_REQUIRED";
  reason_code: string;
  receipt_id?: string;
  challenge_id?: string;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function writeSkill(
  workspaceDir: string,
  toolMap: Record<string, ToolMapping>,
  localPort: number
): Promise<void> {
  const toolList = Object.entries(toolMap)
    .map(([tool, { resource, action }]) => `  - \`${tool}\` → \`${resource}/${action}\``)
    .join("\n");

  const skillContent = `---
name: atl-guard
description: >
  ATL permission enforcement. Before using any privileged tool, call the local
  ATL verification endpoint to check your active UCAN delegation allows the action.
  Tools covered by ATL: ${Object.keys(toolMap).join(", ")}
---

# ATL Guard

You have an active ATL delegation that scopes what actions you are allowed to take.
Before using any of the following tools, you MUST call the ATL verify endpoint first:

${toolList}

## How to verify

Call the local ATL verify endpoint before the tool:

\`\`\`
POST http://localhost:${localPort}/atl/verify
Content-Type: application/json

{
  "tool": "<tool_name>",
  "resource": "<resource from map above>",
  "action": "<action from map above>",
  "amount": 0,           (optional — include for actions with a cost/size)
  "counterparty": ""     (optional — include a domain, address, or user)
}
\`\`\`

## Handling responses

- **ALLOW** — proceed with the tool call normally
- **DENY** — do NOT proceed. Tell the user the action was blocked and give the \`reason_code\`
- **STEP_UP_REQUIRED** — do NOT proceed yet. Tell the user they need to approve this action.
  Share the \`challenge_id\` and ask them to approve it in the ATL Console under Delegations,
  or via: POST http://localhost:3000/approvals/<challenge_id>/complete

## Important rules

1. Never skip the ATL check for tools in the list above
2. If the verify endpoint is unreachable, treat it as DENY and notify the user
3. For tools NOT in the list above, no ATL check is needed — proceed normally
4. The ATL check is per-action — each tool call needs its own verification
`;

  const skillDir = join(workspaceDir, "skills", "atl-guard");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), skillContent, "utf-8");
  console.log(`[ATL] Skill written to ${skillDir}/SKILL.md`);
}

export default async function atlPlugin(sdk: {
  config: unknown;
  workspace?: string;
  registerRoute?: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => void;
}) {
  const config = sdk.config as ATLPluginConfig;

  if (!config?.serverUrl || !config?.grantId) {
    console.error("[ATL] Missing required config: serverUrl and grantId. Plugin disabled.");
    return;
  }

  const localPort = config.port ?? 3001;
  const toolMap = buildToolMap(config.toolMappings);

  // Initialize session manager
  const sessionMgr = new SessionManager(
    config.serverUrl,
    config.grantId,
    config.sessionTtlSeconds
  );

  try {
    await sessionMgr.init();
    console.log(`[ATL] Session key minted for grant ${config.grantId}`);
  } catch (err) {
    console.error("[ATL] Failed to mint session key:", err);
    console.error("[ATL] Plugin will not enforce permissions. Check serverUrl and grantId.");
    return;
  }

  // Write dynamic skill to workspace
  const workspaceDir = sdk.workspace ?? join(homedir(), ".openclaw", "workspace");
  await writeSkill(workspaceDir, toolMap, localPort).catch((err) => {
    console.warn("[ATL] Could not write skill file:", err);
  });

  // Handler for POST /atl/verify
  async function handleVerify(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    let body: { tool?: string; resource?: string; action?: string; amount?: number; counterparty?: string };
    try {
      body = await readBody(req) as typeof body;
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { tool, resource, action, amount, counterparty } = body;

    // Resolve resource/action — either passed directly or looked up by tool name
    let resolvedResource = resource;
    let resolvedAction = action;

    if (tool && toolMap[tool]) {
      resolvedResource = resolvedResource ?? toolMap[tool].resource;
      resolvedAction = resolvedAction ?? toolMap[tool].action;
    }

    if (!resolvedResource || !resolvedAction) {
      sendJson(res, 400, { error: "Must provide resource+action or a known tool name" });
      return;
    }

    const intent: Intent = {
      resource: resolvedResource,
      action: resolvedAction,
      ...(amount !== undefined && { amount }),
      ...(counterparty !== undefined && { counterparty }),
    };

    let receipt;
    try {
      receipt = sessionMgr.signIntent(intent);
    } catch (err) {
      sendJson(res, 503, { error: "ATL session unavailable", detail: String(err) });
      return;
    }

    // Submit to ATL server
    let atlRes: Response;
    try {
      atlRes = await fetch(`${config.serverUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_receipt: receipt }),
      });
    } catch (err) {
      // Server unreachable — fail closed (DENY)
      sendJson(res, 200, {
        decision: "DENY",
        reason_code: "ATL_SERVER_UNREACHABLE",
      } satisfies VerifyDecisionResponse);
      return;
    }

    const result = await atlRes.json() as VerifyDecisionResponse;
    sendJson(res, 200, result);
  }

  // Register route if sdk.registerRoute is available (OpenClaw's plugin HTTP API)
  if (typeof sdk.registerRoute === "function") {
    sdk.registerRoute("POST", "/atl/verify", handleVerify);
    console.log(`[ATL] Route registered: POST /atl/verify`);
  } else {
    // Fallback: start a standalone HTTP server on localPort
    const server = createServer((req, res) => {
      if (req.url === "/atl/verify") {
        handleVerify(req, res).catch((err) => {
          sendJson(res, 500, { error: String(err) });
        });
      } else {
        sendJson(res, 404, { error: "Not found" });
      }
    });

    server.listen(localPort, "127.0.0.1", () => {
      console.log(`[ATL] Local verify server listening on http://127.0.0.1:${localPort}`);
    });
  }
}
