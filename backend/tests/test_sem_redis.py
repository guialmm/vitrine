"""Redis is a helper: when it is unreachable the API keeps working."""

from fastapi import FastAPI
from redis.asyncio import Redis

from app.core import ratelimit as rl
from app.core.config import settings
from app.emails import mailer as m
from app.main import lifespan

INALCANCAVEL = "redis://127.0.0.1:1"  # nothing listens on port 1


async def test_api_starts_without_redis(monkeypatch):
    monkeypatch.setattr(settings, "redis_url", INALCANCAVEL)
    app = FastAPI()
    async with lifespan(app):
        assert isinstance(app.state.limiter, rl.MemoryLimiter)
        assert isinstance(app.state.mailer, m.DirectMailer)


async def test_limiter_counts_in_memory_when_redis_fails():
    redis = Redis.from_url(INALCANCAVEL)
    limiter = rl.FallbackLimiter(rl.RedisLimiter(redis))
    limit = rl.Limit("test-fallback", 1, 60)
    try:
        assert await limiter.hit(limit, "k") == 0
        assert await limiter.hit(limit, "k") > 0  # still limited, just per process
    finally:
        await redis.aclose()


class Quebrado:
    async def send(self, template, to, context):
        raise ConnectionError("redis down")


class Guardado:
    def __init__(self):
        self.sent = []

    async def send(self, template, to, context):
        self.sent.append((template, to))


async def test_mailer_sends_directly_when_queue_fails():
    direto = Guardado()
    mailer = m.FallbackMailer(Quebrado(), direto)
    await mailer.send("reset_password", "ana@example.com", {"name": "Ana", "url": "x"})
    assert direto.sent == [("reset_password", "ana@example.com")]
