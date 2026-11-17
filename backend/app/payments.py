"""Mock payments plus a Razorpay-shaped adapter that never pretends to charge a card."""

from __future__ import annotations

import hashlib
import hmac

from app.errors import NotConfigured


class MockGateway:
    """Initiate, verify, and sign webhooks. A payment is paid only after verify succeeds."""

    def __init__(self, secret: str) -> None:
        if not secret:
            raise NotConfigured("Mock gateway secret is empty")
        self.secret = secret

    def initiate(self, *, idempotency_key: str) -> str:
        digest = hmac.new(
            self.secret.encode("utf-8"),
            idempotency_key.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:24]
        return f"order_{digest}"

    def sign_payment(self, order_id: str, payment_id: str) -> str:
        message = f"{order_id}|{payment_id}".encode("utf-8")
        return hmac.new(self.secret.encode("utf-8"), message, hashlib.sha256).hexdigest()

    def verify(self, order_id: str, payment_id: str, signature: str) -> bool:
        if not signature:
            return False
        expected = self.sign_payment(order_id, payment_id)
        return hmac.compare_digest(expected, signature)

    def sign_webhook(self, body: bytes) -> str:
        return hmac.new(self.secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

    def verify_webhook(self, body: bytes, signature: str) -> bool:
        if not signature:
            return False
        expected = self.sign_webhook(body)
        return hmac.compare_digest(expected, signature)


class RazorpayAdapter:
    """Shape matches a Razorpay order call. Missing keys raise NotConfigured.

    Even when keys are present this adapter does not call Razorpay and does not
    mark any invoice paid.
    """

    def __init__(self, key_id: str | None, key_secret: str | None) -> None:
        if not key_id or not key_secret:
            raise NotConfigured("Razorpay keys are not configured")
        self.key_id = key_id
        self.key_secret = key_secret

    def initiate(self, *, amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
        if amount_paise <= 0:
            raise ValueError("amount_paise must be positive")
        return {
            "provider": "razorpay",
            "key_id": self.key_id,
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": notes or {},
            "processed": False,
            "status": "not_sent",
        }
