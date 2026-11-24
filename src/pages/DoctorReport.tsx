// Step 2.5 -- doctor detailed report (TC14):
// (a) latest risk score card, (b) risk trend line chart, (c) gaze scatter plot, (d) conclusion banner.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ClientResponseError } from "pocketbase";
import { errorMessage, pb } from "../lib/pb";
import { ageLabel, fetchConfig, formatDate, formatDateTime, formatShortDate, type AsdConfig } from "../lib/asd";
import {
  RISK_THRESHOLDS,
  riskLevel,
  type Child,
  type Conclusion,
  type Result,
  type RiskLevel,
  type Session,
  type TrendDirection,
} from "../types/schema";
import { AppShell } from "../components/AppShell";
import { RISK_STYLES, RiskBadge, isRiskLevel } from "../components/RiskBadge";
import { Alert, Button, Card, Select, Spinner } from "../components/ui";

interface ReportData {
  child: Child;
  results: Result[];
  sessions: Session[];
  conclusion: Conclusion | null;
  cfg: AsdConfig;
}

function levelOf(r: Result): RiskLevel {
  return isRiskLevel(r.risk_level) ? r.risk_level : riskLevel(r.risk_score);
}

/** gaze_points is JSON; keep only well-formed [x, y] pairs in [0, 1]. */
function cleanPoints(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [number, number][] = [];
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 2) {
      const [x, y] = p;
      if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
        out.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
      }
    }
  }
  return out;
}

export default function DoctorReport() {
  const { childId = "" } = useParams();
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const byChild = pb.filter("child = {:id}", { id: childId });
      const [child, results, sessions, conclusions, cfg] = await Promise.all([
        pb.collection("children").getOne<Child>(childId),
        pb.collection("results").getFullList<Result>({ filter: byChild, sort: "created" }),
        pb.collection("sessions").getFullList<Session>({ filter: byChild, sort: "created" }),
        pb.collection("conclusions").getList<Conclusion>(1, 1, { filter: byChild, sort: "-created" }),
        fetchConfig(),
      ]);
      setData({ child, results, sessions, conclusion: conclusions.items[0] ?? null, cfg });
    } catch (err) {
      setError(
        err instanceof ClientResponseError && err.status === 404
          ? "This child could not be found."
          : errorMessage(err, "Could not load the report."),
      );
    }
  }, [childId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell wide>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/doctor" className="inline-flex min-h-12 items-center font-semibold text-brand-700">
          ← All patients
        </Link>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!data ? !error && <Spinner label="Loading report…" /> : <Report data={data} />}
    </AppShell>
  );
}

function Report({ data }: { data: ReportData }) {
  const { child, results, sessions, conclusion, cfg } = data;
  const latest = results.length ? results[results.length - 1] : null;
  const resultBySession = useMemo(() => new Map(results.map((r) => [r.session, r])), [results]);
  const flagged = sessions.filter((s) => s.status === "flagged").length;
  const age = ageLabel(child.dob);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{child.name}</h1>
        <p className="text-sm text-slate-600">
          {[age && `Age ${age}`, child.gender && child.gender[0].toUpperCase() + child.gender.slice(1), child.dob && `DOB ${formatDate(child.dob)}`].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {results.length} scored session{results.length === 1 ? "" : "s"}
          {flagged > 0 && ` · ${flagged} flagged (no face detected, excluded from scoring)`}
        </p>
      </div>

      {/* (d) longitudinal conclusion banner */}
      <ConclusionBanner conclusion={conclusion} scored={results.length} streak={cfg.streak_length} />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* (a) latest risk score card */}
        <LatestScoreCard latest={latest} />
        {/* (b) session-by-session risk trend */}
        <Card className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold">Risk trend</h2>
          <p className="mb-3 text-xs text-slate-500">Risk score per scored session (0 = lowest, 1 = highest)</p>
          <TrendChart results={results} />
        </Card>
      </div>

      {/* (c) gaze distribution */}
      <GazeCard sessions={sessions} resultBySession={resultBySession} />

      <SessionsTable sessions={sessions} resultBySession={resultBySession} />

      <p className="pb-4 text-center text-xs text-slate-500">
        Research prototype. Scores come from a model trained on synthetic data. Screening indicator only, not a
        diagnosis.
      </p>
    </div>
  );
}

const TREND_TEXT: Record<TrendDirection, { icon: string; label: string }> = {
  improving: { icon: "↘", label: "Improving" },
  stable: { icon: "→", label: "Stable" },
  worsening: { icon: "↗", label: "Worsening" },
};

