"""
Polls PocketBase's "sessions" collection every few seconds and scores any
session with status == "uploaded" that hasn't been scored yet.

Polling instead of a realtime subscription keeps this dependency-free and
reliable — for a prototype's session volume (one demo session at a time),
a 3-second poll is indistinguishable from "instant" in practice.
"""

import time

import pb_client
from pipeline import process_session

POLL_SECONDS = 3

if __name__ == "__main__":
    print(f"Polling PocketBase ({pb_client.PB_URL}) every {POLL_SECONDS}s... (Ctrl+C to stop)")
    while True:
        try:
            for session in pb_client.get_uploaded_sessions():
                try:
                    process_session(session)
                except Exception as exc:  # noqa: BLE001 — keep polling alive
                    print(f"Failed to score session {session.get('sessionId')}: {exc}")
        except Exception as exc:  # noqa: BLE001 — e.g. PB server temporarily down
            print(f"Polling error: {exc}")
        time.sleep(POLL_SECONDS)
