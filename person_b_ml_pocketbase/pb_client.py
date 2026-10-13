"""Authenticated REST client for the PocketBase scoring worker."""

import json
import os
import time

import requests

PB_URL = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090").rstrip("/")
PB_WORKER_EMAIL = os.environ.get("POCKETBASE_WORKER_EMAIL", "")
PB_WORKER_PASSWORD = os.environ.get("POCKETBASE_WORKER_PASSWORD", "")
_auth_token = ""
_auth_expires_at = 0.0


def _get_auth_token(force_refresh: bool = False) -> str:
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


def _filter_value(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace("'", "\\'")


def get_uploaded_sessions() -> list[dict]:
    items = []
    page = 1
    while True:
        response = _request(
            "GET",
            f"{PB_URL}/api/collections/sessions/records",
            params={"filter": "status='uploaded'", "perPage": 200, "page": page},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        items.extend(payload["items"])
        if page >= payload["totalPages"]:
            return items
        page += 1


def result_exists(session_id: str) -> bool:
    response = _request(
        "GET",
        f"{PB_URL}/api/collections/results/records",
        params={"filter": f"sessionId='{_filter_value(session_id)}'", "perPage": 1},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["totalItems"] > 0


def create_result_record(fields: dict, heatmap_path: str | None = None) -> dict:
    data = {
        key: json.dumps(value) if isinstance(value, (dict, list)) else value
        for key, value in fields.items()
    }
    file_handle = open(heatmap_path, "rb") if heatmap_path else None
    try:
        response = _request(
            "POST",
            f"{PB_URL}/api/collections/results/records",
            data=data,
            files={"heatmapImage": file_handle} if file_handle else None,
            timeout=60,
        )
        response.raise_for_status()
        record = response.json()
    finally:
        if file_handle:
            file_handle.close()

    filename = record.get("heatmapImage")
    if filename:
        heatmap_url = f"{PB_URL}/api/files/results/{record['id']}/{filename}"
        response = _request(
            "PATCH",
            f"{PB_URL}/api/collections/results/records/{record['id']}",
            data={"gazeHeatmapUrl": heatmap_url},
            timeout=30,
        )
        response.raise_for_status()
        record = response.json()
    return record


def get_child(child_id: str) -> dict | None:
    response = _request(
        "GET",
        f"{PB_URL}/api/collections/children/records/{child_id}",
        timeout=30,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def list_child_results(child_id: str) -> list[dict]:
    results = []
    page = 1
    while True:
        response = _request(
            "GET",
            f"{PB_URL}/api/collections/results/records",
            params={
                "filter": f"session.child='{_filter_value(child_id)}'",
                "sort": "scoredAt",
                "perPage": 200,
                "page": page,
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        results.extend(payload["items"])
        if page >= payload["totalPages"]:
            return results
        page += 1


def conclusion_exists(child_id: str) -> bool:
    response = _request(
        "GET",
        f"{PB_URL}/api/collections/conclusions/records",
        params={"filter": f"child='{_filter_value(child_id)}'", "perPage": 1},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["totalItems"] > 0


def create_conclusion(fields: dict) -> dict:
    response = _request(
        "POST",
        f"{PB_URL}/api/collections/conclusions/records",
        json=fields,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()
