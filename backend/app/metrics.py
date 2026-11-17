"""Prometheus text exposition. Uses prometheus_client when it imports; otherwise a small counter."""

from __future__ import annotations

import re
import threading

_ID_SEGMENT = re.compile(r"/\d+")

try:
    from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

    _PROM = True
    _REQUESTS = Counter(
        "edunexus_http_requests_total",
        "Total HTTP requests",
        ["method", "path"],
    )
except Exception:  # pragma: no cover - library is optional
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"
    generate_latest = None
    _PROM = False
    _REQUESTS = None


def template_path(path: str) -> str:
    return _ID_SEGMENT.sub("/:id", path)


class HandmadeMetrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: dict[tuple[str, str], int] = {}

    def inc(self, method: str, path: str) -> None:
        key = (method, template_path(path))
        if _PROM and _REQUESTS is not None:
            _REQUESTS.labels(method=key[0], path=key[1]).inc()
            return
        with self._lock:
            self._counts[key] = self._counts.get(key, 0) + 1

    def render(self) -> tuple[str, str]:
        if _PROM and generate_latest is not None:
            payload = generate_latest().decode("utf-8")
            return payload, CONTENT_TYPE_LATEST
        lines = [
            "# HELP edunexus_http_requests_total Total HTTP requests",
            "# TYPE edunexus_http_requests_total counter",
        ]
        with self._lock:
            items = sorted(self._counts.items())
        if not items:
            lines.append("edunexus_http_requests_total 0")
        for (method, path), count in items:
            safe_path = path.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(
                f'edunexus_http_requests_total{{method="{method}",path="{safe_path}"}} {count}'
            )
        return "\n".join(lines) + "\n", "text/plain; version=0.0.4; charset=utf-8"
