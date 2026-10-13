import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { signUpParent } from "@/lib/pocketbase";

export const Route = createFileRoute("/parent/signup")({
  head: () => ({ meta: [{ title: "Create parent account — Little Moments" }] }),
  component: ParentSignup,
});

function ParentSignup() {
  const navigate = useNavigate();
  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signUpParent(parentName, email, password);
      await navigate({ to: "/app" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account creation failed.");
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
          <h1>Create parent account</h1>
          <p>Set up an account to create profiles and save your family's activities.</p>
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="parent-name">Parent or guardian name</label>
            <input
              id="parent-name"
              className="filter-input login-input"
              autoComplete="name"
              required
              maxLength={100}
              value={parentName}
              onChange={(event) => setParentName(event.target.value)}
            />
            <label htmlFor="parent-email">Email</label>
            <input
              id="parent-email"
              className="filter-input login-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="parent-password">Password</label>
            <input
              id="parent-password"
              className="filter-input login-input"
              type="password"
              autoComplete="new-password"
              minLength={10}
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
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="login-switch">
            Already registered?{" "}
            <Link className="text-link" to="/parent/login">
              Sign in
            </Link>
          </p>
        </section>
      </main>
      <footer className="clinical-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}
