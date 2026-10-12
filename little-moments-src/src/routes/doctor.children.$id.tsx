import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogOut, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  getDoctorChildDetails,
  isDoctorAuthenticated,
  signOut,
  type DoctorChildDetails,
} from "@/lib/pocketbase";

export const Route = createFileRoute("/doctor/children/$id")({
  head: () => ({ meta: [{ title: "Child detail — Little Moments" }] }),
  component: DoctorChildDetail,
});

function DoctorChildDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<DoctorChildDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isDoctorAuthenticated()) {
      void navigate({ to: "/doctor/login" });
      return;
    }
    let active = true;
    void getDoctorChildDetails(id)
      .then((response) => {
        if (active) setDetails(response);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Child details could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, navigate]);

  const chartPoints = useMemo(() => {
    if (!details) return [];
    const sessionDates = new Map(
      details.sessions.map((session) => [session.sessionId, session.timestamp]),
    );
    return details.results
      .filter((result) => sessionDates.has(result.sessionId) && Number.isFinite(result.riskScore))
      .map((result) => ({
        date: sessionDates.get(result.sessionId) ?? "",
        riskScore: result.riskScore,
        sessionId: result.sessionId,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [details]);

  const conclusions = details?.conclusions ?? [];
  const logout = () => {
    signOut();
    void navigate({ to: "/doctor/login" });
  };

  return (
    <div className="clinical-shell">
      <header className="clinical-topbar">
        <Link to="/doctor" className="clinical-brand">
          <span className="brand-dot" /> Little Moments <span className="muted-line">Clinical</span>
        </Link>
        <nav className="clinical-nav">
          <Link to="/doctor">Child directory</Link>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut size={15} /> Sign out
          </Button>
        </nav>
      </header>
      <main className="clinical-content">
        <div className="page-heading">
          <div>
            <Link className="text-link" to="/doctor">
              <ArrowLeft size={15} /> Child directory
            </Link>
            <h1 className="detail-heading">{details?.child.displayName ?? "Child detail"}</h1>
            <p>
              Overall risk:{" "}
              <span className={`status-pill risk-${details?.child.riskFlag ?? "pending"}`}>
                {details?.child.riskFlag ?? "pending"}
              </span>
            </p>
          </div>
          <TrendingUp size={23} aria-hidden="true" />
        </div>
        {loading && <div className="panel dashboard-panel">Loading child details…</div>}
        {error && (
          <div className="notice alert" role="alert">
            Could not load child details: {error}
          </div>
        )}
        {details && (
          <>
            <section className="panel dashboard-panel">
              <h2>Risk score trend</h2>
              {chartPoints.length ? (
                <div className="chart-area" style={{ height: "22rem" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartPoints}
                      margin={{ top: 8, right: 20, bottom: 16, left: 0 }}
                    >
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
                        dataKey="riskScore"
                        stroke="var(--chart-3)"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="chart-area empty-visual">No scored sessions are available yet.</div>
              )}
            </section>

            <section className="panel dashboard-panel detail-conclusion">
              <h2>Latest conclusion</h2>
              {conclusions[0] ? (
                <>
                  <p className="insight-copy">{conclusions[0].summary}</p>
                  <p className="muted-line">
                    Recorded {new Date(conclusions[0].createdAt).toLocaleString()}
                  </p>
                </>
              ) : details.results[0]?.aiInsight ||
                details.results[0]?.insight ||
                details.results[0]?.summary ? (
                <p className="insight-copy">
                  {details.results[0].aiInsight ??
                    details.results[0].insight ??
                    details.results[0].summary}
                </p>
              ) : (
                <p className="empty-visual">No conclusion is available for this child.</p>
              )}
            </section>

            <section className="panel table-wrap detail-history">
              <h2 className="table-heading">Session history</h2>
              <table className="session-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Activity</th>
                    <th>Status</th>
                    <th>Risk score</th>
                    <th>Interactions</th>
                  </tr>
                </thead>
                <tbody>
                  {details.sessions.map((session) => {
                    const result = details.results.find(
                      (item) => item.sessionId === session.sessionId,
                    );
                    return (
                      <tr key={session.id}>
                        <td>{new Date(session.timestamp).toLocaleString()}</td>
                        <td>{session.gameModule}</td>
                        <td>
                          <span className="status-pill">{session.status}</span>
                        </td>
                        <td>
                          {result && Number.isFinite(result.riskScore)
                            ? `${Math.round(result.riskScore * 100)}%`
                            : "Not scored"}
                        </td>
                        <td>{session.interactionEvents.length}</td>
                      </tr>
                    );
                  })}
                  {!details.sessions.length && (
                    <tr>
                      <td colSpan={5}>No sessions are available yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="detail-heatmaps">
              <h2>Gaze heatmaps</h2>
              <div className="heatmap-grid">
                {details.results.map((result) => {
                  const session = details.sessions.find(
                    (item) => item.sessionId === result.sessionId,
                  );
                  const heatmap = result.gazeHeatmapUrl;
                  return (
                    <article className="panel dashboard-panel" key={result.id}>
                      <h3>
                        {session ? new Date(session.timestamp).toLocaleString() : "Session heatmap"}
                      </h3>
                      <div className="heatmap">
                        {heatmap ? (
                          <img
                            src={heatmap}
                            alt={`Gaze heatmap for ${session?.sessionId ?? "session"}`}
                          />
                        ) : (
                          <span className="empty-visual">No gaze heatmap available.</span>
                        )}
                      </div>
                    </article>
                  );
                })}
                {!details.results.length && (
                  <p className="empty-visual">No gaze heatmaps are available yet.</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
      <footer className="clinical-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}
