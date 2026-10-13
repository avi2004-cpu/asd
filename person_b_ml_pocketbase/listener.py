"""Poll PocketBase for uploaded sessions and create scores/conclusions."""

import time

import conclusions
import pb_client
from pipeline import InvalidFeatures, process_session

POLL_SECONDS = 3


if __name__ == "__main__":
    print(f"Polling PocketBase ({pb_client.PB_URL}) every {POLL_SECONDS}s... (Ctrl+C to stop)")
    skipped = set()
    while True:
        try:
            for session in pb_client.get_uploaded_sessions():
                session_id = session.get("sessionId")
                if session_id in skipped:
                    continue
                try:
                    process_session(session)
                except InvalidFeatures as error:
                    skipped.add(session_id)
                    print(f"Skipping session {session_id}: {error}")
                    continue
                except Exception as error:
                    print(f"Failed to score session {session_id}: {error}")
                    continue

                try:
                    conclusions.maybe_conclude(
                        pb_client,
                        session.get("child") or session.get("childId"),
                    )
                except Exception as error:
                    print(f"Conclusion check failed for session {session_id}: {error}")
        except Exception as error:
            print(f"Polling error: {error}")
        time.sleep(POLL_SECONDS)
