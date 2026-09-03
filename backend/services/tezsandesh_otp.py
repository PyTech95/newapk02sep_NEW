"""TezSandesh WhatsApp OTP provider (server-to-server).

TezSandesh itself generates, delivers and verifies the OTP. This module is a
thin, safe async wrapper around its REST API. It never logs the API key,
Authorization header or the OTP value.

Endpoints (per TezSandesh OTP API docs):
    POST /api/v1/otp/send      {to, purpose, reference_id}  (header Idempotency-Key)
    POST /api/v1/otp/verify    {request_id, to, otp}
    POST /api/v1/otp/resend    {request_id}
    GET  /api/v1/otp/status/{request_id}

Auth: Authorization: Bearer <TEZSANDESH_OTP_API_KEY>
"""
import logging
import os

import httpx

log = logging.getLogger("neksathi.otp")


class ProviderUnavailable(Exception):
    """Transient upstream failure (timeout / 5xx / malformed response)."""


class ProviderRejected(Exception):
    """Upstream rejected the request (4xx). `code` is a machine-readable hint."""

    def __init__(self, status_code: int = 0, code: str = "", message: str = ""):
        super().__init__(message or code or f"rejected ({status_code})")
        self.status_code = status_code
        self.code = code or ""
        self.message = message or ""


def _base_url() -> str:
    return os.environ.get("TEZSANDESH_BASE_URL", "https://tezsandesh.com").rstrip("/")


def _api_key() -> str:
    return os.environ.get("TEZSANDESH_OTP_API_KEY", "").strip()


def _timeout() -> float:
    try:
        return float(os.environ.get("TEZSANDESH_TIMEOUT_SECONDS", "10"))
    except ValueError:
        return 10.0


class TezSandeshOTP:
    """Async client. One instance is shared for the process lifetime."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    @property
    def configured(self) -> bool:
        return bool(_api_key())

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            t = _timeout()
            self._client = httpx.AsyncClient(
                base_url=_base_url(),
                timeout=httpx.Timeout(t, connect=min(5.0, t)),
                headers={"Accept": "application/json"},
                limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
            )
        return self._client

    def _headers(self, idempotency_key: str | None = None) -> dict:
        h = {
            "Authorization": f"Bearer {_api_key()}",
            "Content-Type": "application/json",
        }
        if idempotency_key:
            h["Idempotency-Key"] = idempotency_key
        return h

    async def close(self):
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ---- low level ----
    async def _post(self, path: str, body: dict, idempotency_key: str | None = None) -> httpx.Response:
        if not self.configured:
            raise ProviderRejected(0, "NOT_CONFIGURED", "OTP service is not configured")
        try:
            return await self._get_client().post(path, json=body, headers=self._headers(idempotency_key))
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            log.warning("tezsandesh transport error path=%s err=%s", path, type(exc).__name__)
            raise ProviderUnavailable() from exc

    @staticmethod
    def _json(resp: httpx.Response) -> dict:
        try:
            data = resp.json()
            return data if isinstance(data, dict) else {"value": data}
        except ValueError:
            return {}

    @classmethod
    def _error(cls, resp: httpx.Response) -> ProviderRejected:
        data = cls._json(resp)
        detail = data.get("detail", data)
        code, message = "", ""
        if isinstance(detail, dict):
            code = str(detail.get("code", "") or "")
            message = str(detail.get("message", "") or "")
        elif isinstance(detail, str):
            message = detail
        log.warning("tezsandesh rejected status=%s code=%s", resp.status_code, code or "-")
        return ProviderRejected(resp.status_code, code, message)

    # ---- public ----
    async def send(self, to: str, purpose: str, reference_id: str | None, idempotency_key: str) -> str:
        """Send an OTP. Returns the provider `request_id`."""
        body = {"to": to, "purpose": purpose}
        if reference_id:
            body["reference_id"] = reference_id
        resp = await self._post("/api/v1/otp/send", body, idempotency_key)
        if resp.status_code >= 500:
            raise ProviderUnavailable()
        if resp.status_code >= 400:
            raise self._error(resp)
        data = self._json(resp)
        request_id = data.get("request_id") or data.get("requestId") or data.get("id")
        if not request_id:
            log.warning("tezsandesh send: no request_id in response")
            raise ProviderUnavailable()
        return str(request_id)

    async def resend(self, request_id: str) -> None:
        resp = await self._post("/api/v1/otp/resend", {"request_id": request_id})
        if resp.status_code >= 500:
            raise ProviderUnavailable()
        if resp.status_code >= 400:
            raise self._error(resp)

    async def verify(self, request_id: str, to: str, otp: str) -> dict:
        """Verify an OTP. Returns {"verified": bool, "reason": str}.

        A definitive negative from the provider (wrong/expired/used code) is
        returned as verified=False rather than raised, so the caller can show a
        clean "Invalid verification code" message.
        """
        resp = await self._post("/api/v1/otp/verify", {"request_id": request_id, "to": to, "otp": otp})
        if resp.status_code >= 500:
            raise ProviderUnavailable()
        if resp.status_code in (400, 401, 404, 410, 422, 429):
            data = self._json(resp)
            detail = data.get("detail", data)
            code = ""
            if isinstance(detail, dict):
                code = str(detail.get("code", "") or "").lower()
            reason = "expired" if "expire" in code else ("too_many" if resp.status_code == 429 else "invalid")
            return {"verified": False, "reason": reason}
        if resp.status_code >= 400:
            raise self._error(resp)
        data = self._json(resp)
        for k in ("verified", "valid", "success"):
            if k in data:
                return {"verified": bool(data[k]), "reason": "" if data[k] else "invalid"}
        status = str(data.get("status", "")).lower()
        if status in ("verified", "success", "approved", "ok", "completed"):
            return {"verified": True, "reason": ""}
        if status in ("failed", "invalid", "rejected", "expired"):
            return {"verified": False, "reason": "expired" if status == "expired" else "invalid"}
        # 2xx with no explicit flag => treat as success.
        return {"verified": True, "reason": ""}

    async def status(self, request_id: str) -> dict:
        if not self.configured:
            raise ProviderRejected(0, "NOT_CONFIGURED", "OTP service is not configured")
        try:
            resp = await self._get_client().get(
                f"/api/v1/otp/status/{request_id}", headers=self._headers()
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            raise ProviderUnavailable() from exc
        if resp.status_code >= 500:
            raise ProviderUnavailable()
        if resp.status_code >= 400:
            raise self._error(resp)
        return self._json(resp)


# Process-wide singleton.
provider = TezSandeshOTP()
