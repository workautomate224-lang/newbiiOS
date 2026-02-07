import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.security import RateLimitMiddleware, ALLOWED_ORIGINS
from app.routers import health, predictions, users, leaderboard, studio, exchange, drift

VERSION = "1.5.0"

app = FastAPI(
    title=settings.app_name,
    version=VERSION,
    description="FutureOS — Future Computation Engine API",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Security: Rate limiting
app.add_middleware(RateLimitMiddleware, max_requests=60, window=60)

# CORS: use tightened origins in production, permissive in dev
cors_origins = ALLOWED_ORIGINS if settings.environment == "production" else settings.cors_origins.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sentry error monitoring (optional)
sentry_dsn = os.environ.get("SENTRY_DSN", "")
if sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=sentry_dsn, traces_sample_rate=0.1)
    except ImportError:
        pass

app.include_router(health.router)
app.include_router(predictions.router)
app.include_router(users.router)
app.include_router(leaderboard.router)
app.include_router(studio.router)
app.include_router(exchange.router)
app.include_router(drift.router)


@app.get("/")
async def root():
    return {
        "name": "FutureOS API",
        "version": VERSION,
        "docs": "/docs",
    }
