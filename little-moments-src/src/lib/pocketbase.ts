import { Preferences } from "@capacitor/preferences";
import PocketBase, { AsyncAuthStore, type RecordSubscription } from "pocketbase";
import type { SessionFeatures } from "@/lib/ml";

export interface InteractionEvent {
  type: "tap" | "gaze";
  timestamp: string;
  responseTimeMs: number;
}

export interface ScreeningSession {
  sessionId: string;
  childId: string;
  timestamp: string;
  gameModule: string;
  framesUploaded?: string[];
  interactionEvents: InteractionEvent[];
  status: "in_progress" | "uploaded" | "completed";
  features?: SessionFeatures;
  thumbnail?: string;
  thumbnailUrl?: string;
}

export interface ChildProfile {
  id: string;
  displayName: string;
  dateOfBirth: string;
  gender: string;
  consent: boolean;
  consentAt: string;
  sessionCount: number;
  streakDays: number;
  streakComplete: boolean;
}

export interface LearningVideo {
  id: string;
  title: string;
  url: string;
  file: string;
  durationSeconds: number;
  learningObjective: string;
}

export interface ScreeningResult {
  sessionId: string;
  riskScore: number;
  features: {
    expressionScores: Record<string, unknown>;
    gazeProxyMetrics: Record<string, unknown>;
    interactionMetrics: Record<string, unknown>;
  };
  gazeHeatmapUrl: string;
  modelVersion: string;
  scoredAt: string;
  aiInsight: string;
  insight?: string;
  summary?: string;
}

export interface ScreeningConclusionTrend {
  sessionsTotal: number;
  sessionsAnalyzed: number;
  sessionsExcluded: number;
  rule: string;
  level: "low" | "moderate" | "elevated" | "insufficient-data";
  direction: "worsening" | "improving" | "stable" | "unknown";
  elevatedShare: number | null;
  moderateUpShare: number | null;
  meanRisk: number | null;
  firstThirdMean: number | null;
  lastThirdMean: number | null;
  delta: number | null;
  slopePerSession: number | null;
}

const pocketBaseUrl = import.meta.env["VITE_POCKETBASE_URL"] || "http://127.0.0.1:8090";
const storedAuth =
  typeof window === "undefined"
    ? Promise.resolve("")
    : Preferences.get({ key: "pocketbase_auth" }).then(({ value }) => value ?? "");
const authStore = new AsyncAuthStore({
  initial: storedAuth,
  save: (serialized) => Preferences.set({ key: "pocketbase_auth", value: serialized }),
  clear: () => Preferences.remove({ key: "pocketbase_auth" }),
});
export const pb = new PocketBase(pocketBaseUrl, authStore);
export const authReady = storedAuth;

export interface DoctorDirectoryEntry {
  id: string;
  child: string;
  displayName: string;
  riskFlag: "pending" | "low" | "moderate" | "elevated";
}

export interface DoctorChildDetails {
  child: { id: string; displayName: string; riskFlag: DoctorDirectoryEntry["riskFlag"] };
  sessions: (ScreeningSession & { id: string })[];
  results: (ScreeningResult & { id: string; session?: string })[];
  conclusions: {
    id: string;
    child: string;
    session?: string;
    summary: string;
    createdAt: string;
    sessionsAnalyzed?: number;
    trend?: ScreeningConclusionTrend;
  }[];
}

interface AuthenticatedUser {
  id: string;
  role: "parent" | "doctor" | "scoring-worker";
  parentName?: string;
}

function isPocketBaseError(
  error: unknown,
): error is { status?: number; response?: { message?: string } } {
  return typeof error === "object" && error !== null;
}

export function isDailySessionLimitError(error: unknown) {
  return (
    isPocketBaseError(error) &&
    error.status === 400 &&
    error.response?.message?.includes("daily session limit") === true
  );
}

export function pocketBaseConfigured() {
  return Boolean(pocketBaseUrl);
}

export function isDoctorAuthenticated() {
  return pb.authStore.isValid && pb.authStore.record?.["role"] === "doctor";
}

export function isParentAuthenticated() {
  return pb.authStore.isValid && pb.authStore.record?.["role"] === "parent";
}

export async function signInDoctor(email: string, password: string) {
  await authReady;
  const response = await pb
    .collection("users")
    .authWithPassword<AuthenticatedUser>(email, password);
  if (response.record.role !== "doctor") {
    pb.authStore.clear();
    throw new Error("This account does not have doctor access.");
  }
  return response.record;
}

export async function signInParent(email: string, password: string) {
  await authReady;
  const response = await pb
    .collection("users")
    .authWithPassword<AuthenticatedUser>(email, password);
  if (response.record.role !== "parent") {
    pb.authStore.clear();
    throw new Error("This account does not have parent access.");
  }
  return response.record;
}

export async function signUpParent(parentName: string, email: string, password: string) {
  await authReady;
  await pb.collection("users").create({
    parentName: parentName.trim(),
    email: email.trim(),
    emailVisibility: false,
    password,
    passwordConfirm: password,
    role: "parent",
  });
  return signInParent(email, password);
}

export async function restoreParentSession() {
  await authReady;
  if (!pb.authStore.isValid) return false;
  try {
    const response = await pb.collection("users").authRefresh<AuthenticatedUser>();
    if (response.record.role !== "parent") pb.authStore.clear();
    return response.record.role === "parent";
  } catch (error) {
    if (isPocketBaseError(error) && error.status === 401) {
      pb.authStore.clear();
      return false;
    }
    throw error;
  }
}

export async function restoreDoctorSession() {
  await authReady;
  if (!pb.authStore.isValid) return false;
  try {
    const response = await pb.collection("users").authRefresh<AuthenticatedUser>();
    if (response.record.role !== "doctor") pb.authStore.clear();
    return response.record.role === "doctor";
  } catch (error) {
    if (isPocketBaseError(error) && error.status === 401) {
      pb.authStore.clear();
      return false;
    }
    throw error;
  }
}

