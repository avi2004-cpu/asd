// LOCKED DATA CONTRACT (playbook Section 3) -- owned by Person 3 (Backend & ML).
// Mirrors pb_migrations/1763700000_asd_collections.js and ml/contract.py.
// Do not rename fields without group approval.

export const STREAK_LENGTH = 3; // live value: GET /api/asd/config -> { streak_length, daily_limit }
export const DAILY_LIMIT = 2;
export const DAILY_LIMIT_MESSAGE = "Come back tomorrow! Daily session limit reached.";

export const RISK_THRESHOLDS = { lowMax: 0.33, elevatedMin: 0.66 } as const;

export type Role = "parent" | "doctor";
export type ActivityType = "game" | "video";
export type SessionStatus = "pending" | "scored" | "flagged";
export type RiskLevel = "Low" | "Moderate" | "Elevated";
export type TrendDirection = "improving" | "stable" | "worsening";

interface BaseRecord {
  id: string;
  created: string;
  updated: string;
}

export interface User extends BaseRecord {
  email: string;
  name: string;
  role: Role;
}

export interface Child extends BaseRecord {
  parent: string; // users.id
  name: string;
  dob: string;
  gender: string;
  consent: boolean; // must be true
  consent_at: string;
  session_count: number; // server-owned (hook)
  sessions_today: number; // server-owned (hook)
  last_session_date: string; // server-owned, "YYYY-MM-DD" (UTC)
}

// Constraint 1 -- exact keys; order matters for the model.
export interface SessionFeatures {
  avg_expr: number;
  gaze_mean_x: number;
  gaze_mean_y: number;
  gaze_var_x: number;
  gaze_var_y: number;
  tap_count: number;
  avg_response_ms: number;
}

export const FEATURE_ORDER: (keyof SessionFeatures)[] = [
  "avg_expr",
  "gaze_mean_x",
  "gaze_mean_y",
  "gaze_var_x",
  "gaze_var_y",
  "tap_count",
  "avg_response_ms",
];

export interface Session extends BaseRecord {
  child: string; // children.id
  activity_type: ActivityType;
  features: SessionFeatures;
  gaze_points: [number, number][];
  valid_face_ratio: number; // 0..1
  status: SessionStatus;
}

// Body Person 1 POSTs to /api/collections/sessions/records.
// status: "flagged" if valid_face_ratio < 0.2, otherwise "pending".
export type NewSession = Omit<Session, keyof BaseRecord>;

export interface Result extends BaseRecord {
  session: string;
  child: string;
  risk_score: number; // 0..1
  risk_level: RiskLevel;
  model_version: string;
}

export interface Conclusion extends BaseRecord {
  child: string;
  risk_category: RiskLevel;
  trend_direction: TrendDirection;
  summary_text: string;
}

export function riskLevel(score: number): RiskLevel {
  if (score < RISK_THRESHOLDS.lowMax) return "Low";
  if (score < RISK_THRESHOLDS.elevatedMin) return "Moderate";
  return "Elevated";
}
