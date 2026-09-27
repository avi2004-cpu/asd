import PocketBase, { type RecordSubscription } from "pocketbase";

export interface InteractionEvent {
  type: "tap";
  timestamp: string;
  responseTimeMs: number;
}

export interface ScreeningSession {
  sessionId: string;
  childId: string;
  timestamp: string;
  gameModule: string;
  framesUploaded: string[];
  interactionEvents: InteractionEvent[];
  status: "uploaded";
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

const pocketBaseUrl = import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
const pb = new PocketBase(pocketBaseUrl);

export function pocketBaseConfigured() {
  return Boolean(pocketBaseUrl);
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

  void pb.collection(collection).getFullList<T>(filter ? { filter } : {}).then((items) => {
    if (!active) return;
    records.clear();
    items.forEach((item) => records.set(item.id, item));
    onData([...records.values()]);
  }).catch((error: unknown) => {
    if (active) onError(error instanceof Error ? error : new Error(String(error)));
  });

  let unsubscribe: (() => void) | undefined;
  void pb.collection(collection).subscribe<T>("*", (event: RecordSubscription<T>) => {
    if (!active) return;
    if (event.action === "delete") records.delete(event.record.id);
    else records.set(event.record.id, event.record);
    onData([...records.values()]);
  }, filter ? { filter } : {}).then((stop) => {
    unsubscribe = stop;
    if (!active) stop();
  }).catch((error: unknown) => {
    if (active) onError(error instanceof Error ? error : new Error(String(error)));
  });

  return () => {
    active = false;
    unsubscribe?.();
  };
}

export function subscribeSessions(onData: (sessions: ScreeningSession[]) => void, onError: (error: Error) => void): Unsubscribe {
  return subscribeCollection<ScreeningSession & { id: string }>("sessions", onData, onError);
}

export function subscribeResults(onData: (results: ScreeningResult[]) => void, onError: (error: Error) => void): Unsubscribe {
  return subscribeCollection<ScreeningResult & { id: string }>("results", onData, onError);
}

export function subscribeSessionResults(sessionId: string, onData: (results: ScreeningResult[]) => void, onError: (error: Error) => void): Unsubscribe {
  return subscribeCollection<ScreeningResult & { id: string }>("results", onData, onError, `sessionId = "${sessionId.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`);
}

export async function getSessionResult(sessionId: string): Promise<ScreeningResult | null> {
  try {
    return await pb.collection("results").getFirstListItem<ScreeningResult>(`sessionId = "${sessionId.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export async function uploadSession(
  session: Omit<ScreeningSession, "framesUploaded" | "status">,
  frames: string[],
  onProgress: (complete: number, total: number) => void,
) {
  const form = new FormData();
  form.append("sessionId", session.sessionId);
  form.append("childId", session.childId);
  form.append("timestamp", session.timestamp);
  form.append("gameModule", session.gameModule);
  form.append("interactionEvents", JSON.stringify(session.interactionEvents));
  form.append("status", "uploaded");

  const filenames: string[] = [];
  for (const [index, dataUrl] of frames.entries()) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("A sampled frame could not be prepared for upload.");
    const filename = `frame_${index + 1}.jpg`;
    form.append("framesUploaded", await response.blob(), filename);
    filenames.push(filename);
  }
  let existing: { id: string } | null = null;
  try {
    existing = await pb.collection("sessions").getFirstListItem<{ id: string }>(`sessionId = "${session.sessionId}"`);
  } catch (error) {
    if (!(error && typeof error === "object" && "status" in error && error.status === 404)) throw error;
  }
  const saved = existing
    ? await pb.collection("sessions").update(existing.id, form)
    : await pb.collection("sessions").create(form);
  onProgress(frames.length, frames.length);

  return {
    ...session,
    framesUploaded: filenames,
    status: "uploaded" as const,
    ...saved,
  };
}
