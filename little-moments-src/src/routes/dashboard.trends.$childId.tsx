import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  pocketBaseConfigured,
  subscribeResults,
  subscribeSessions,
  type ScreeningResult,
  type ScreeningSession,
} from "@/lib/pocketbase";

export const Route = createFileRoute("/dashboard/trends/$childId")({
  head: () => ({
    meta: [
      { title: "Child trends — Little Moments Clinical" },
      {
        name: "description",
        content: "Review available model risk-score trends over time for a child.",
      },
      { property: "og:title", content: "Child trends — Little Moments Clinical" },
      {
        property: "og:description",
        content: "Review available model risk-score trends over time for a child.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChildTrends,
});

function ChildTrends() {
  const { childId } = Route.useParams();
  const [sessions, setSessions] = useState<ScreeningSession[]>([]);
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!pocketBaseConfigured()) return;
    const stopSessions = subscribeSessions(setSessions, (reason) => setError(reason.message));
    const stopResults = subscribeResults(setResults, (reason) => setError(reason.message));
    return () => {
      stopSessions();
      stopResults();
    };
  }, []);

  const points = useMemo(() => {
    const dates = new Map(
      sessions
        .filter((session) => session.childId === childId)
        .map((session) => [session.sessionId, session.timestamp]),
    );
    return results
      .filter((item) => dates.has(item.sessionId) && Number.isFinite(item.riskScore))
      .map((item) => ({
        date: dates.get(item.sessionId) ?? "",
        score: item.riskScore,
        sessionId: item.sessionId,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sessions, results, childId]);

  return (
    <div className="clinical-shell">
      {!pocketBaseConfigured() && (
        <div className="backend-banner">
          PocketBase is not configured. Set the PocketBase URL to read session trends.
        </div>
      )}
      <header className="clinical-topbar">
        <Link to="/dashboard" className="clinical-brand">
          <span className="brand-dot" /> Little Moments <span className="muted-line">Clinical</span>
        </Link>
        <nav className="clinical-nav">
          <Link to="/dashboard">Sessions</Link>
          <Link to="/app">Child activity</Link>
        </nav>
      </header>
      <main className="clinical-content">
        <div className="page-heading">
          <div>
            <Link className="text-link" to="/dashboard">
              <ArrowLeft size={15} /> All sessions
            </Link>
            <h1 style={{ marginTop: ".7rem" }}>Risk score trends</h1>
            <p>Child ID: {childId}</p>
          </div>
          <TrendingUp size={24} aria-hidden="true" />
        </div>
        {error && (
          <div className="notice alert" role="alert">
            {error}
          </div>
        )}
        <section className="panel dashboard-panel">
          <h2>Risk score across sessions</h2>
          {points.length ? (
            <div className="chart-area" style={{ height: "22rem" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 20, bottom: 16, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => new Date(value).toLocaleDateString()}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <Tooltip
                    labelFormatter={(value) => new Date(String(value)).toLocaleString()}
                    formatter={(value) => [`${Math.round(Number(value) * 100)}%`, "Risk score"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--chart-3)"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-area empty-visual">
              {pocketBaseConfigured()
                ? "No scored sessions for this child yet."
                : "Connect PocketBase to view scored sessions."}
            </div>
          )}
        </section>
        <div className="panel table-wrap" style={{ marginTop: "1rem" }}>
          <table className="session-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Risk score</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.sessionId}>
                  <td>{new Date(point.date).toLocaleString()}</td>
                  <td>{Math.round(point.score * 100)}%</td>
                  <td>
                    <Link
                      className="text-link"
                      to="/dashboard/session/$id"
                      params={{ id: point.sessionId }}
                    >
                      Open session
                    </Link>
                  </td>
                </tr>
              ))}
              {!points.length && (
                <tr>
                  <td colSpan={3}>No trend records available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
      <footer className="clinical-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}