function ConclusionBanner({
  conclusion,
  scored,
  streak,
}: {
  conclusion: Conclusion | null;
  scored: number;
  streak: number;
}) {
  if (!conclusion) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-slate-600">
        <p className="font-semibold text-slate-800">Longitudinal conclusion pending</p>
        <p className="text-sm">
          Generated automatically after {streak} scored sessions ({Math.min(scored, streak)} of {streak} so far).
        </p>
      </div>
    );
  }
  const level = isRiskLevel(conclusion.risk_category) ? conclusion.risk_category : null;
  const tone = level === "Elevated" ? "border-rose-300 bg-rose-50" : level === "Moderate" ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50";
  const trend = TREND_TEXT[conclusion.trend_direction as TrendDirection];
  return (
    <div className={`rounded-2xl border-2 p-4 sm:p-5 ${tone}`} role="region" aria-label="Longitudinal conclusion">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-lg font-bold text-slate-900">Longitudinal conclusion</h2>
        <RiskBadge level={level} size="lg" />
        {trend && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 ring-inset">
            <span aria-hidden>{trend.icon}</span> {trend.label}
          </span>
        )}
      </div>
      <p className="text-slate-800">{conclusion.summary_text}</p>
      <p className="mt-2 text-xs text-slate-500">Generated {formatDateTime(conclusion.created)}</p>
    </div>
  );
}

function LatestScoreCard({ latest }: { latest: Result | null }) {
  if (!latest) {
    return (
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Latest risk score</h2>
        <p className="text-slate-500">No scored sessions yet.</p>
      </Card>
    );
  }
  const level = levelOf(latest);
  const pct = Math.round(latest.risk_score * 100);
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Latest risk score</h2>
      <div className="flex items-end gap-3">
        <span className="text-5xl font-bold tabular-nums" style={{ color: RISK_STYLES[level].hex }}>
          {latest.risk_score.toFixed(2)}
        </span>
        <RiskBadge level={level} size="lg" />
      </div>
      <div className="relative mt-4 h-3 rounded-full" aria-hidden
        style={{
          background: `linear-gradient(to right, ${RISK_STYLES.Low.hex} 0 ${RISK_THRESHOLDS.lowMax * 100}%, ${RISK_STYLES.Moderate.hex} ${RISK_THRESHOLDS.lowMax * 100}% ${RISK_THRESHOLDS.elevatedMin * 100}%, ${RISK_STYLES.Elevated.hex} ${RISK_THRESHOLDS.elevatedMin * 100}% 100%)`,
        }}
      >
        <span
          className="absolute -top-1 h-5 w-1.5 -translate-x-1/2 rounded-full bg-slate-900 ring-2 ring-white"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>0</span>
        <span>{RISK_THRESHOLDS.lowMax}</span>
        <span>{RISK_THRESHOLDS.elevatedMin}</span>
        <span>1</span>
      </div>
      <dl className="mt-4 space-y-1 text-sm text-slate-600">
        <div className="flex justify-between gap-2">
          <dt>Scored</dt>
          <dd className="text-right">{formatDateTime(latest.created)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Model</dt>
          <dd className="truncate text-right font-mono text-xs leading-5">{latest.model_version || "n/a"}</dd>
        </div>
      </dl>
    </Card>
  );
}

