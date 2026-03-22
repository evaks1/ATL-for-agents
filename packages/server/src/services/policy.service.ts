import type { UCANCapability } from "../lib/ucan.js";
import { incrementFrequencyCounter } from "../lib/redis.js";

export type PolicyDecision = "ALLOW" | "DENY" | "STEP_UP_REQUIRED";

export interface PolicyResult {
  decision: PolicyDecision;
  reason_code: string;
}

export async function evaluatePolicy(
  capabilities: UCANCapability[],
  grantId: string,
  intent: {
    action: string;
    resource: string;
    amount?: number;
    counterparty?: string;
  }
): Promise<PolicyResult> {
  // Find matching capability
  const cap = capabilities.find(
    (c) =>
      (c.resource === intent.resource || c.resource === "*") &&
      (c.action === intent.action || c.action === "*")
  );

  if (!cap) {
    return { decision: "DENY", reason_code: "CAPABILITY_NOT_FOUND" };
  }

  const constraints = cap.constraints ?? {};

  // Amount check
  if (intent.amount !== undefined) {
    if (
      constraints.max_amount !== undefined &&
      intent.amount > constraints.max_amount
    ) {
      return { decision: "DENY", reason_code: "AMOUNT_EXCEEDS_CAP" };
    }
    if (
      constraints.step_up_threshold !== undefined &&
      intent.amount > constraints.step_up_threshold
    ) {
      return { decision: "STEP_UP_REQUIRED", reason_code: "AMOUNT_REQUIRES_STEP_UP" };
    }
  }

  // Counterparty allowlist check
  if (intent.counterparty !== undefined) {
    const allowed = constraints.allowed_counterparties;
    if (allowed && allowed.length > 0 && !allowed.includes(intent.counterparty)) {
      return {
        decision: "STEP_UP_REQUIRED",
        reason_code: "COUNTERPARTY_NOT_IN_ALLOWLIST",
      };
    }
  }

  // Frequency check
  if (constraints.frequency_limit) {
    const { count: maxCount, window_seconds } = constraints.frequency_limit;
    const current = await incrementFrequencyCounter(grantId, window_seconds);
    if (current > maxCount) {
      return { decision: "DENY", reason_code: "FREQUENCY_LIMIT_EXCEEDED" };
    }
  }

  return { decision: "ALLOW", reason_code: "OK" };
}
