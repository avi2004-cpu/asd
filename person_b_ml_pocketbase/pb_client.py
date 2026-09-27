"""
Thin REST wrapper around PocketBase's HTTP API — replaces firebase-admin now
that the app runs on a local PocketBase backend instead of Firebase. Uses
plain `requests` calls only, so there's nothing else to install or configure
beyond pointing this at the right URL.
"""

import json
import os

import requests

# Point this at your PocketBase server. If testing from a phone (not just a
# browser on the same laptop), set this to your ngrok URL instead, e.g.
#   POCKETBASE_URL=https://a1b2c3.ngrok-free.app python listener.py
PB_URL = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")


def get_uploaded_sessions():
    """Returns all session records with status == 'uploaded'."""
    resp = requests.get(
        f"{PB_URL}/api/collections/sessions/records",
        params={"filter": "status='uploaded'", "perPage": 200},
    )
    resp.raise_for_status()
    return resp.json()["items"]


def result_exists(session_id: str) -> bool:
    resp = requests.get(
        f"{PB_URL}/api/collections/results/records",
        params={"filter": f"sessionId='{session_id}'", "perPage": 1},
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
    resp = requests.get(url)
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
        resp = requests.post(
            f"{PB_URL}/api/collections/results/records", data=data, files=files
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
            patch = requests.patch(
                f"{PB_URL}/api/collections/results/records/{record['id']}",
                data={"gazeHeatmapUrl": heatmap_url},
            )
            patch.raise_for_status()
            record = patch.json()

    return record