function TrendChart({ results }: { results: Result[] }) {
  if (results.length === 0) return <p className="py-10 text-center text-slate-500">No data yet.</p>;
  const points = results.map((r, i) => ({
    n: i + 1,
    label: `#${i + 1} · ${formatShortDate(r.created)}`,
    score: Number(r.risk_score.toFixed(3)),
    level: levelOf(r),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
          <ReferenceArea y1={0} y2={RISK_THRESHOLDS.lowMax} fill={RISK_STYLES.Low.hex} fillOpacity={0.08} />
          <ReferenceArea y1={RISK_THRESHOLDS.lowMax} y2={RISK_THRESHOLDS.elevatedMin} fill={RISK_STYLES.Moderate.hex} fillOpacity={0.08} />
          <ReferenceArea y1={RISK_THRESHOLDS.elevatedMin} y2={1} fill={RISK_STYLES.Elevated.hex} fillOpacity={0.08} />
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="n" tickFormatter={(n) => `#${n}`} tick={{ fontSize: 12 }} padding={{ left: 14, right: 14 }} />
          <YAxis domain={[0, 1]} ticks={[0, RISK_THRESHOLDS.lowMax, RISK_THRESHOLDS.elevatedMin, 1]} tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(_, payload) => (payload?.[0]?.payload as { label?: string } | undefined)?.label ?? ""}
            formatter={(value, _name, item) => [
              `${Number(value).toFixed(2)} (${(item?.payload as { level?: string } | undefined)?.level ?? ""})`,
              "Risk score",
            ]}
          />
          <Line
            type="linear"
            dataKey="score"
            stroke="#0f766e"
            strokeWidth={2.5}
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, payload, index } = props as { cx?: number; cy?: number; payload: { level: RiskLevel }; index: number };
              if (cx == null || cy == null) return <g key={index} />;
              return <circle key={index} cx={cx} cy={cy} r={5} fill={RISK_STYLES[payload.level].hex} stroke="#fff" strokeWidth={2} />;
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Older sessions lighter, newer darker (single-hue sequential palette).
function sessionColor(i: number, n: number): string {
  const t = n <= 1 ? 1 : i / (n - 1);
  const light = 72 - t * 42; // 72% -> 30% lightness
  return `hsl(174 72% ${light}%)`;
}

function GazeCard({
  sessions,
  resultBySession,
}: {
  sessions: Session[];
  resultBySession: Map<string, Result>;
}) {
  const usable = useMemo(
    () =>
      sessions
        .filter((s) => s.status !== "flagged")
        .map((s, i) => ({ s, i, points: cleanPoints(s.gaze_points) }))
        .filter((x) => x.points.length > 0),
    [sessions],
  );
  const [selected, setSelected] = useState<string>("all");
  const shown = selected === "all" ? usable : usable.filter((x) => x.s.id === selected);
  const total = shown.reduce((n, x) => n + x.points.length, 0);

  return (
    <Card>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gaze distribution</h2>
          <p className="text-xs text-slate-500">
            Estimated gaze position on screen, one dot per 2-second sample ({total} samples). Centre = looking at
            the middle of the screen.
          </p>
        </div>
        {usable.length > 1 && (
          <Select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="sm:w-56"
            aria-label="Choose session"
          >
            <option value="all">All sessions</option>
            {usable.map((x, k) => (
              <option key={x.s.id} value={x.s.id}>
                Session {k + 1} · {formatShortDate(x.s.created)} · {x.s.activity_type}
              </option>
            ))}
          </Select>
        )}
      </div>

      {usable.length === 0 ? (
        <p className="py-10 text-center text-slate-500">No gaze samples recorded yet.</p>
      ) : (
        <>
          <div className="mx-auto aspect-square w-full max-w-md">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: -12 }}>
                <CartesianGrid stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 1]}
                  ticks={[0, 0.25, 0.5, 0.75, 1]}
                  tick={{ fontSize: 11 }}
                  label={{ value: "left ← gaze x → right", position: "insideBottom", offset: -8, fontSize: 11, fill: "#64748b" }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[0, 1]}
                  reversed
                  ticks={[0, 0.25, 0.5, 0.75, 1]}
                  tick={{ fontSize: 11 }}
                  label={{ value: "top ← gaze y → bottom", angle: -90, position: "insideLeft", offset: 20, fontSize: 11, fill: "#64748b" }}
                />
                <ZAxis range={[36, 36]} />
                <ReferenceLine x={0.5} stroke="#94a3b8" strokeDasharray="4 4" />
                <ReferenceLine y={0.5} stroke="#94a3b8" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  formatter={(v) => Number(v).toFixed(2)}
                />
                {shown.map((x) => {
                  const r = resultBySession.get(x.s.id);
                  const k = usable.indexOf(x);
                  return (
                    <Scatter
                      key={x.s.id}
                      name={`Session ${k + 1}${r ? ` (${levelOf(r)})` : ""}`}
                      data={x.points.map(([px, py]) => ({ x: px, y: py }))}
                      fill={selected === "all" ? sessionColor(k, usable.length) : "#0f766e"}
                      fillOpacity={0.75}
                      isAnimationActive={false}
                    />
                  );
                })}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          {selected === "all" && usable.length > 1 && (
            <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
              <span>Oldest</span>
              <span
                className="h-2 w-24 rounded-full"
                style={{ background: `linear-gradient(to right, ${sessionColor(0, 2)}, ${sessionColor(1, 2)})` }}
              />
              <span>Newest session</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const STATUS_STYLE: Record<string, string> = {
  scored: "bg-emerald-50 text-emerald-800",
  pending: "bg-sky-50 text-sky-800",
  flagged: "bg-slate-100 text-slate-700",
};

function SessionsTable({
  sessions,
  resultBySession,
}: {
  sessions: Session[];
  resultBySession: Map<string, Result>;
}) {
  if (sessions.length === 0) return null;
  return (
    <Card className="p-0 sm:p-0">
      <h2 className="px-4 pt-4 text-lg font-semibold sm:px-6 sm:pt-6">Sessions</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 sm:pl-6">#</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Activity</th>
              <th className="px-4 py-2">Face visible</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 sm:pr-6">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((s, i) => {
              const r = resultBySession.get(s.id);
              return (
                <tr key={s.id}>
                  <td className="px-4 py-2 tabular-nums sm:pl-6">{i + 1}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(s.created)}</td>
                  <td className="px-4 py-2 capitalize">{s.activity_type}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {typeof s.valid_face_ratio === "number" ? `${Math.round(s.valid_face_ratio * 100)}%` : "n/a"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status] ?? ""}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 sm:pr-6">
                    {r ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="tabular-nums">{r.risk_score.toFixed(2)}</span>
                        <RiskBadge level={levelOf(r)} />
                      </span>
                    ) : (
                      <span className="text-slate-400">n/a</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
