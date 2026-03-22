import { useState, useEffect } from "react";
import type { Capability } from "../api/client";

// Maps OpenClaw tool name → ATL resource/action
export interface ToolMapping {
  resource: string;
  action: string;
}

interface ConstraintState {
  step_up_threshold?: number;
  frequency_limit?: { count: number; window_seconds: number };
  allowed_counterparties?: string;
}

interface PresetState {
  enabled: boolean;
  constraints: ConstraintState;
}

interface CustomCap {
  id: string;
  toolName: string;
  resource: string;
  action: string;
  constraints: ConstraintState;
}

const PRESETS: {
  id: string;
  label: string;
  resource: string;
  action: string;
  constraintFields: Array<"step_up_threshold" | "frequency_limit" | "allowed_counterparties">;
}[] = [
  {
    id: "fs:read",
    label: "File System — Read",
    resource: "fs://workspace",
    action: "read",
    constraintFields: [],
  },
  {
    id: "fs:write",
    label: "File System — Write",
    resource: "fs://workspace",
    action: "write",
    constraintFields: ["step_up_threshold"],
  },
  {
    id: "exec",
    label: "Shell Exec",
    resource: "exec://shell",
    action: "run",
    constraintFields: ["step_up_threshold", "frequency_limit"],
  },
  {
    id: "browser",
    label: "Browser",
    resource: "browser://web",
    action: "navigate",
    constraintFields: ["allowed_counterparties"],
  },
  {
    id: "web",
    label: "Web Search",
    resource: "web://search",
    action: "search",
    constraintFields: ["frequency_limit"],
  },
  {
    id: "agent",
    label: "Agent Messages",
    resource: "agent://channel",
    action: "send",
    constraintFields: ["allowed_counterparties"],
  },
];

interface Props {
  onChange: (
    capabilities: Capability[],
    toolMappings: Record<string, ToolMapping>
  ) => void;
}

