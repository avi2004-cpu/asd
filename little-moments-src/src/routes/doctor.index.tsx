import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDoctorDirectory,
  isDoctorAuthenticated,
  signOut,
  type DoctorDirectoryEntry,
} from "@/lib/pocketbase";

export const Route = createFileRoute("/doctor/")({
  head: () => ({ meta: [{ title: "Doctor dashboard — Little Moments" }] }),
  component: DoctorDashboard,
});

function DoctorDashboard() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<DoctorDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isDoctorAuthenticated()) {
      void navigate({ to: "/doctor/login" });
      return;
    }
    let active = true;
    void getDoctorDirectory()
      .then((items) => {
        if (active) setChildren(items);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "The child directory could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

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
          <span>
            <Users size={16} /> Child directory
          </span>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut size={15} /> Sign out
          </Button>
        </nav>
      </header>
      <main className="clinical-content">
        <div className="page-heading">
          <div>
            <h1>Child dashboard</h1>
            <p>Open a child to view their screening history and trends.</p>
          </div>
          <Users size={23} aria-hidden="true" />
        </div>
        {error && (
          <div className="notice alert" role="alert">
            Could not load the child directory: {error}
          </div>
        )}
        <div className="panel table-wrap">
          <table className="session-table">
            <thead>
              <tr>
                <th>Child</th>
                <th>Overall risk</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={3}>Loading children…</td>
                </tr>
              )}
              {!loading && !children.length && !error && (
                <tr>
                  <td colSpan={3}>No children are available to this account.</td>
                </tr>
              )}
              {children.map((child) => (
                <tr key={child.id}>
                  <td>{child.displayName}</td>
                  <td>
                    <span className={`status-pill risk-${child.riskFlag}`}>{child.riskFlag}</span>
                  </td>
                  <td>
                    <Link
                      className="text-link"
                      to="/doctor/children/$id"
                      params={{ id: child.child }}
                    >
                      Open child
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      <footer className="clinical-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}
