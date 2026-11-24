import type { RiskLevel } from "../types/schema";

// Constraint 5 colours: Green = Low, Amber = Moderate, Red = Elevated.
export const RISK_STYLES: Record<RiskLevel, { badge: string; dot: string; hex: string }> = {
  Low: { badge: "bg-emerald-100 text-emerald-800 ring-emerald-600/20", dot: "bg-emerald-500", hex: "#10b981" },
  Moderate: { badge: "bg-amber-100 text-amber-900 ring-amber-600/20", dot: "bg-amber-500", hex: "#f59e0b" },
  Elevated: { badge: "bg-rose-100 text-rose-800 ring-rose-600/20", dot: "bg-rose-500", hex: "#e11d48" },
};

export function isRiskLevel(v: unknown): v is RiskLevel {
  return v === "Low" || v === "Moderate" || v === "Elevated";
}

export function RiskBadge({ level, size = "md" }: { level: RiskLevel | null | undefined; size?: "md" | "lg" }) {
  const pad = size === "lg" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs";
  if (!level) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 font-semibold text-slate-600 ring-1 ring-slate-400/20 ring-inset ${pad}`}>
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        No result yet
      </span>
    );
  }
  const s = RISK_STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${s.badge} ${pad}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {level}
    </span>
  );
}
