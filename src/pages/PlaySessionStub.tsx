// TEMPORARY stand-in for /play/:childId until Person 1's src/pages/PlaySession.tsx is merged.
// It posts a synthetic session that matches the locked Section-3 payload, so the parent flow,
// the daily-limit screen (TC10), streak/conclusion (TC12) and the doctor dashboard can be
// tested end to end without the camera. Person 1: point the /play route in App.tsx at
// PlaySession and delete this file.
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage, pb } from "../lib/pb";
import { isDailyLimitError } from "../lib/asd";
import type { NewSession, SessionFeatures } from "../types/schema";
import { AppShell } from "../components/AppShell";
import { Alert, Button, Card } from "../components/ui";
import type { ParentHomeState } from "./ParentHome";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function syntheticSession(childId: string, mode: "game" | "video", faceVisible: boolean): NewSession {
  const n = mode === "game" ? 10 : 60; // 20 s game / 2 min video at one sample per 2 s
  const cx = rand(0.4, 0.6);
  const cy = rand(0.4, 0.6);
  const spread = rand(0.03, 0.15);
  const points: [number, number][] = faceVisible
    ? Array.from({ length: n }, () => [
        Number(clamp01(cx + rand(-spread, spread)).toFixed(3)),
        Number(clamp01(cy + rand(-spread, spread)).toFixed(3)),
      ])
    : [];
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const variance = (a: number[]) => {
    const m = mean(a);
    return mean(a.map((v) => (v - m) ** 2));
  };
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const features: SessionFeatures = {
    avg_expr: Number(rand(0.2, 0.8).toFixed(3)),
    gaze_mean_x: Number(mean(xs).toFixed(3)),
    gaze_mean_y: Number(mean(ys).toFixed(3)),
    gaze_var_x: Number(variance(xs).toFixed(4)),
    gaze_var_y: Number(variance(ys).toFixed(4)),
    tap_count: mode === "game" ? Math.round(rand(4, 14)) : 0,
    avg_response_ms: mode === "game" ? Number(rand(400, 1200).toFixed(1)) : 0,
  };
  const valid_face_ratio = faceVisible ? Number(rand(0.6, 0.98).toFixed(2)) : 0.05;
  return {
    child: childId,
    activity_type: mode,
    valid_face_ratio,
    gaze_points: points,
    features,
    status: valid_face_ratio < 0.2 ? "flagged" : "pending",
  };
}

export default function PlaySessionStub() {
  const { childId = "" } = useParams();
  const [params] = useSearchParams();
  const mode = params.get("mode") === "video" ? "video" : "game";
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(faceVisible: boolean) {
    setBusy(true);
    setError(null);
    try {
      await pb.collection("sessions").create(syntheticSession(childId, mode, faceVisible));
      navigate("/parent", { replace: true, state: { sessionSaved: true } satisfies ParentHomeState });
    } catch (err) {
      if (isDailyLimitError(err)) {
        navigate("/parent", { replace: true, state: { dailyLimit: true, childId } satisfies ParentHomeState });
        return;
      }
      setError(errorMessage(err, "Could not save the session."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <Card>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Developer stand-in</p>
        <h1 className="text-xl font-bold">{mode === "game" ? "🎯 Look & Tap" : "📺 Today's Video"}</h1>
        <p className="mt-2 text-sm text-slate-600">
          The real camera game (Person 1) plugs into this route. Until then, submit a synthetic session that follows
          the locked data contract.
        </p>
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button disabled={busy} onClick={() => void submit(true)}>
            Finish session (face visible)
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void submit(false)}>
            Finish session (camera covered)
          </Button>
        </div>
        <Link to="/parent" className="mt-4 inline-flex min-h-12 items-center font-semibold text-brand-700">
          ← Back
        </Link>
      </Card>
    </AppShell>
  );
}
