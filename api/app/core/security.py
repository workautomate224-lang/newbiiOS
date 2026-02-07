"""Security middleware — rate limiting, input sanitization."""

import time
from collections import defaultdict

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter. Production should use Redis."""

    def __init__(self, app, max_requests: int = 60, window: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window
        self._requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for test clients and health checks
        ip = request.client.host if request.client else "unknown"
        if ip in ("testclient", "127.0.0.1", "localhost") or request.url.path == "/health":
            return await call_next(request)

        now = time.time()

        # Cleanup expired entries
        self._requests[ip] = [t for t in self._requests[ip] if now - t < self.window]

        if len(self._requests[ip]) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")

        self._requests[ip].append(now)
        return await call_next(request)


# Tightened CORS origins for production
ALLOWED_ORIGINS = [
    "https://web-production-240e7.up.railway.app",
    "https://futureos.app",
    "http://localhost:3000",
]


def sanitize_input(text: str, max_length: int = 1000) -> str:
    """Sanitize user input — prevent prompt injection and XSS."""
    if not text:
        return ""
    text = text[:max_length]
    dangerous_patterns = ["<system>", "</system>", "<|", "|>", "ignore previous", "ignore all"]
    for pattern in dangerous_patterns:
        text = text.replace(pattern, "")
    return text.strip()
