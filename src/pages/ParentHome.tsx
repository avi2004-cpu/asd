// Step 2.3 -- parent home: child card, streak progress, play buttons, daily-limit screen.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { errorMessage, pb } from "../lib/pb";
import { useAuth } from "../lib/auth";
import { ageLabel, dailyLimitReached, fetchConfig, sessionsToday, type AsdConfig } from "../lib/asd";
import type { Child } from "../types/schema";
import { AppShell } from "../components/AppShell";
import { DailyLimitScreen } from "../components/DailyLimitScreen";
import { Alert, Button, Card, ProgressBar, Spinner } from "../components/ui";
import { ChildFields, EMPTY_CHILD, childDraftError, createChild, type ChildDraft } from "../components/ChildFields";

/** Router state other screens may pass when navigating back to /parent. */
export interface ParentHomeState {
  dailyLimit?: boolean; // session POST was rejected by the daily-limit hook (HTTP 400)
  childId?: string;
  sessionSaved?: boolean;
  welcome?: boolean;
}

export default function ParentHome() {
  const user = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state ?? {}) as ParentHomeState;

  const [children, setChildren] = useState<Child[] | null>(null);
  const [cfg, setCfg] = useState<AsdConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitChild, setLimitChild] = useState<Child | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [list, config] = await Promise.all([
        pb.collection("children").getFullList<Child>({
          filter: pb.filter("parent = {:id}", { id: user.id }),
          sort: "created",
        }),
        fetchConfig(),
      ]);
      setChildren(list);
      setCfg(config);
    } catch (err) {
      setError(errorMessage(err, "Could not load your child's profile."));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  function clearNavState() {
    navigate("/parent", { replace: true, state: null });
  }

  // Full-screen "Come back tomorrow" -- from a rejected session POST, or a tap after the limit.
  if (navState.dailyLimit || limitChild) {
    const fromState = children?.find((c) => c.id === navState.childId);
    return (
      <AppShell>
        <DailyLimitScreen
          childName={limitChild?.name ?? fromState?.name}
          onDone={() => {
            setLimitChild(null);
            clearNavState();
            void load();
          }}
        />
      </AppShell>
    );
  }

  function start(child: Child, mode: "game" | "video") {
    if (cfg && dailyLimitReached(child, cfg)) {
      setLimitChild(child);
      return;
    }
    navigate(`/play/${child.id}?mode=${mode}`);
  }

  return (
    <AppShell>
      {navState.sessionSaved && (
        <div className="mb-4">
          <Alert tone="success">🎉 Session saved. Well done!</Alert>
        </div>
      )}
      {navState.welcome && (
        <div className="mb-4">
          <Alert tone="success">Welcome! Your child's profile is ready.</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4 space-y-3">
          <Alert>{error}</Alert>
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {!children || !cfg ? (
        !error && <Spinner />
      ) : children.length === 0 || adding ? (
        <AddChildCard
          parentId={user!.id}
          canCancel={children.length > 0}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
          }}
        />
      ) : (
        <div className="space-y-5">
          {children.map((c) => (
            <ChildCard key={c.id} child={c} cfg={cfg} onStart={(mode) => start(c, mode)} />
          ))}
          <Button variant="ghost" className="w-full" onClick={() => setAdding(true)}>
            + Add another child
          </Button>
        </div>
      )}
    </AppShell>
  );
}

function ChildCard({
  child,
  cfg,
  onStart,
}: {
  child: Child;
  cfg: AsdConfig;
  onStart: (mode: "game" | "video") => void;
}) {
  const done = child.session_count || 0;
  const streakComplete = done >= cfg.streak_length;
  const today = sessionsToday(child);
  const limitReached = dailyLimitReached(child, cfg);
  const age = ageLabel(child.dob);

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex items-center gap-4 bg-gradient-to-r from-brand-50 to-sky-50 p-4 sm:p-6">
        <div
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-3xl font-bold text-brand-700 shadow-sm"
        >
          {child.name.trim().charAt(0).toUpperCase() || "🙂"}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-slate-900">{child.name}</h2>
          <p className="text-sm text-slate-600">
            {[age, child.gender && child.gender[0].toUpperCase() + child.gender.slice(1)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <ProgressBar value={done} max={cfg.streak_length} label="Streak progress" />
        {streakComplete ? (
          <Alert tone="success">
            ⭐ Streak complete! Your doctor can now review {child.name}'s summary. You can keep playing to add more
            sessions.
          </Alert>
        ) : (
          <p className="text-sm text-slate-600">
            {cfg.streak_length - done} more session{cfg.streak_length - done === 1 ? "" : "s"} to complete the streak.
          </p>
        )}

        <p className="text-sm text-slate-600">
          Today: <span className="font-semibold tabular-nums">{today}</span> of {cfg.daily_limit} sessions
        </p>

        {limitReached ? (
          <div className="rounded-2xl bg-indigo-50 p-4 text-center text-indigo-900">
            <p className="text-lg font-semibold">🌙 Come back tomorrow!</p>
            <p className="text-sm">Daily session limit reached.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onStart("game")}
              className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl bg-amber-400 px-4 py-5 text-xl font-bold text-amber-950 shadow-sm transition-transform hover:bg-amber-300 active:scale-[0.98]"
            >
              <span aria-hidden className="text-4xl">🎯</span>
              Play Look &amp; Tap
            </button>
            <button
              type="button"
              onClick={() => onStart("video")}
              className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl bg-sky-500 px-4 py-5 text-xl font-bold text-white shadow-sm transition-transform hover:bg-sky-400 active:scale-[0.98]"
            >
              <span aria-hidden className="text-4xl">📺</span>
              Watch Today's Video
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function AddChildCard({
  parentId,
  canCancel,
  onCancel,
  onSaved,
}: {
  parentId: string;
  canCancel: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ChildDraft>(EMPTY_CHILD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = childDraftError(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createChild(parentId, draft);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Could not save the profile."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-xl font-semibold">Add your child's profile</h2>
      <p className="mb-4 text-sm text-slate-600">We need a few details before the first play session.</p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ChildFields value={draft} onChange={setDraft} disabled={busy} />
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" className="w-full sm:flex-1" disabled={busy || !draft.consent}>
            {busy ? "Saving…" : "Save Profile"}
          </Button>
          {canCancel && (
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
