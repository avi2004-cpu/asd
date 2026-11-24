// Step 2.4 -- doctor name list (TC13): only each child's name + colour-coded risk badge.
// Detailed metrics are not fetched here at all; they load only on the report page.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, pb } from "../lib/pb";
import { riskLevel, type RiskLevel } from "../types/schema";
import { AppShell } from "../components/AppShell";
import { RiskBadge, isRiskLevel } from "../components/RiskBadge";
import { Alert, Button, Input, Spinner } from "../components/ui";

interface Row {
  id: string;
  name: string;
  level: RiskLevel | null;
}

const ORDER: Record<string, number> = { Elevated: 0, Moderate: 1, Low: 2, none: 3 };

export default function DoctorList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortByRisk, setSortByRisk] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Need-to-know: request only the fields this screen shows.
      const [children, results] = await Promise.all([
        pb.collection("children").getFullList<{ id: string; name: string }>({ sort: "name", fields: "id,name" }),
        pb.collection("results").getFullList<{ child: string; risk_level: string; risk_score: number }>({
          sort: "-created",
          fields: "child,risk_level,risk_score",
        }),
      ]);
      // results are sorted newest first, so the first one seen per child is the latest.
      const latest = new Map<string, RiskLevel>();
      for (const r of results) {
        if (latest.has(r.child)) continue;
        latest.set(r.child, isRiskLevel(r.risk_level) ? r.risk_level : riskLevel(r.risk_score));
      }
      setRows(children.map((c) => ({ id: c.id, name: c.name, level: latest.get(c.id) ?? null })));
    } catch (err) {
      setError(errorMessage(err, "Could not load the patient list."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : [...rows];
    if (sortByRisk) list.sort((a, b) => ORDER[a.level ?? "none"] - ORDER[b.level ?? "none"]);
    return list;
  }, [rows, query, sortByRisk]);

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-600">Latest screening result per child. Tap a name for the full report.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!rows ? (
        !error && <Spinner />
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <Input
              type="search"
              placeholder="Search by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search by name"
              className="sm:flex-1"
            />
            <label className="flex min-h-12 items-center gap-2 rounded-xl px-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-700"
                checked={sortByRisk}
                onChange={(e) => setSortByRisk(e.target.checked)}
              />
              Highest risk first
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              {rows.length === 0 ? "No children registered yet." : "No names match your search."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {visible.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/doctor/report/${r.id}`}
                    className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100"
                  >
                    <span className="min-w-0 truncate text-lg font-medium text-slate-900">{r.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <RiskBadge level={r.level} />
                      <span aria-hidden className="text-slate-400">›</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Legend:</span>
            <RiskBadge level="Low" />
            <RiskBadge level="Moderate" />
            <RiskBadge level="Elevated" />
          </div>
        </>
      )}
    </AppShell>
  );
}
