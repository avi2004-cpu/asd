import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Heart, Plus, ShieldCheck, Video } from "lucide-react";
import faceImage from "@/assets/friendly-face.jpg";
import { Button } from "@/components/ui/button";
import { SessionFeatureCollector, warmUpMl } from "@/lib/ml";
import {
  createChildProfile,
  getDailyVideo,
  getParentChildren,
  isDailySessionLimitError,
  isParentAuthenticated,
  pb,
  pocketBaseConfigured,
  reserveSession,
  restoreParentSession,
  signOut,
  uploadSession,
  type ChildProfile,
  type InteractionEvent,
  type LearningVideo,
} from "@/lib/pocketbase";

type Screen =
  | "checking"
  | "profiles"
  | "createProfile"
  | "attention"
  | "taps"
  | "followEyes"
  | "videoLoading"
  | "video"
  | "uploading"
  | "done"
  | "tomorrow";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Play Together — Little Moments" },
      {
        name: "description",
        content: "A brief, gentle play activity for the Little Moments screening prototype.",
      },
      { property: "og:title", content: "Play Together — Little Moments" },
      {
        property: "og:description",
        content: "A brief, gentle play activity for the Little Moments screening prototype.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChildApp,
});

function ChildApp() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("checking");
  const [childProfiles, setChildProfiles] = useState<ChildProfile[]>([]);
  const [childId, setChildId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [profileConsent, setProfileConsent] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<LearningVideo | null>(null);
  const [phase, setPhase] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [target, setTarget] = useState({ left: 46, top: 40 });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [saveComplete, setSaveComplete] = useState(false);
  const targetShownAt = useRef(0);
  const interactions = useRef<InteractionEvent[]>([]);
  const sessionTimestamp = useRef("");
  const cameraActive = useRef(false);
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraLoop = useRef<ReturnType<typeof setInterval> | null>(null);
  const followEyesTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const extractionInFlight = useRef(false);
  const featureCollector = useRef<SessionFeatureCollector | null>(null);
  const sessionRecordIdRef = useRef("");
  const sessionIdRef = useRef("");
  const childIdRef = useRef("");
  const activeExtraction = useRef<Promise<void> | null>(null);
  const lastVideoTime = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Guards a camera setup that resolves after the session has already moved on
  // (unmounted, or past the attention phase) so it can't restart activity late.
  const cameraSetupCancelled = useRef(false);
  const cameraElementId = "little-moments-camera";
  const getCameraPreview = useCallback(
    async () => (await import("@capgo/camera-preview")).CameraPreview,
    [],
  );

  useEffect(() => {
    let active = true;
    void restoreParentSession()
      .then(async (authenticated) => {
        if (!active) return;
        if (!authenticated) {
          await navigate({ to: "/parent/login" });
          return;
        }
        const profiles = await getParentChildren();
        if (!active) return;
        setChildProfiles(profiles);
        const firstProfile = profiles[0];
        if (firstProfile) {
          setChildId(firstProfile.id);
          setScreen("profiles");
        } else {
          setScreen("createProfile");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setUploadError(
            error instanceof Error ? error.message : "Your parent account could not be checked.",
          );
          setScreen("profiles");
        }
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const stopCamera = useCallback(async () => {
    cameraSetupCancelled.current = true;
    if (cameraLoop.current) clearInterval(cameraLoop.current);
    cameraLoop.current = null;
    if (sessionTimer.current) clearTimeout(sessionTimer.current);
    sessionTimer.current = null;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = null;
    if (followEyesTimer.current) clearInterval(followEyesTimer.current);
    followEyesTimer.current = null;
    if (!cameraActive.current) return;
    cameraActive.current = false;
    await activeExtraction.current;
    try {
      const CameraPreview = await getCameraPreview();
      await CameraPreview.stop();
    } catch {
      // A camera that already stopped should not interrupt session completion.
    }
  }, [getCameraPreview]);

  useEffect(
    () => () => {
      void stopCamera();
    },
    [stopCamera],
  );

  const finishGames = async () => {
    await stopCamera();
    setScreen("uploading");
    setUploadError("");
    try {
      const collectedFeatures = await featureCollector.current?.finish();
      const completedFeatures = collectedFeatures ?? (await new SessionFeatureCollector().finish());
      await uploadSession(
        sessionRecordIdRef.current,
        {
          sessionId: sessionIdRef.current,
          childId: childIdRef.current,
          timestamp: sessionTimestamp.current,
          gameModule:
            "social-vs-non-social-attention + tap-response + follow-my-eyes + daily-video",
          interactionEvents: interactions.current,
        },
        completedFeatures.features,
        completedFeatures.thumbnail,
        (complete, total) => setUploadProgress(total ? Math.round((complete / total) * 100) : 100),
      );
      setChildProfiles(await getParentChildren());
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
        await warmUpMl();
        if (cameraSetupCancelled.current) return;
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
        setCameraMessage(
          "Camera is on. Features are computed on this device; only feature values and one small grayscale thumbnail are saved.",
        );
        cameraLoop.current = setInterval(async () => {
          if (!cameraActive.current || extractionInFlight.current) return;
          extractionInFlight.current = true;
          const extraction = (async () => {
            try {
              const sample = await CameraPreview.captureSample({
                quality: 65,
                mirrorFrontCamera: true,
              });
              const frame = sample.value.startsWith("data:")
                ? sample.value
                : `data:image/jpeg;base64,${sample.value}`;
              await featureCollector.current?.addFrame(frame);
            } catch {
              setCameraMessage(
                "On-device feature extraction is temporarily unavailable. Play can continue; some features may be missing.",
              );
            } finally {
              extractionInFlight.current = false;
            }
          })();
          activeExtraction.current = extraction;
          await extraction;
          activeExtraction.current = null;
        }, 2000);
      } catch {
        if (cameraSetupCancelled.current) return;
        cameraActive.current = false;
        setCameraMessage(
          "Camera or on-device feature extraction is unavailable. You can still play without camera features.",
        );
      }
    })();
  };

  const begin = async () => {
    if (!childId.trim() || creatingProfile) return;
    if (!isParentAuthenticated()) {
      setUploadError("A parent or guardian must sign in before starting a session.");
      return;
    }
    setCreatingProfile(true);
    setUploadError("");
    const newId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    try {
      const reservation = await reserveSession({
        sessionId: newId,
        childId: childId.trim(),
        timestamp,
        gameModule: "social-vs-non-social-attention + tap-response + follow-my-eyes + daily-video",
      });
      sessionRecordIdRef.current = reservation.id;
      sessionIdRef.current = newId;
      childIdRef.current = childId.trim();
      sessionTimestamp.current = timestamp;
      featureCollector.current = new SessionFeatureCollector();
      interactions.current = [];
      setPhase(0);
      setTapCount(0);
      setUploadProgress(0);
      setSaveComplete(false);
      setScreen("attention");

      sessionTimer.current = setTimeout(() => {
        setPhase(1);
        sessionTimer.current = setTimeout(() => {
          setScreen("taps");
          scheduleTarget();
        }, 10000);
      }, 10000);

      if (!cameraConsent) {
        setCameraMessage(
          "Camera sampling is off. The games can still be completed without frame features.",
        );
      } else {
        startCameraInBackground();
      }
    } catch (error) {
      if (isDailySessionLimitError(error)) {
        setScreen("tomorrow");
      } else {
        setUploadError(
          error instanceof Error ? error.message : "The session could not be started.",
        );
        setScreen("profiles");
      }
    } finally {
      setCreatingProfile(false);
    }
  };

  const startFollowEyes = () => {
    setScreen("followEyes");
    let step = 0;
    const locations = [
      { left: 22, top: 25 },
      { left: 76, top: 28 },
      { left: 70, top: 75 },
      { left: 28, top: 72 },
      { left: 50, top: 48 },
    ];
    targetShownAt.current = Date.now();
    const firstLocation = locations[0];
    if (!firstLocation) {
      void startDailyVideo();
      return;
    }
    setTarget(firstLocation);
    followEyesTimer.current = setInterval(() => {
      step += 1;
      if (step >= locations.length) {
        if (followEyesTimer.current) clearInterval(followEyesTimer.current);
        followEyesTimer.current = null;
        void startDailyVideo();
        return;
      }
      const nextLocation = locations[step];
      if (!nextLocation) {
        void startDailyVideo();
        return;
      }
      setTarget(nextLocation);
      targetShownAt.current = Date.now();
    }, 2200);
  };

  const startDailyVideo = async () => {
    setScreen("videoLoading");
    try {
      setSelectedVideo(await getDailyVideo());
      setScreen("video");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Today's video could not be loaded.");
      setScreen("videoLoading");
    }
  };

  const createProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingProfile(true);
    setUploadError("");
    try {
      const profile = await createChildProfile({
        displayName: profileName.trim(),
        dateOfBirth,
        gender,
      });
      const profiles = await getParentChildren();
      setChildProfiles(profiles);
      setChildId(profile.id);
      setProfileName("");
      setDateOfBirth("");
      setGender("");
      setProfileConsent(false);
      setScreen("profiles");
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "The child profile could not be created.",
      );
    } finally {
      setCreatingProfile(false);
    }
  };

  const scheduleTarget = () => {
    setTarget({ left: 12 + Math.random() * 76, top: 12 + Math.random() * 76 });
    targetShownAt.current = Date.now();
    tapTimer.current = setTimeout(startFollowEyes, 20000);
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
    setScreen("profiles");
    setUploadError("");
    setCameraMessage("");
    setCameraConsent(false);
    void getParentChildren()
      .then(setChildProfiles)
      .catch((error: unknown) => {
        setUploadError(
          error instanceof Error ? error.message : "Session progress could not be refreshed.",
        );
      });
  };

  const parentSignOut = () => {
    signOut();
    setChildId("");
    void navigate({ to: "/parent/login" });
  };

  const selectedProfile = childProfiles.find((profile) => profile.id === childId);
  const videoUrl = selectedVideo?.file
    ? pb.getFileUrl(selectedVideo, selectedVideo.file)
    : selectedVideo?.url;

  return (
    <div className="child-shell app-shell">
      <div className="camera-preview-slot" id={cameraElementId} aria-hidden="true" />
      <header className="child-header">
        <div className="brand-mark">
          <span className="brand-dot" /> Little Moments
        </div>
        <nav className="child-header-links">
          {isParentAuthenticated() ? (
            <button type="button" className="muted-line child-signout" onClick={parentSignOut}>
              Parent sign out
            </button>
          ) : (
            <Link to="/parent/login" className="muted-line">
              Parent sign in
            </Link>
          )}
          <Link to="/doctor/login" aria-label="Clinician sign in" className="muted-line">
            For clinicians
          </Link>
        </nav>
      </header>
      <main className="child-main">
        {screen === "checking" && <p className="child-copy">Checking your parent account…</p>}
        {screen === "profiles" && (
          <>
            <div className="child-art">
              <img src={faceImage} alt="Friendly illustrated face" width={816} height={816} />
            </div>
            <h1 className="child-title">Ready to play?</h1>
            <p className="child-copy">Choose a child profile to start today's activities.</p>
            {uploadError && (
              <div className="notice alert" role="alert">
                {uploadError}
              </div>
            )}
            {childProfiles.length > 1 && (
              <>
                <label className="camera-note" htmlFor="child-profile">
                  Child profile
                </label>
                <br />
                <select
                  id="child-profile"
                  className="child-field"
                  value={childId}
                  onChange={(event) => setChildId(event.target.value)}
                >
                  {childProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName}
                    </option>
                  ))}
                </select>
              </>
            )}
            {selectedProfile && childProfiles.length === 1 && (
              <p className="selected-child-name">{selectedProfile.displayName}</p>
            )}
            {selectedProfile && (
              <section className="streak-card" aria-label="Session progress">
                <div className="streak-copy">
                  <strong>
                    {Math.min(selectedProfile.sessionCount, 25)} of 25 sessions complete
                  </strong>
                  <span>{selectedProfile.streakDays} day streak</span>
                </div>
                <div
                  className="upload-track"
                  role="progressbar"
                  aria-label="Progress to 25 sessions"
                  aria-valuenow={Math.min(selectedProfile.sessionCount, 25)}
                  aria-valuemin={0}
                  aria-valuemax={25}
                >
                  <span
                    style={{ width: `${Math.min(selectedProfile.sessionCount / 25, 1) * 100}%` }}
                  />
                </div>
              </section>
            )}
            <label className="consent-row camera-consent">
              <input
                type="checkbox"
                checked={cameraConsent}
                onChange={(event) => setCameraConsent(event.target.checked)}
              />
              <span>
                <ShieldCheck size={17} aria-hidden="true" /> I agree to on-device camera feature
                extraction during today's activities. Derived values and one small grayscale
                thumbnail may be uploaded; raw frames are not. This is optional.
              </span>
            </label>
            {!pocketBaseConfigured() && (
              <div className="notice alert">Session saving needs a PocketBase URL.</div>
            )}
            <Button
              className="primary-touch"
              onClick={() => void begin()}
              disabled={!childId || creatingProfile || !isParentAuthenticated()}
            >
              {creatingProfile ? "Checking today's limit…" : "Start today's activities"}{" "}
              <Heart size={20} fill="currentColor" />
            </Button>
            <Button
              className="profile-add"
              variant="outline"
              onClick={() => setScreen("createProfile")}
            >
              <Plus size={16} /> Add child profile
            </Button>
          </>
        )}
        {screen === "createProfile" && (
          <>
            {childProfiles.length > 0 && (
              <button
                className="text-link profile-back profile-back-button"
                type="button"
                onClick={() => setScreen("profiles")}
              >
                <ArrowLeft size={15} /> Back to profiles
              </button>
            )}
            <section className="panel profile-panel">
              <h1>Create a child profile</h1>
              <p>Profile information stays with your parent account.</p>
              <form onSubmit={(event) => void createProfile(event)}>
                <label htmlFor="child-name">Child's name</label>
                <input
                  id="child-name"
                  className="filter-input login-input"
                  autoComplete="off"
                  maxLength={100}
                  required
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                />
                <label htmlFor="child-dob">Date of birth</label>
                <input
                  id="child-dob"
                  className="filter-input login-input"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                />
                <label htmlFor="child-gender">Gender</label>
                <select
                  id="child-gender"
                  className="filter-input login-input"
                  required
                  value={gender}
                  onChange={(event) => setGender(event.target.value)}
                >
                  <option value="">Choose an option</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
                <label className="consent-row profile-consent">
                  <input
                    type="checkbox"
                    checked={profileConsent}
                    required
                    onChange={(event) => setProfileConsent(event.target.checked)}
                  />
                  <span>
                    I am this child's parent or legal guardian and consent to creating a profile and
                    saving their activity data. The server records the consent timestamp.
                  </span>
                </label>
                {uploadError && (
                  <div className="notice alert" role="alert">
                    {uploadError}
                  </div>
                )}
                <Button type="submit" disabled={creatingProfile || !profileConsent}>
                  {creatingProfile ? "Creating profile…" : "Save profile"}
                </Button>
              </form>
            </section>
          </>
        )}
        {screen === "attention" && (
          <>
            <p className="camera-note">Let’s look together</p>
            <h1 className="child-title">Look at what you see</h1>
            <div className="play-progress" aria-label={`Part ${phase + 1} of 2`}>
              <span className="active" />
              <span className={phase > 0 ? "active" : ""} />
            </div>
            <div className="play-zone" aria-live="polite">
              {phase === 0 ? (
                <img className="stimulus-image" src={faceImage} alt="A friendly face" />
              ) : (
                <div className="moving-shape" aria-label="Moving shape" />
              )}
            </div>
            <p className="child-copy">Nice looking!</p>
            {cameraMessage && <p className="camera-note">{cameraMessage}</p>}
          </>
        )}
        {screen === "taps" && (
          <>
            <p className="camera-note">A little tapping game</p>
            <h1 className="child-title">Tap the star!</h1>
            <div className="play-zone" aria-label="Tap game play area">
              <Button
                className="tap-target"
                style={{
                  left: `${target.left}%`,
                  top: `${target.top}%`,
                  transform: "translate(-50%, -50%)",
                }}
                onClick={handleTap}
                aria-label="Tap the star"
              >
                ★
              </Button>
            </div>
            <p className="child-copy">
              You found {tapCount} {tapCount === 1 ? "star" : "stars"}!
            </p>
            {cameraMessage && <p className="camera-note">{cameraMessage}</p>}
          </>
        )}
        {screen === "followEyes" && (
          <>
            <p className="camera-note">Follow My Eyes</p>
            <h1 className="child-title">Look where the star goes</h1>
            <p className="child-copy">Keep your eyes on the star as it moves around.</p>
            <div className="play-zone follow-zone" aria-label="Follow the star with your eyes">
              <span
                className="follow-target"
                style={{ left: `${target.left}%`, top: `${target.top}%` }}
                aria-label="Follow this star"
              >
                ★
              </span>
            </div>
            <p className="camera-note">
              This activity uses gaze-proxy samples only when camera access is enabled.
            </p>
          </>
        )}
        {screen === "videoLoading" && (
          <>
            <Video size={42} aria-hidden="true" />
            <h1 className="child-title">Today's video</h1>
            <p className="child-copy">{uploadError || "Loading today's learning video…"}</p>
            {uploadError && (
              <Button onClick={() => void startDailyVideo()}>Try loading again</Button>
            )}
          </>
        )}
        {screen === "video" && selectedVideo && (
          <>
            <p className="camera-note">
              Today's learning video · {selectedVideo.learningObjective}
            </p>
            <h1 className="child-title">{selectedVideo.title}</h1>
            <video
              ref={videoRef}
              className="daily-video"
              src={videoUrl}
              autoPlay
              muted
              playsInline
              controls={false}
              disablePictureInPicture
              onEnded={() => void finishGames()}
              onCanPlay={() => {
                void videoRef.current
                  ?.play()
                  .catch(() =>
                    setUploadError("Autoplay is blocked. Tap the button to play today's video."),
                  );
              }}
              onTimeUpdate={(event) => {
                lastVideoTime.current = event.currentTarget.currentTime;
              }}
              onSeeking={(event) => {
                if (event.currentTarget.currentTime > lastVideoTime.current + 0.25) {
                  event.currentTarget.currentTime = lastVideoTime.current;
                }
              }}
              onContextMenu={(event) => event.preventDefault()}
              onError={() =>
                setUploadError("The video could not be played. Check your connection and retry.")
              }
            />
            {uploadError && (
              <div className="notice alert" role="alert">
                {uploadError}
              </div>
            )}
            {uploadError && (
              <Button
                onClick={(event) => {
                  setUploadError("");
                  void videoRef.current
                    ?.play()
                    .catch(() => setUploadError("Tap again to start today's video."));
                }}
              >
                Retry video
              </Button>
            )}
            <p className="child-copy">Watch the video to the end to finish today's activities.</p>
            {cameraMessage && <p className="camera-note">{cameraMessage}</p>}
          </>
        )}
        {screen === "uploading" && (
          <>
            <div className="child-art">
              <Check size={70} aria-hidden="true" />
            </div>
            <h1 className="child-title">All done!</h1>
            <p className="child-copy">Saving your play session…</p>
            <div
              className="upload-track"
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          </>
        )}
        {screen === "done" && (
          <>
            <div className="child-art">
              <Check size={70} aria-hidden="true" />
            </div>
            <h1 className="child-title">Great job!</h1>
            <p className="child-copy">Thanks for playing with us.</p>
            {saveComplete && <div className="notice">Your play session has been saved.</div>}
            {uploadError && (
              <div className="notice alert">The session was not saved: {uploadError}</div>
            )}
            {uploadError && (
              <Button variant="outline" onClick={() => void finishGames()}>
                Try saving again
              </Button>
            )}
            <div>
              <Button className="primary-touch" onClick={reset}>
                Finish <Check size={19} />
              </Button>
            </div>
          </>
        )}
        {screen === "tomorrow" && (
          <>
            <div className="child-art">
              <Video size={66} aria-hidden="true" />
            </div>
            <h1 className="child-title">Come back tomorrow</h1>
            <p className="child-copy">
              Today's session limit for this child has been reached. You can play again after the
              daily reset.
            </p>
            <Button variant="outline" onClick={() => setScreen("profiles")}>
              Choose another child
            </Button>
          </>
        )}
      </main>
      <footer className="child-footer">Prototype screening aid — not a diagnostic tool</footer>
    </div>
  );
}
