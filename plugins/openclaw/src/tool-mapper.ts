export interface ToolMapping {
  resource: string;
  action: string;
}

/**
 * Built-in mappings from OpenClaw tool names to ATL resource/action pairs.
 * These cover the standard OpenClaw tool set.
 */
const BUILT_IN_MAPPINGS: Record<string, ToolMapping> = {
  // File system
  "fs:read":      { resource: "fs://workspace", action: "read" },
  "fs:write":     { resource: "fs://workspace", action: "write" },
  "apply-patch":  { resource: "fs://workspace", action: "write" },

  // Shell execution
  "exec":         { resource: "exec://shell", action: "run" },
  "exec-approvals": { resource: "exec://shell", action: "run" },

  // Browser automation
  "browser":      { resource: "browser://web", action: "navigate" },
  "browser-login": { resource: "browser://web", action: "login" },
  "firecrawl":    { resource: "browser://web", action: "scrape" },

  // Web / search
  "web":          { resource: "web://search", action: "search" },
  "pdf":          { resource: "web://fetch", action: "read" },

  // Agent messaging
  "agent-send":   { resource: "agent://channel", action: "send" },
  "subagents":    { resource: "agent://spawn", action: "spawn" },
};

/**
 * Merge built-in mappings with user-supplied overrides/additions.
 * User mappings take precedence so any tool can be remapped locally.
 */
export function buildToolMap(
  userMappings: Record<string, ToolMapping> = {}
): Record<string, ToolMapping> {
  return { ...BUILT_IN_MAPPINGS, ...userMappings };
}

/**
 * Resolve a tool name to its ATL resource/action.
 * Returns null if the tool is not in the map (meaning no ATL check needed).
 */
export function resolveToolMapping(
  toolName: string,
  toolMap: Record<string, ToolMapping>
): ToolMapping | null {
  return toolMap[toolName] ?? null;
}
