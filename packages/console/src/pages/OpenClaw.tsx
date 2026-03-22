import { useState } from "react";
import { api, type Agent, type Delegation, type Capability } from "../api/client";
import { CapabilityBuilder, type ToolMapping } from "../components/CapabilityBuilder";

const EXPIRY_OPTIONS = [
  { label: "1 hour", value: 3600 },
  { label: "8 hours", value: 28800 },
  { label: "24 hours", value: 86400 },
  { label: "7 days", value: 604800 },
  { label: "30 days", value: 2592000 },
];

type Step = 1 | 2 | 3;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ children, label }: { children: string; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500">{label}</span>
        <CopyButton text={children} />
      </div>
      <pre className="bg-gray-900 border border-gray-800 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap break-all">
        {children}
      </pre>
    </div>
  );
}

export function OpenClawPage() {
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [agentLabel, setAgentLabel] = useState("main");
  const [principalId, setPrincipalId] = useState("openclaw:user");
  const [registering, setRegistering] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);

  // Step 2 state
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [toolMappings, setToolMappings] = useState<Record<string, ToolMapping>>({});
  const [expirySeconds, setExpirySeconds] = useState(86400);
  const [creating, setCreating] = useState(false);
  const [delegation, setDelegation] = useState<Delegation | null>(null);

  const handleCapabilityChange = (caps: Capability[], mappings: Record<string, ToolMapping>) => {
    setCapabilities(caps);
    setToolMappings(mappings);
  };

  const registerAgent = async () => {
    setError(null);
    setRegistering(true);
    try {
      const a = await api.agents.create();
      setAgent(a);
      setStep(2);
    } catch (e) {
      setError(String(e));
    } finally {
      setRegistering(false);
    }
  };

  const createDelegation = async () => {
    if (!agent || capabilities.length === 0) return;
    setError(null);
    setCreating(true);
    try {
      const d = await api.delegations.create({
        principal_id: principalId,
        agent_id: agent.agent_id,
        capabilities,
        expires_in_seconds: expirySeconds,
      });
      setDelegation(d);
      setStep(3);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  // Generated config for Step 3
  const pluginConfig = (() => {
    if (!delegation) return "";
    const config: Record<string, unknown> = {
      serverUrl: "http://localhost:3000",
      grantId: delegation.grant_id,
    };
    if (Object.keys(toolMappings).length > 0) {
      config.toolMappings = toolMappings;
    }
    const full = {
      plugins: {
        atl: config,
      },
    };
    return JSON.stringify(full, null, 2);
  })();

  const installCmd = "npm install -g @atl/openclaw-plugin";
  const skillNote = `# After installing the plugin, add the skill to your workspace:
# cp ~/.openclaw/node_modules/@atl/openclaw-plugin/skills/atl-guard/SKILL.md \\
#    ~/.openclaw/workspace/skills/atl-guard/SKILL.md`;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">OpenClaw Integration</h1>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
          Set up ATL permissions for your OpenClaw agent
        </span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s
                  ? "bg-indigo-600 text-white"
                  : step > s
                  ? "bg-green-700 text-white"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {step > s ? "✓" : s}
            </div>
            <span className={`text-xs ${step === s ? "text-white" : "text-gray-500"}`}>
              {s === 1 ? "Register Agent" : s === 2 ? "Set Permissions" : "Export Config"}
            </span>
            {s < 3 && <div className="w-8 h-px bg-gray-800 mx-1" />}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4 bg-red-950/30 border border-red-900/50 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* ─── Step 1: Register ─── */}
      {step >= 1 && (
        <div className={`mb-6 rounded-xl border p-5 transition-opacity ${step !== 1 ? "opacity-60 border-gray-800" : "border-gray-700"}`}>
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span className="text-indigo-400">01</span> Register ATL Agent
          </h2>

          {agent ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 w-24">Agent label</span>
                <span className="font-mono text-white">{agentLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 w-24">Agent ID</span>
                <span className="font-mono text-indigo-400 text-xs">{agent.agent_id}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 w-24">Public key</span>
                <span className="font-mono text-gray-400 text-xs truncate max-w-xs">{agent.public_key}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    OpenClaw agent name
                  </label>
                  <input
                    type="text"
                    value={agentLabel}
                    onChange={(e) => setAgentLabel(e.target.value)}
                    placeholder="main"
                    className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Your agent ID in openclaw.json (e.g. main, home, work)
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Principal ID
                  </label>
                  <input
                    type="text"
                    value={principalId}
                    onChange={(e) => setPrincipalId(e.target.value)}
                    placeholder="openclaw:user"
                    className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Who is granting permissions (identifies you)
                  </p>
                </div>
              </div>
              <button
                onClick={registerAgent}
                disabled={registering || !agentLabel.trim() || !principalId.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {registering ? "Registering…" : "Register Agent with ATL"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 2: Permissions ─── */}
      {step >= 2 && (
        <div className={`mb-6 rounded-xl border p-5 transition-opacity ${step !== 2 ? "opacity-60 border-gray-800" : "border-gray-700"}`}>
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span className="text-indigo-400">02</span> Set Permissions
          </h2>

          {delegation ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-24">Grant ID</span>
                <span className="font-mono text-indigo-400 text-xs">{delegation.grant_id}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-24">Capabilities</span>
                <div className="flex flex-wrap gap-1">
                  {capabilities.map((c, i) => (
                    <span key={i} className="font-mono text-xs bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">
                      {c.resource}/{c.action}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-24">Expires</span>
                <span className="text-gray-400 text-xs">{new Date(delegation.expires_at).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <CapabilityBuilder onChange={handleCapabilityChange} />

              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Delegation expires in</label>
                  <select
                    value={expirySeconds}
                    onChange={(e) => setExpirySeconds(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={createDelegation}
                disabled={creating || capabilities.length === 0}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {creating
                  ? "Creating…"
                  : capabilities.length === 0
                  ? "Select at least one capability"
                  : `Create Delegation (${capabilities.length} ${capabilities.length === 1 ? "capability" : "capabilities"})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 3: Export Config ─── */}
      {step === 3 && delegation && (
        <div className="rounded-xl border border-gray-700 p-5 space-y-5">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="text-indigo-400">03</span> Export Config
          </h2>

          <p className="text-sm text-gray-400">
            Add the following to your{" "}
            <code className="text-indigo-400 text-xs bg-gray-900 px-1 py-0.5 rounded">
              ~/.openclaw/openclaw.json
            </code>{" "}
            under the root object, then install the plugin.
          </p>

          <CodeBlock label="~/.openclaw/openclaw.json (merge this in)">{pluginConfig}</CodeBlock>

          <CodeBlock label="Install plugin">{installCmd}</CodeBlock>

          <CodeBlock label="Add the ATL guard skill to your workspace">{skillNote}</CodeBlock>

          <div className="rounded-lg bg-amber-950/30 border border-amber-800/40 px-4 py-3 text-xs text-amber-300 space-y-1">
            <p className="font-semibold">Add more tool mappings locally at any time</p>
            <p>
              To cover custom skills/tools your agent has, add entries under{" "}
              <code className="bg-amber-950 px-1 rounded">plugins.atl.toolMappings</code> in your config:
            </p>
            <pre className="mt-1 text-amber-200/80 font-mono">
{`"toolMappings": {
  "my-custom-tool": { "resource": "myservice://api", "action": "call" },
  "spotify-player": { "resource": "spotify://player", "action": "play" }
}`}
            </pre>
            <p>No code changes needed — the plugin and skill pick these up automatically.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <a
              href="/delegations"
              className="text-xs text-indigo-400 hover:text-indigo-300 underline"
            >
              View delegation in Delegations →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
