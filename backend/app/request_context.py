"""Request-scoped correlation id."""

from __future__ import annotations

import contextvars

correlation_id: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="")
