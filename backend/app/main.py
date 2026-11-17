"""EduNexus FastAPI application."""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.db import Base, SessionLocal, init_db
from app.deps import rate_limiter
from app.documents import build_document_store
from app.errors import AppError
from app.logging_setup import configure_logging
from app.metrics import HandmadeMetrics
from app.request_context import correlation_id
from app.routers.routes import router as api_routes

logger = logging.getLogger("edunexus.access")


class AccessMiddleware:
    def __init__(self, app, metrics: HandmadeMetrics) -> None:
        self.app = app
        self.metrics = metrics

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        raw = scope.get("headers") or []
        headers = {key.decode("latin1").lower(): value.decode("latin1") for key, value in raw}
        cid = headers.get("x-correlation-id") or str(uuid.uuid4())
        token = correlation_id.set(cid)
        started = time.perf_counter()
        status = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
                response_headers = list(message.get("headers") or [])
                response_headers.append((b"x-correlation-id", cid.encode("ascii")))
                message["headers"] = response_headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope.get("path", "")
            self.metrics.inc(scope.get("method", "GET"), path)
            logger.info(
                "request",
                extra={
                    "http_method": scope.get("method"),
                    "path": path,
                    "status_code": status["code"],
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            correlation_id.reset(token)


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    metrics = HandmadeMetrics()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(settings.database_url)
        from app.db import engine
        from app.seed import seed_if_empty

        Base.metadata.create_all(engine)
        app.state.documents = build_document_store(settings.mongo_url, settings.mongo_db)
        if settings.seed_on_startup and SessionLocal is not None:
            db = SessionLocal()
            try:
                seed_if_empty(db)
                db.commit()
            finally:
                db.close()
        yield

    app = FastAPI(title="EduNexus API", version="1.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.metrics = metrics
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.add_middleware(AccessMiddleware, metrics=metrics)

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.detail, "code": exc.code})

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_request: Request, _exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"detail": "Request validation failed", "code": "validation_error"},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(_request: Request, exc: StarletteHTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict"}.get(
            exc.status_code, "error"
        )
        return JSONResponse(status_code=exc.status_code, content={"detail": detail, "code": code})

    api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(rate_limiter)])
    api_router.include_router(api_routes)
    app.include_router(api_router)

    @app.get("/metrics")
    def metrics_endpoint():
        body, content_type = metrics.render()
        return Response(content=body, media_type=content_type)

    @app.get("/")
    def root():
        return {"service": "edunexus", "api": "/api/v1", "health": "/api/v1/health"}

    return app


app = create_app()
