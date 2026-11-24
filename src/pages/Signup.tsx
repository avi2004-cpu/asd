// Step 2.2 -- parent sign-up + child profile + mandatory consent (TC02).
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { errorMessage, homeFor, pb, currentUser } from "../lib/pb";
import type { User } from "../types/schema";
import { Alert, Button, Card, Field, Input } from "../components/ui";
import { ChildFields, EMPTY_CHILD, childDraftError, createChild, type ChildDraft } from "../components/ChildFields";

const MIN_PASSWORD = 8; // PocketBase default minimum

export default function Signup() {
  const navigate = useNavigate();
  // Checked once on mount only: the form logs the user in half-way through submitting,
  // and must not redirect before the child profile is saved.
  const [alreadyLoggedIn] = useState(() => currentUser());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [child, setChild] = useState<ChildDraft>(EMPTY_CHILD);
  // If the account was created but saving the child failed, a retry only re-saves the child.
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyLoggedIn) return <Navigate to={homeFor(alreadyLoggedIn.role)} replace />;

  function accountError(): string | null {
    if (accountId) return null;
    if (!name.trim()) return "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Please enter a valid email address.";
    if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = accountError() ?? childDraftError(child);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let parentId = accountId;
      if (!parentId) {
        await pb.collection("users").create<User>({
          name: name.trim(),
          email: email.trim(),
          password,
          passwordConfirm: confirm,
        });
        const auth = await pb.collection("users").authWithPassword<User>(email.trim(), password);
        parentId = auth.record.id;
        setAccountId(parentId);
      }
      await createChild(parentId, child);
      navigate("/parent", { replace: true, state: { welcome: true } });
    } catch (err) {
      setError(
        accountId
          ? `Your account was created, but the child profile could not be saved: ${errorMessage(err)}`
          : errorMessage(err, "Sign-up failed. Please try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <span aria-hidden className="text-4xl">🧸</span>
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Create a parent account</h1>
          <p className="text-sm text-slate-600">Takes about a minute</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Card>
          <h2 className="mb-4 text-lg font-semibold">1. Your details</h2>
          {accountId ? (
            <Alert tone="success">Account created for {email}. Now finish your child's profile below.</Alert>
          ) : (
            <div className="space-y-4">
              <Field label="Your name">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Password" hint={`At least ${MIN_PASSWORD} characters`}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Confirm password">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </Field>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">2. Your child</h2>
          <ChildFields value={child} onChange={setChild} disabled={busy} />
        </Card>

        {error && <Alert>{error}</Alert>}

        <Button type="submit" className="w-full" disabled={busy || !child.consent}>
          {busy ? "Saving…" : "Save Profile"}
        </Button>

        <p className="text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="inline-block py-2 font-semibold text-brand-700 underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
