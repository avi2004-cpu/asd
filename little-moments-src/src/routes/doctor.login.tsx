import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { signInDoctor, restoreDoctorSession } from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/doctor/login")({
  head: () => ({ meta: [{ title: "Doctor sign in — Little Moments" }] }),
  component: DoctorLogin,
});

function DoctorLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void restoreDoctorSession()
      .then((authenticated) => {
        if (authenticated) void navigate({ to: "/doctor" });
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "Your clinician account could not be checked.",
        );
      });
  }, [navigate]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signInDoctor(email, password);
      await navigate({ to: "/doctor" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="clinical-shell">
      <header className="clinical-topbar">
        <Link to="/app" className="clinical-brand">
          <span className="brand-dot" /> Little Moments <span className="muted-line">Clinical</span>
        </Link>
      </header>
      <main className="clinical-content login-content">
        <section className="panel login-panel">
          <h1>Doctor sign in</h1>
          <p>Use your Little Moments clinician account to access the child directory.</p>
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="doctor-email">Email</label>
            <input
              id="doctor-email"
              className="filter-input login-input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="doctor-password">Password</label>
            <input
              id="doctor-password"
              className="filter-input login-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <div className="notice alert" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </section>
      </main>
      <footer className="clinical-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}
