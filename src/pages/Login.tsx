import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { errorMessage, homeFor, pb } from "../lib/pb";
import { useAuth } from "../lib/auth";
import type { User } from "../types/schema";
import { Alert, Button, Card, Field, Input } from "../components/ui";

export default function Login() {
  const user = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = await pb.collection("users").authWithPassword<User>(email.trim(), password);
      navigate(homeFor(auth.record.role), { replace: true });
    } catch (err) {
      setError(
        errorMessage(err).includes("authenticate")
          ? "Incorrect email or password."
          : errorMessage(err, "Login failed. Please try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <div aria-hidden className="text-6xl">🧸</div>
        <h1 className="mt-2 text-2xl font-bold text-brand-800">Early ASD Screening</h1>
        <p className="text-sm text-slate-600">Playful check-ins for toddlers, reviewed by your doctor</p>
      </div>

      <Card className="w-full max-w-md">
        <h2 className="mb-4 text-xl font-semibold">Log in</h2>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full" disabled={busy || !email || !password}>
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-600">
          New parent?{" "}
          <Link to="/signup" className="inline-block py-2 font-semibold text-brand-700 underline">
            Create an account
          </Link>
        </p>
      </Card>
      <p className="mt-6 max-w-md text-center text-xs text-slate-500">
        Research prototype. Results are a screening indicator only and are not a diagnosis.
      </p>
    </div>
  );
}
