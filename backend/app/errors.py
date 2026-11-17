"""Consistent API errors: JSON `{detail, code}`."""

from __future__ import annotations


class AppError(Exception):
    def __init__(self, status: int, detail: str, code: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.code = code


class NotConfigured(AppError):
    def __init__(self, detail: str = "Integration is not configured"):
        super().__init__(503, detail, "not_configured")
