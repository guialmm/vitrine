"""Fixed-window rate limiting for the auth endpoints.

Counters live in Redis so they survive restarts and are shared by every API
process. A window starts on the first hit and the key expires with it.
"""

import time
from dataclasses import dataclass
from typing import Protocol

from fastapi import HTTPException, status
from redis.asyncio import Redis


@dataclass(frozen=True)
class Limit:
    name: str
    max_hits: int
    window_seconds: int


# Login counts only *failed* attempts per account, but every attempt per IP.
LOGIN_FAILURES_PER_EMAIL = Limit("login-email", 5, 15 * 60)
LOGIN_ATTEMPTS_PER_IP = Limit("login-ip", 20, 15 * 60)
RESET_PER_EMAIL = Limit("reset-email", 3, 60 * 60)
RESET_PER_IP = Limit("reset-ip", 10, 60 * 60)
REGISTER_PER_IP = Limit("register-ip", 10, 60 * 60)
RESEND_PER_USER = Limit("resend-user", 3, 60 * 60)


class Limiter(Protocol):
    async def hit(self, limit: Limit, key: str) -> int:
        """Records one hit; returns 0 if allowed, else seconds until the window resets."""
        ...

    async def blocked_for(self, limit: Limit, key: str) -> int:
        """Like hit() but read-only: is the key already over the limit?"""
        ...

    async def reset(self, limit: Limit, key: str) -> None: ...


def _key(limit: Limit, key: str) -> str:
    return f"ratelimit:{limit.name}:{key.lower()}"


class RedisLimiter:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def hit(self, limit: Limit, key: str) -> int:
        k = _key(limit, key)
        async with self.redis.pipeline(transaction=True) as pipe:
            pipe.incr(k)
            pipe.expire(k, limit.window_seconds, nx=True)  # only the first hit opens the window
            pipe.ttl(k)
            count, _, ttl = await pipe.execute()
        return max(ttl, 1) if count > limit.max_hits else 0

    async def blocked_for(self, limit: Limit, key: str) -> int:
        k = _key(limit, key)
        async with self.redis.pipeline(transaction=False) as pipe:
            pipe.get(k)
            pipe.ttl(k)
            count, ttl = await pipe.execute()
        return max(ttl, 1) if count is not None and int(count) >= limit.max_hits else 0

    async def reset(self, limit: Limit, key: str) -> None:
        await self.redis.delete(_key(limit, key))


class MemoryLimiter:
    """Same behaviour without Redis; used by the test suite."""

    def __init__(self):
        self.buckets: dict[str, tuple[int, float]] = {}  # key -> (count, window end)

    def _get(self, k: str) -> tuple[int, float]:
        count, ends = self.buckets.get(k, (0, 0.0))
        return (0, 0.0) if ends <= time.monotonic() else (count, ends)

    async def hit(self, limit: Limit, key: str) -> int:
        k = _key(limit, key)
        count, ends = self._get(k)
        ends = ends or time.monotonic() + limit.window_seconds
        self.buckets[k] = (count + 1, ends)
        return max(int(ends - time.monotonic()), 1) if count + 1 > limit.max_hits else 0

    async def blocked_for(self, limit: Limit, key: str) -> int:
        count, ends = self._get(_key(limit, key))
        return max(int(ends - time.monotonic()), 1) if count >= limit.max_hits else 0

    async def reset(self, limit: Limit, key: str) -> None:
        self.buckets.pop(_key(limit, key), None)


def too_many(retry_after: int) -> HTTPException:
    minutes = max(1, round(retry_after / 60))
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"Too many attempts, try again in {minutes} min",
        headers={"Retry-After": str(retry_after)},
    )
