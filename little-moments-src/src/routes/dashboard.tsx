import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowDown, ArrowUp, ClipboardList, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  pocketBaseConfigured,
  subscribeResults,
  subscribeSessions,
  type ScreeningResult,
  type ScreeningSession,
} from "@/lib/pocketbase";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Sessions — Little Moments Clinical" },
      {
        name: "description",
        content: "Review and sort screening prototype sessions by child and date.",
      },
      { property: "og:title", content: "Sessions — Little Moments Clinical" },
      {
        property: "og:description",
        content: "Review and sort screening prototype sessions by child and date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function ClinicalFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="clinical-shell">
      {!pocketBaseConfigured() && (
        <div className="backend-banner">
          PocketBase is not configured. Set the PocketBase URL to enable live session and results
          data.
        </div>
      )}
      <header className="clinical-topbar">
        <Link to="/dashboard" className="clinical-brand">
          <span className="brand-dot" /> Little Moments <span className="muted-line">Clinical</span>
        </Link>
        <nav className="clinical-nav">
          <Link to="/dashboard">
            <ClipboardList size={16} /> Sessions
          </Link>
          <Link to="/app">
            <Users size={16} /> Child activity
          </Link>
        </nav>
      </header>
      <main className="clinical-content">{children}</main>
      <footer className="clinical-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}

function Dashboard() {
  const [sessions, setSessions] = useState<ScreeningSession[]>([]);
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [childFilter, setChildFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<{ key: "timestamp" | "childId"; direction: 1 | -1 }>({
    key: "timestamp",
    direction: -1,
  });

  useEffect(() => {
    if (!pocketBaseConfigured()) {
      setLoading(false);
      return;
    }
    let ready = 0;
    const complete = () => {
      ready += 1;
      if (ready === 2) setLoading(false);
    };
    const stopSessions = subscribeSessions(
      (items) => {
        setSessions(items);
        complete();
      },
      (reason) => {
        setError(reason.message);
        complete();
      },
    );
    const stopResults = subscribeResults(
      (items) => {
        setResults(items);
        complete();
      },
      (reason) => {
        setError(reason.message);
        complete();
      },
    );
    return () => {
      stopSessions();
      stopResults();
    };
  }, []);

  const filtered = useMemo(() => {
    const resultMap = new Map(results.map((item) => [item.sessionId, item]));
    return sessions
      .filter((item) => {
        const day = item.timestamp.slice(0, 10);
        return (
          item.childId.toLowerCase().includes(childFilter.toLowerCase()) &&
          (!fromDate || day >= fromDate) &&
          (!toDate || day <= toDate)
        );
      })
      .sort(
        (a, b) =>
          sort.direction *
          (sort.key === "childId"
            ? a.childId.localeCompare(b.childId)
            : a.timestamp.localeCompare(b.timestamp)),
      )
      .map((session) => ({ session, result: resultMap.get(session.sessionId) }));
  }, [sessions, results, childFilter, fromDate, toDate, sort]);

  const scoredCount = results.filter((item) => Number.isFinite(item.riskScore)).length;
  const childrenCount = new Set(sessions.map((item) => item.childId)).size;
  const sortButton = (key: "timestamp" | "childId", text: string) => (
    <button
      className="sort-button"
      onClick={() =>
        setSort((current) => ({
          key,
          direction:
            current.key === key ? (current.direction === 1 ? -1 : 1) : key === "timestamp" ? -1 : 1,
        }))
      }
    >
      {text}{" "}
      {sort.key === key && (sort.direction === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
    </button>
  );

  return (
    <ClinicalFrame>
      <div className="page-heading">
        <div>
          <h1>Sessions</h1>
          <p>Screening activity and model results</p>
        </div>
        <Activity size={23} aria-hidden="true" />
      </div>
      <div className="metric-grid">
        <div className="panel metric-panel">
          <div className="metric-label">Total sessions</div>
          <div className="metric-value">{sessions.length}</div>
        </div>
        <div className="panel metric-panel">
          <div className="metric-label">Children</div>
          <div className="metric-value">{childrenCount}</div>
        </div>
        <div className="panel metric-panel">
          <div className="metric-label">Scored sessions</div>
          <div className="metric-value">{scoredCount}</div>
        </div>
      </div>
      <div className="filter-row">
        <input
          className="filter-input"
          aria-label="Filter by child ID"
          placeholder="Filter child ID"
          value={childFilter}
          onChange={(event) => setChildFilter(event.target.value)}
        />
        <label className="muted-line">
          From{" "}
          <input
            className="filter-input"
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label className="muted-line">
          To{" "}
          <input
            className="filter-input"
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setChildFilter("");
            setFromDate("");
            setToDate("");
          }}
        >
          Clear filters
        </Button>
      </div>
      {error && (
        <div className="notice alert" role="alert">
          Could not read session data: {error}
        </div>
      )}
      <div className="panel table-wrap">
        <table className="session-table">
          <thead>
            <tr>
              <th>{sortButton("childId", "Child ID")}</th>
              <th>{sortButton("timestamp", "Date & time")}</th>
              <th>Status</th>
              <th>Risk score</th>
              <th>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>Loading sessions…</td>
              </tr>
            )}
            {!loading && !filtered.length && (
              <tr>
                <td colSpan={5}>
                  {pocketBaseConfigured()
                    ? "No sessions match these filters."
                    : "Connect PocketBase to load session records."}
                </td>
              </tr>
            )}
            {filtered.map(({ session, result }) => (
              <tr key={session.sessionId}>
                <td>
                  <Link
                    className="text-link"
                    to="/dashboard/trends/$childId"
                    params={{ childId: session.childId }}
                  >
                    {session.childId}
                  </Link>
                </td>
                <td>{new Date(session.timestamp).toLocaleString()}</td>
                <td>
                  <span className="status-pill">{session.status}</span>
                </td>
                <td>
                  {result && Number.isFinite(result.riskScore)
                    ? `${Math.round(result.riskScore * 100)}%`
                    : "Not scored"}
                </td>
                <td>
                  <Link
                    className="text-link"
                    to="/dashboard/session/$id"
                    params={{ id: session.sessionId }}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ClinicalFrame>
  );
}
