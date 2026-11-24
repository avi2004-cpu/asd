// Step 2.1 -- PocketBase JS SDK singleton.
import PocketBase, { ClientResponseError } from "pocketbase";
import type { Role, User } from "../types/schema";

// Constraint 8: http://127.0.0.1:8090 (USB phone bridged with `adb reverse tcp:8090 tcp:8090`).
export const PB_URL: string = import.meta.env.VITE_PB_URL || "http://127.0.0.1:8090";

export const pb = new PocketBase(PB_URL);

// Pages may fire the same request twice (React StrictMode); don't let the SDK cancel duplicates.
pb.autoCancellation(false);

/**
 * Constraint 7 / TC05: forced login on every app launch.
 * Called exactly once from main.tsx before the first render, so a fresh launch
 * (web reload or reopening the Android APK) always lands on /login.
 */
export function clearAuthOnLaunch(): void {
  pb.authStore.clear();
}

export function currentUser(): User | null {
  if (!pb.authStore.isValid || !pb.authStore.record) return null;
  return pb.authStore.record as unknown as User;
}

export function homeFor(role: Role | null | undefined): string {
  return role === "doctor" ? "/doctor" : "/parent";
}

/** Human-readable message from a PocketBase error (including per-field validation errors). */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ClientResponseError) {
    if (err.status === 0) return `Cannot reach the server at ${PB_URL}. Is PocketBase running?`;
    const fields = err.response?.data as Record<string, { message?: string }> | undefined;
    const fieldMsgs = fields
      ? Object.entries(fields)
          .map(([k, v]) => (v?.message ? `${k}: ${v.message}` : ""))
          .filter(Boolean)
      : [];
    if (fieldMsgs.length) return fieldMsgs.join(" · ");
    if (err.response?.message) return String(err.response.message);
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
