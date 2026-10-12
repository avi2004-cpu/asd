"""
Thin REST wrapper around PocketBase's HTTP API — replaces firebase-admin now
that the app runs on a local PocketBase backend instead of Firebase. Uses
plain `requests` calls only, so there's nothing else to install or configure
beyond pointing this at the right URL.
"""

import json
import os
import time

import requests

# Point this at your PocketBase server. If testing from a phone (not just a
# browser on the same laptop), set this to your ngrok URL instead, e.g.
#   POCKETBASE_URL=https://a1b2c3.ngrok-free.app python listener.py
PB_URL = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
PB_WORKER_EMAIL = os.environ.get("POCKETBASE_WORKER_EMAIL", "")
PB_WORKER_PASSWORD = os.environ.get("POCKETBASE_WORKER_PASSWORD", "")
_auth_token = ""
_auth_expires_at = 0.0


def _get_auth_token(force_refresh: bool = False) -> str:
    """Authenticate the scoring worker as a restricted PocketBase user."""
    global _auth_token, _auth_expires_at

    if _auth_token and not force_refresh and time.monotonic() < _auth_expires_at:
        return _auth_token
    if not PB_WORKER_EMAIL or not PB_WORKER_PASSWORD:
        raise RuntimeError(
            "Set POCKETBASE_WORKER_EMAIL and POCKETBASE_WORKER_PASSWORD for the scoring worker."
        )

    response = requests.post(
        f"{PB_URL}/api/collections/users/auth-with-password",
        json={"identity": PB_WORKER_EMAIL, "password": PB_WORKER_PASSWORD},
        timeout=15,
    )
    response.raise_for_status()
    _auth_token = response.json()["token"]
    _auth_expires_at = time.monotonic() + 600
    return _auth_token


def _request(method: str, url: str, **kwargs):
    """Send an authenticated API call and refresh once if the token expired."""
    headers = dict(kwargs.pop("headers", {}))
    headers["Authorization"] = _get_auth_token()
    response = requests.request(method, url, headers=headers, **kwargs)
    if response.status_code == 401:
        for file_value in (kwargs.get("files") or {}).values():
            file_stream = file_value[1] if isinstance(file_value, tuple) else file_value
            if hasattr(file_stream, "seek"):
                file_stream.seek(0)
        headers["Authorization"] = _get_auth_token(force_refresh=True)
        response = requests.request(method, url, headers=headers, **kwargs)
    return response


def get_uploaded_sessions():
    """Returns all session records with status == 'uploaded'."""
    resp = _request(
        "GET",
        f"{PB_URL}/api/collections/sessions/records",
        params={"filter": "status='uploaded'", "perPage": 200},
        timeout=30,
    )
    resp.raise_for_status()
    sessions = resp.json()["items"]
    for session in sessions:
        session["framesUploaded"] = [
            f"{PB_URL}/api/files/sessions/{session['id']}/{filename}"
            for filename in session.get("framesUploaded", [])
        ]
    return sessions


def result_exists(session_id: str) -> bool:
    resp = _request(
        "GET",
        f"{PB_URL}/api/collections/results/records",
        params={"filter": f"sessionId='{session_id}'", "perPage": 1},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["totalItems"] > 0


def download_frame(url: str) -> bytes:
    """
    Downloads one uploaded frame. Works whether `url` is already a full
    PocketBase file URL, or a relative path — PB_URL is prefixed
    automatically if it doesn't already start with http.
    """
    if not url.startswith("http"):
        url = f"{PB_URL}{url}"
    resp = _request("GET", url, timeout=30)
    resp.raise_for_status()
    return resp.content


def create_result_record(fields: dict, heatmap_path: str | None = None):
    """
    Creates a "results" record via multipart/form-data. If heatmap_path is
    given, uploads it as a file field named "heatmapImage", then does a
    follow-up PATCH to set a plain gazeHeatmapUrl string field — so the
    dashboard can keep reading a simple URL string exactly like before,
    without needing to know PocketBase's file-field conventions.
    """
    data = {}
    for key, value in fields.items():
        # PocketBase expects JSON-typed fields as JSON-encoded strings when
        # submitted via multipart/form-data.
        data[key] = json.dumps(value) if isinstance(value, (dict, list)) else value

    files = None
    file_handle = None
    if heatmap_path:
        file_handle = open(heatmap_path, "rb")
        files = {"heatmapImage": file_handle}

    try:
        resp = _request(
            "POST",
            f"{PB_URL}/api/collections/results/records",
            data=data,
            files=files,
            timeout=60,
        )
        resp.raise_for_status()
        record = resp.json()
    finally:
        if file_handle:
            file_handle.close()

    if heatmap_path:
        filename = record.get("heatmapImage")
        if filename:
            heatmap_url = f"{PB_URL}/api/files/results/{record['id']}/{filename}"
            patch = _request(
                "PATCH",
                f"{PB_URL}/api/collections/results/records/{record['id']}",
                data={"gazeHeatmapUrl": heatmap_url},
                timeout=30,
            )
            patch.raise_for_status()
            record = patch.json()

    return record
