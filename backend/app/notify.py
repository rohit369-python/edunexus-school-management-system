"""Log-only email and SMS. Nothing is delivered to a provider."""

from __future__ import annotations

import logging

logger = logging.getLogger("edunexus.notify")


class LogEmailAdapter:
    def send(self, *, to: str, subject: str, body: str) -> dict:
        logger.info("email_logged", extra={"to": to, "subject": subject, "body_len": len(body)})
        return {"status": "logged", "channel": "email"}


class LogSmsAdapter:
    def send(self, *, to: str, body: str) -> dict:
        logger.info("sms_logged", extra={"to": to, "body_len": len(body)})
        return {"status": "logged", "channel": "sms"}
