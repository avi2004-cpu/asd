import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { restoreParentSession, signInParent } from "@/lib/pocketbase";

export const Route = createFileRoute("/parent/login")({
  head: () => ({ meta: [{ title: "Parent sign in — Little Moments" }] }),
  component: ParentLogin,
});

function ParentLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void restoreParentSession()
      .then((authenticated) => {
        if (authenticated) void navigate({ to: "/app" });
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "Your parent account could not be checked.",
        );
      });
  }, [navigate]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signInParent(email, password);
      await navigate({ to: "/app" });
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
          <span className="brand-dot" /> Little Moments
        </Link>
      </header>
      <main className="clinical-content login-content">
        <section className="panel login-panel">
          <h1>Parent sign in</h1>
          <p>Sign in with the parent account linked to your child's profile.</p>
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="parent-email">Email</label>
            <input
              id="parent-email"
              className="filter-input login-input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="parent-password">Password</label>
            <input
              id="parent-password"
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
          <p className="login-switch">
            New here?{" "}
            <Link className="text-link" to="/parent/signup">
              Create an account
            </Link>
          </p>
        </section>
      </main>
      <footer className="clinical-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}
