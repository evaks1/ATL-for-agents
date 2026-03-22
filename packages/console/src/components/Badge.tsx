interface BadgeProps {
  value: string;
}

const colors: Record<string, string> = {
  ALLOW: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  DENY: "bg-red-500/20 text-red-400 border border-red-500/30",
  STEP_UP_REQUIRED: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  active: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  revoked: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

export function Badge({ value }: BadgeProps) {
  const cls = colors[value] ?? "bg-gray-500/20 text-gray-400";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${cls}`}>
      {value}
    </span>
  );
}