export function CapabilityBuilder({ onChange }: Props) {
  const [presets, setPresets] = useState<Record<string, PresetState>>(
    Object.fromEntries(PRESETS.map((p) => [p.id, { enabled: false, constraints: {} }]))
  );
  const [customs, setCustoms] = useState<CustomCap[]>([]);
  const [newCustom, setNewCustom] = useState({
    toolName: "",
    resource: "",
    action: "",
  });

  // Emit updated caps + toolMappings whenever state changes
  useEffect(() => {
    const caps: Capability[] = [];
    const toolMappings: Record<string, ToolMapping> = {};

    PRESETS.forEach((p) => {
      const state = presets[p.id];
      if (!state.enabled) return;
      const c = state.constraints;
      const constraints: Capability["constraints"] = {};
      if (c.step_up_threshold !== undefined && c.step_up_threshold > 0)
        constraints.step_up_threshold = c.step_up_threshold;
      if (c.frequency_limit)
        constraints.frequency_limit = c.frequency_limit;
      if (c.allowed_counterparties?.trim())
        constraints.allowed_counterparties = c.allowed_counterparties
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      caps.push({ resource: p.resource, action: p.action, constraints });
    });

    customs.forEach((cu) => {
      const constraints: Capability["constraints"] = {};
      if (cu.constraints.step_up_threshold !== undefined && cu.constraints.step_up_threshold > 0)
        constraints.step_up_threshold = cu.constraints.step_up_threshold;
      if (cu.constraints.frequency_limit)
        constraints.frequency_limit = cu.constraints.frequency_limit;
      if (cu.constraints.allowed_counterparties?.trim())
        constraints.allowed_counterparties = cu.constraints.allowed_counterparties
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      caps.push({ resource: cu.resource, action: cu.action, constraints });
      if (cu.toolName.trim()) {
        toolMappings[cu.toolName.trim()] = { resource: cu.resource, action: cu.action };
      }
    });

    onChange(caps, toolMappings);
  }, [presets, customs]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePreset = (id: string) => {
    setPresets((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id].enabled },
    }));
  };

  const updateConstraint = (id: string, field: string, value: unknown) => {
    setPresets((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        constraints: { ...prev[id].constraints, [field]: value },
      },
    }));
  };

  const addCustom = () => {
    if (!newCustom.resource.trim() || !newCustom.action.trim()) return;
    setCustoms((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ...newCustom, constraints: {} },
    ]);
    setNewCustom({ toolName: "", resource: "", action: "" });
  };

  const removeCustom = (id: string) => {
    setCustoms((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-3">
      {PRESETS.map((p) => {
        const state = presets[p.id];
        return (
          <div
            key={p.id}
            className={`rounded-lg border transition-colors ${
              state.enabled
                ? "border-indigo-600 bg-indigo-950/30"
                : "border-gray-800 bg-gray-900/40"
            }`}
          >
            <button
              type="button"
              onClick={() => togglePreset(p.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span
                className={`w-4 h-4 rounded border-2 flex-shrink-0 transition-colors ${
                  state.enabled
                    ? "bg-indigo-600 border-indigo-600"
                    : "border-gray-600"
                }`}
              >
                {state.enabled && (
                  <svg viewBox="0 0 10 10" className="w-full h-full text-white fill-current">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={`text-sm font-medium ${state.enabled ? "text-white" : "text-gray-400"}`}>
                {p.label}
              </span>
              <span className="ml-auto font-mono text-xs text-gray-600">
                {p.resource}/{p.action}
              </span>
            </button>

            {state.enabled && p.constraintFields.length > 0 && (
              <div className="px-4 pb-3 space-y-3 border-t border-indigo-900/40 pt-3">
                {p.constraintFields.includes("step_up_threshold") && (
                  <label className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-40">Step-up threshold</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="0 = disabled"
                      value={state.constraints.step_up_threshold ?? ""}
                      onChange={(e) =>
                        updateConstraint(p.id, "step_up_threshold", e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-32 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-gray-600">require user re-auth above this value</span>
                  </label>
                )}

                {p.constraintFields.includes("frequency_limit") && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-40">Frequency limit</span>
                    <input
                      type="number"
                      min={1}
                      placeholder="count"
                      value={state.constraints.frequency_limit?.count ?? ""}
                      onChange={(e) =>
                        updateConstraint(p.id, "frequency_limit", e.target.value
                          ? { count: Number(e.target.value), window_seconds: state.constraints.frequency_limit?.window_seconds ?? 3600 }
                          : undefined)
                      }
                      className="w-20 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-gray-600">per</span>
                    <select
                      value={state.constraints.frequency_limit?.window_seconds ?? 3600}
                      onChange={(e) =>
                        updateConstraint(p.id, "frequency_limit", state.constraints.frequency_limit?.count
                          ? { count: state.constraints.frequency_limit.count, window_seconds: Number(e.target.value) }
                          : undefined)
                      }
                      className="px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value={60}>minute</option>
                      <option value={3600}>hour</option>
                      <option value={86400}>day</option>
                    </select>
                  </div>
                )}

                {p.constraintFields.includes("allowed_counterparties") && (
                  <label className="flex items-start gap-3">
                    <span className="text-xs text-gray-400 w-40 pt-1">Allowed counterparties</span>
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="github.com, api.example.com (comma-separated, blank = all)"
                        value={state.constraints.allowed_counterparties ?? ""}
                        onChange={(e) => updateConstraint(p.id, "allowed_counterparties", e.target.value)}
                        className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Custom capabilities */}
      {customs.map((cu) => (
        <div key={cu.id} className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 px-4 py-3 flex items-center gap-3">
          <span className="text-xs text-emerald-400 font-mono flex-1">
            {cu.resource}/{cu.action}
            {cu.toolName && <span className="text-gray-500 ml-2">(tool: {cu.toolName})</span>}
          </span>
          <button
            type="button"
            onClick={() => removeCustom(cu.id)}
            className="text-xs text-red-500 hover:text-red-400"
          >
            Remove
          </button>
        </div>
      ))}

      {/* Add custom capability form */}
      <div className="rounded-lg border border-dashed border-gray-700 px-4 py-3">
        <p className="text-xs text-gray-500 mb-3">+ Add custom capability (for your own skills/tools)</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">OpenClaw tool name</label>
            <input
              type="text"
              placeholder="my-tool"
              value={newCustom.toolName}
              onChange={(e) => setNewCustom((p) => ({ ...p, toolName: e.target.value }))}
              className="w-36 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Resource URI</label>
            <input
              type="text"
              placeholder="spotify://player"
              value={newCustom.resource}
              onChange={(e) => setNewCustom((p) => ({ ...p, resource: e.target.value }))}
              className="w-44 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <input
              type="text"
              placeholder="play"
              value={newCustom.action}
              onChange={(e) => setNewCustom((p) => ({ ...p, action: e.target.value }))}
              className="w-28 px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={addCustom}
            disabled={!newCustom.resource.trim() || !newCustom.action.trim()}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-xs text-white transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
