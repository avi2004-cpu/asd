// Shared helpers for the parent and doctor screens.
import { ClientResponseError } from "pocketbase";
import { pb } from "./pb";
import { DAILY_LIMIT, STREAK_LENGTH, type Child } from "../types/schema";

export interface AsdConfig {
  streak_length: number;
  daily_limit: number;
}

const DEFAULT_CONFIG: AsdConfig = { streak_length: STREAK_LENGTH, daily_limit: DAILY_LIMIT };

/** Live server config (GET /api/asd/config); falls back to the locked defaults. */
export async function fetchConfig(): Promise<AsdConfig> {
  try {
    const cfg = await pb.send<AsdConfig>("/api/asd/config", { method: "GET" });
    if (typeof cfg?.streak_length === "number" && typeof cfg?.daily_limit === "number") return cfg;
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_CONFIG;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Sessions already counted today, mirroring the server hook (UTC day). */
export function sessionsToday(child: Child): number {
  return child.last_session_date === todayUtc() ? child.sessions_today || 0 : 0;
}

export function dailyLimitReached(child: Child, cfg: AsdConfig): boolean {
  return sessionsToday(child) >= cfg.daily_limit;
}

/**
 * True when a session POST was rejected by the server daily-limit hook (HTTP 400).
 * Person 1's PlaySession should use this in its catch block and then call
 * `navigate("/parent", { replace: true, state: { dailyLimit: true } })`.
 */
export function isDailyLimitError(err: unknown): boolean {
  if (!(err instanceof ClientResponseError) || err.status !== 400) return false;
  const msg = String(err.response?.message ?? err.message ?? "");
  return msg.includes("Come back tomorrow");
}

export function ageLabel(dob: string | undefined): string {
  if (!dob) return "";
  const d = new Date(dob.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) return "";
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} years`;
}

function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | undefined): string {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function formatShortDate(iso: string | undefined): string {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
}

export function formatDateTime(iso: string | undefined): string {
  const d = parseDate(iso);
  return d
    ? d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
}
