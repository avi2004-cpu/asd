import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Heart, ShieldCheck } from "lucide-react";
import faceImage from "@/assets/friendly-face.jpg";
import { Button } from "@/components/ui/button";
import { isParentAuthenticated, pocketBaseConfigured, signOut, uploadSession, type InteractionEvent } from "@/lib/pocketbase";

type Screen = "home" | "attention" | "taps" | "uploading" | "done";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Play Together — Little Moments" },
      { name: "description", content: "A brief, gentle play activity for the Little Moments screening prototype." },
      { property: "og:title", content: "Play Together — Little Moments" },
      { property: "og:description", content: "A brief, gentle play activity for the Little Moments screening prototype." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChildApp,
});

function ChildApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [childId, setChildId] = useState("");
  const [cameraConsent, setCameraConsent] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [phase, setPhase] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [target, setTarget] = useState({ left: 46, top: 40 });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [saveComplete, setSaveComplete] = useState(false);
  const targetShownAt = useRef(0);
  const frames = useRef<string[]>([]);
  const interactions = useRef<InteractionEvent[]>([]);
  const sessionTimestamp = useRef("");
  const cameraActive = useRef(false);
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraLoop = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards a camera setup that resolves after the session has already moved on
  // (unmounted, or past the attention phase) so it can't restart activity late.
  const cameraSetupCancelled = useRef(false);
  const cameraElementId = "little-moments-camera";
  const getCameraPreview = async () => (await import("@capgo/camera-preview")).CameraPreview;

  const stopCamera = async () => {
    cameraSetupCancelled.current = true;
    if (cameraLoop.current) clearInterval(cameraLoop.current);
    cameraLoop.current = null;
    if (sessionTimer.current) clearTimeout(sessionTimer.current);
    sessionTimer.current = null;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = null;
    if (!cameraActive.current) return;
    cameraActive.current = false;
    try {
      const CameraPreview = await getCameraPreview();
      await CameraPreview.stop();
    } catch {
      // A camera that already stopped should not interrupt session completion.
    }
  };

  useEffect(() => () => {
    void stopCamera();
  }, []);

  const finishGames = async () => {
    await stopCamera();
    setScreen("uploading");
    setUploadError("");
    try {
      await uploadSession(
        {
          sessionId,
          childId: childId.trim(),
          timestamp: sessionTimestamp.current,
          gameModule: "social-attention + tap-response",
          interactionEvents: interactions.current,
        },
        frames.current,
        (complete, total) => setUploadProgress(total ? Math.round((complete / total) * 100) : 100),
      );
      setSaveComplete(true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The session could not be saved.");
    }
    setScreen("done");
  };

  // Camera setup runs independently of the game timers below, so a hung or
  // never-answered permission prompt can no longer block the game flow.
  const startCameraInBackground = () => {
    cameraSetupCancelled.current = false;
    void (async () => {
      try {
        const CameraPreview = await getCameraPreview();
        await CameraPreview.start({
          parent: cameraElementId,
          className: "camera-feed",
          position: "front",
          toBack: false,
          disableAudio: true,
          storeToFile: false,
          aspectMode: "cover",
        });
        if (cameraSetupCancelled.current) {
          // Session moved on (or unmounted) while we were waiting on the camera.
          try {
            await CameraPreview.stop();
          } catch {
            // ignore
          }
          return;
        }
        cameraActive.current = true;
        setCameraMessage("Camera is on. Frames are sampled every 2 seconds.");
        cameraLoop.current = setInterval(async () => {
          if (!cameraActive.current) return;
          try {
            const sample = await CameraPreview.captureSample({ quality: 65, mirrorFrontCamera: true });
            frames.current.push(sample.value.startsWith("data:") ? sample.value : `data:image/jpeg;base64,${sample.value}`);
          } catch {
            setCameraMessage("Camera sampling paused. The play activity can continue.");
          }
        }, 2000);
      } catch {
        if (cameraSetupCancelled.current) return;
        cameraActive.current = false;
        setCameraMessage("Camera access is unavailable. You can still play, and no photos will be saved.");
      }
    })();
  };

  const begin = async () => {
    if (!childId.trim()) return;
    if (!isParentAuthenticated()) {
      setUploadError("A parent or guardian must sign in before starting a session.");
      return;
    }
    const newId = crypto.randomUUID();
    setSessionId(newId);
    sessionTimestamp.current = new Date().toISOString();
    frames.current = [];
    interactions.current = [];
    setPhase(0);
    setTapCount(0);
    setUploadProgress(0);
    setSaveComplete(false);
    setUploadError("");
    setScreen("attention");

    // Timers start immediately and no longer wait on the camera in any way.
    sessionTimer.current = setTimeout(() => {
      setPhase(1);
      sessionTimer.current = setTimeout(() => {
        setScreen("taps");
        scheduleTarget();
      }, 10000);
    }, 10000);

    if (!cameraConsent) {
      setCameraMessage("Camera sampling is off. The games can still be completed.");
    } else {
      startCameraInBackground();
    }
  };

  const scheduleTarget = () => {
    setTarget({ left: 12 + Math.random() * 76, top: 12 + Math.random() * 76 });
    targetShownAt.current = Date.now();
    tapTimer.current = setTimeout(() => void finishGames(), 20000);
  };

  const handleTap = () => {
    const now = Date.now();
    interactions.current.push({
      type: "tap",
      timestamp: new Date(now).toISOString(),
      responseTimeMs: targetShownAt.current ? Math.max(0, now - targetShownAt.current) : 0,
    });
    setTapCount((count) => count + 1);
    setTarget({ left: 8 + Math.random() * 78, top: 8 + Math.random() * 78 });
    targetShownAt.current = now;
  };

  const reset = () => {
    setScreen("home");
    setUploadError("");
    setCameraMessage("");
    setCameraConsent(false);
  };

  const parentSignOut = () => {
    signOut();
    setChildId("");
  };

  return (
    <div className="child-shell app-shell">
      <div className="camera-preview-slot" id={cameraElementId} aria-hidden="true" />
      <header className="child-header">
        <div className="brand-mark"><span className="brand-dot" /> Little Moments</div>
        <nav className="child-header-links">
          {isParentAuthenticated()
            ? <button type="button" className="muted-line child-signout" onClick={parentSignOut}>Parent sign out</button>
            : <Link to="/parent/login" className="muted-line">Parent sign in</Link>}
          <Link to="/doctor/login" aria-label="Clinician sign in" className="muted-line">For clinicians</Link>
        </nav>
      </header>
      <main className="child-main">
        {screen === "home" && <>
          <div className="child-art"><img src={faceImage} alt="Friendly illustrated face" width={816} height={816} /></div>
          <h1 className="child-title">Ready to play?</h1>
          <p className="child-copy">A grown-up can help you get started.</p>
          {!isParentAuthenticated() && <div className="notice alert">A parent or guardian must <Link className="text-link" to="/parent/login">sign in</Link> before starting a session.</div>}
          <label className="camera-note" htmlFor="child-id">Child ID</label><br />
          <input id="child-id" className="child-field" value={childId} onChange={(event) => setChildId(event.target.value)} placeholder="Enter child ID" autoComplete="off" />
          <label className="consent-row">
            <input type="checkbox" checked={cameraConsent} onChange={(event) => setCameraConsent(event.target.checked)} />
            <span><ShieldCheck size={17} aria-hidden="true" /> I am a parent or guardian and agree to sample and upload camera frames during this play activity. Camera is optional.</span>
          </label>
          {!pocketBaseConfigured() && <div className="notice alert">Session saving needs a PocketBase URL. The play activity is still available.</div>}
          <Button className="primary-touch" onClick={() => void begin()} disabled={!childId.trim() || !isParentAuthenticated()}>Start <Heart size={20} fill="currentColor" /></Button>
        </>}
        {screen === "attention" && <>
          <p className="camera-note">Let’s look together</p>
          <h1 className="child-title">Look at what you see</h1>
          <div className="play-progress" aria-label={`Part ${phase + 1} of 2`}><span className="active" /><span className={phase > 0 ? "active" : ""} /></div>
          <div className="play-zone" aria-live="polite">
            {phase === 0 ? <img className="stimulus-image" src={faceImage} alt="A friendly face" /> : <div className="moving-shape" aria-label="Moving shape" />}
          </div>
          <p className="child-copy">Nice looking!</p>
          {cameraMessage && <p className="camera-note">{cameraMessage}</p>}
        </>}
        {screen === "taps" && <>
          <p className="camera-note">A little tapping game</p>
          <h1 className="child-title">Tap the star!</h1>
          <div className="play-zone" aria-label="Tap game play area">
            <Button className="tap-target" style={{ left: `${target.left}%`, top: `${target.top}%`, transform: "translate(-50%, -50%)" }} onClick={handleTap} aria-label="Tap the star">★</Button>
          </div>
          <p className="child-copy">You found {tapCount} {tapCount === 1 ? "star" : "stars"}!</p>
          {cameraMessage && <p className="camera-note">{cameraMessage}</p>}
        </>}
        {screen === "uploading" && <>
          <div className="child-art"><Check size={70} aria-hidden="true" /></div>
          <h1 className="child-title">All done!</h1>
          <p className="child-copy">Saving your play session…</p>
          <div className="upload-track" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${uploadProgress}%` }} /></div>
        </>}
        {screen === "done" && <>
          <div className="child-art"><Check size={70} aria-hidden="true" /></div>
          <h1 className="child-title">Great job!</h1>
          <p className="child-copy">Thanks for playing with us.</p>
          {saveComplete && <div className="notice">Your play session has been saved.</div>}
          {uploadError && <div className="notice alert">The session was not saved: {uploadError}</div>}
          {uploadError && <Button variant="outline" onClick={() => void finishGames()}>Try saving again</Button>}
          <div><Button className="primary-touch" onClick={reset}>Finish <Check size={19} /></Button></div>
        </>}
      </main>
      <footer className="child-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}