export function signOut() {
  pb.authStore.clear();
}

export async function getParentChildren() {
  await authReady;
  return pb.collection("children").getFullList<ChildProfile>({
    sort: "displayName",
    fields:
      "id,displayName,dateOfBirth,gender,consent,consentAt,sessionCount,streakDays,streakComplete",
  });
}

export async function createChildProfile(profile: {
  displayName: string;
  dateOfBirth: string;
  gender: string;
}) {
  await authReady;
  const parentId = pb.authStore.record?.id;
  if (!parentId || !isParentAuthenticated()) {
    throw new Error("A signed-in parent account is required to create a child profile.");
  }
  return pb.collection("children").create<ChildProfile>({
    ...profile,
    dateOfBirth: new Date(`${profile.dateOfBirth}T00:00:00.000Z`).toISOString(),
    parent: parentId,
    consent: true,
  });
}

export async function getDailyVideo(date = new Date()) {
  const videos = await pb.collection("videos").getFullList<LearningVideo>({
    sort: "title",
    fields: "id,title,url,file,durationSeconds,learningObjective",
  });
  if (!videos.length) throw new Error("No learning videos are available today.");
  const dayNumber = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000,
  );
  const video = videos[dayNumber % videos.length];
  if (!video) throw new Error("Today's learning video could not be selected.");
  return video;
}

export async function reserveSession(session: {
  sessionId: string;
  childId: string;
  timestamp: string;
  gameModule: string;
}) {
  await authReady;
  return pb.collection("sessions").create<{ id: string }>({
    ...session,
    child: session.childId,
    status: "in_progress",
    interactionEvents: [],
  });
}

export async function getDoctorDirectory() {
  return pb.collection("doctor_directory").getFullList<DoctorDirectoryEntry>({
    sort: "displayName",
    fields: "id,child,displayName,riskFlag",
  });
}

export async function getDoctorChildDetails(childId: string) {
  const details = await pb.send<DoctorChildDetails>(
    `/api/doctor/children/${encodeURIComponent(childId)}/details`,
    { method: "GET" },
  );
  return {
    ...details,
    sessions: details.sessions.map((session) => ({
      ...session,
      thumbnailUrl: session.thumbnail
        ? `${pocketBaseUrl}/api/files/sessions/${session.id}/${encodeURIComponent(session.thumbnail)}`
        : undefined,
    })),
  };
}

type Unsubscribe = () => void;

function subscribeCollection<T extends { id: string }>(
  collection: "sessions" | "results",
  onData: (items: T[]) => void,
  onError: (error: Error) => void,
  filter?: string,
): Unsubscribe {
  let active = true;
  const records = new Map<string, T>();

  void pb
    .collection(collection)
    .getFullList<T>(filter ? { filter } : {})
    .then((items) => {
      if (!active) return;
      records.clear();
      items.forEach((item) => records.set(item.id, item));
      onData([...records.values()]);
    })
    .catch((error: unknown) => {
      if (active) onError(error instanceof Error ? error : new Error(String(error)));
    });

  let unsubscribe: (() => void) | undefined;
  void pb
    .collection(collection)
    .subscribe<T>(
      "*",
      (event: RecordSubscription<T>) => {
        if (!active) return;
        if (event.action === "delete") records.delete(event.record.id);
        else records.set(event.record.id, event.record);
        onData([...records.values()]);
      },
      filter ? { filter } : {},
    )
    .then((stop) => {
      unsubscribe = stop;
      if (!active) stop();
    })
    .catch((error: unknown) => {
      if (active) onError(error instanceof Error ? error : new Error(String(error)));
    });

  return () => {
    active = false;
    unsubscribe?.();
  };
}

export function subscribeSessions(
  onData: (sessions: ScreeningSession[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return subscribeCollection<ScreeningSession & { id: string }>("sessions", onData, onError);
}

export function subscribeResults(
  onData: (results: ScreeningResult[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return subscribeCollection<ScreeningResult & { id: string }>("results", onData, onError);
}

export function subscribeSessionResults(
  sessionId: string,
  onData: (results: ScreeningResult[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return subscribeCollection<ScreeningResult & { id: string }>(
    "results",
    onData,
    onError,
    `sessionId = "${sessionId.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
  );
}

export async function getSessionResult(sessionId: string): Promise<ScreeningResult | null> {
  try {
    return await pb
      .collection("results")
      .getFirstListItem<ScreeningResult>(
        `sessionId = "${sessionId.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
      );
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404)
      return null;
    throw error;
  }
}

export async function uploadSession(
  recordId: string,
  session: Omit<ScreeningSession, "framesUploaded" | "status" | "features" | "thumbnail">,
  features: SessionFeatures,
  thumbnail: Blob | null,
  onProgress: (complete: number, total: number) => void,
) {
  const form = new FormData();
  form.append("sessionId", session.sessionId);
  form.append("childId", session.childId);
  form.append("child", session.childId);
  form.append("timestamp", session.timestamp);
  form.append("gameModule", session.gameModule);
  form.append("interactionEvents", JSON.stringify(session.interactionEvents));
  form.append("features", JSON.stringify(features));
  if (thumbnail) form.append("thumbnail", thumbnail, "session-thumbnail.jpg");
  form.append("status", "uploaded");

  const saved = await pb.collection("sessions").update(recordId, form);
  onProgress(1, 1);

  return {
    ...session,
    features,
    thumbnail: typeof saved.thumbnail === "string" ? saved.thumbnail : undefined,
    status: "uploaded" as const,
    ...saved,
  };
}
