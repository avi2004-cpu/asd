import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pocketBaseConfigured, subscribeSessionResults, subscribeSessions, type ScreeningResult, type ScreeningSession } from "@/lib/pocketbase";
import { buildTrendPoints } from "@/lib/score-utils";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/dashboard/session/$id")({
  head: () => ({
    meta: [
      { title: "Session detail — Little Moments Clinical" },
      { name: "description", content: "Review this screening prototype session's interactions and available model results." },
      { property: "og:title", content: "Session detail — Little Moments Clinical" },
      { property: "og:description", content: "Review this screening prototype session's interactions and available model results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SessionDetail,
});

function SessionDetail() {
  const { id } = Route.useParams();
  const reportRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<ScreeningSession[]>([]);
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!pocketBaseConfigured()) return;
    const stopSessions = subscribeSessions(setSessions, (reason) => setError(reason.message));
    const stopResults = subscribeSessionResults(id, setResults, (reason) => setError(reason.message));
    return () => { stopSessions(); stopResults(); };
  }, [id]);

  const session = sessions.find((item) => item.sessionId === id);
  const result = results[0];
  const expressionPoints = useMemo(() => result ? buildTrendPoints(result.features.expressionScores ?? {}) : [], [result]);
  const tapEvents = session?.interactionEvents ?? [];
  const avgResponse = tapEvents.length ? Math.round(tapEvents.reduce((sum, event) => sum + event.responseTimeMs, 0) / tapEvents.length) : null;

  const exportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const image = await html2canvas(reportRef.current, { scale: 1.5, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const width = 190;
      const height = image.height * (width / image.width);
      pdf.addImage(image.toDataURL("image/png"), "PNG", 10, 10, width, height);
      pdf.save(`screening-session-${id}.pdf`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The report could not be exported.");
    } finally {
      setExporting(false);
    }
  };

  return <div className="clinical-shell">
    {!pocketBaseConfigured() && <div className="backend-banner">PocketBase is not configured. Set the PocketBase URL to read sessions and results.</div>}
    <header className="clinical-topbar"><Link to="/dashboard" className="clinical-brand"><span className="brand-dot" /> Little Moments <span className="muted-line">Clinical</span></Link><nav className="clinical-nav"><Link to="/dashboard">Sessions</Link><Link to="/app">Child activity</Link></nav></header>
    <main className="clinical-content">
      <div className="page-heading"><div><Link className="text-link" to="/dashboard"><ArrowLeft size={15} /> All sessions</Link><h1 style={{ marginTop: ".7rem" }}>Session detail</h1><p>{session ? `${session.childId} · ${new Date(session.timestamp).toLocaleString()}` : id}</p></div><Button variant="outline" onClick={() => void exportPdf()} disabled={!session || exporting}><Download size={16} /> {exporting ? "Preparing…" : "Export PDF"}</Button></div>
      {error && <div className="notice alert" role="alert">{error}</div>}
      {!session && <div className="panel dashboard-panel"><p>{pocketBaseConfigured() ? "Loading session… If this session is missing, return to the session list." : "Connect PocketBase to load this session."}</p></div>}
      {session && <div ref={reportRef}>
        <div className="metric-grid">
          <div className="panel metric-panel"><div className="metric-label">Risk score</div><div className="score-display">{result && Number.isFinite(result.riskScore) ? `${Math.round(result.riskScore * 100)}` : "—"}<span className="metric-label">{result ? "%" : "Not scored"}</span></div><div className="metric-label">Prototype output; not a diagnosis</div></div>
          <div className="panel metric-panel"><div className="metric-label">Tap responses</div><div className="metric-value">{tapEvents.length}</div><div className="metric-label">Recorded interactions</div></div>
          <div className="panel metric-panel"><div className="metric-label">Average response time</div><div className="metric-value">{avgResponse === null ? "—" : `${avgResponse} ms`}</div><div className="metric-label">Across tap events</div></div>
        </div>
        <div className="dashboard-grid">
          <section className="panel dashboard-panel"><h2>Expression timeline</h2>{expressionPoints.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={expressionPoints} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="time" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} /><YAxis domain={[0, 1]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="score" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div> : <div className="chart-area empty-visual">No expression samples available.</div>}</section>
          <section className="panel dashboard-panel"><h2>Gaze heatmap</h2><div className="heatmap">{result?.gazeHeatmapUrl ? <img src={result.gazeHeatmapUrl} alt="Gaze heatmap for this session" /> : <span className="empty-visual">No gaze heatmap available.</span>}</div></section>
          <section className="panel dashboard-panel"><h2>Interaction metrics</h2><dl className="metrics-list"><div><dt>Tap count</dt><dd>{tapEvents.length}</dd></div><div><dt>Average response</dt><dd>{avgResponse === null ? "—" : `${avgResponse} ms`}</dd></div><div><dt>Frames uploaded</dt><dd>{session.framesUploaded.length}</dd></div><div><dt>Model version</dt><dd>{result?.modelVersion ?? "Not scored"}</dd></div></dl></section>
          <section className="panel dashboard-panel"><h2>AI-generated insight</h2><p className="insight-copy">{result?.aiInsight ?? result?.insight ?? result?.summary ?? "No model-generated insight is available for this session."}</p>{result?.scoredAt && <p className="muted-line">Scored {new Date(result.scoredAt).toLocaleString()}</p>}</section>
        </div>
        <p className="clinical-footer">Prototype screening aid — not a diagnostic tool</p>
      </div>}
    </main>
    <footer className="clinical-footer">Prototype screening aid — not a diagnostic tool</footer>
  </div>;
}
