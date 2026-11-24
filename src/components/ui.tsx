// Small shared UI primitives. Touch targets are >= 48px tall for the Android build.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-300 disabled:text-slate-500",
  secondary:
    "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400 disabled:bg-slate-100",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6", className)}>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const INPUT =
  "block w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 " +
  "placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(INPUT, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(INPUT, "appearance-auto", props.className)} />;
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "warning" | "info" | "success";
  children: ReactNode;
}) {
  const tones = {
    error: "border-rose-200 bg-rose-50 text-rose-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-slate-500" role="status">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <span>{label}</span>
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-600">
          {Math.min(value, max)} / {max}
        </span>
      </div>
      <div
        className="h-4 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
