import os

import pytest
from redis.asyncio import Redis

from app.core import ratelimit as rl
from tests.conftest import create_user

LOGIN = "/api/auth/login"


async def wrong_login(client, email="ana@example.com"):
    return await client.post(LOGIN, json={"email": email, "password": "senha-errada"})


async def test_account_locks_after_five_failed_logins(client):
    await create_user(client)
    for _ in range(5):
        assert (await wrong_login(client)).status_code == 401

    r = await wrong_login(client)
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0
    # Even the right password is refused while locked: guessing can't continue.
    ok = await client.post(LOGIN, json={"email": "ana@example.com", "password": "s3nha-forte"})
    assert ok.status_code == 429


async def test_successful_login_resets_the_failure_counter(client):
    await create_user(client)
    for _ in range(4):
        await wrong_login(client)
    ok = await client.post(LOGIN, json={"email": "ana@example.com", "password": "s3nha-forte"})
    assert ok.status_code == 200
    for _ in range(4):
        assert (await wrong_login(client)).status_code == 401


async def test_lock_is_per_account_and_case_insensitive(client):
    await create_user(client, "ana@example.com")
    await create_user(client, "bia@example.com")
    for _ in range(5):
        await wrong_login(client, "ANA@example.com")
    assert (await wrong_login(client, "ana@example.com")).status_code == 429
    ok = await client.post(LOGIN, json={"email": "bia@example.com", "password": "s3nha-forte"})
    assert ok.status_code == 200


async def test_one_ip_cannot_spray_many_accounts(client):
    for i in range(rl.LOGIN_ATTEMPTS_PER_IP.max_hits):
        assert (await wrong_login(client, f"user{i}@example.com")).status_code == 401
    assert (await wrong_login(client, "other@example.com")).status_code == 429


async def test_password_reset_requests_are_capped_per_email(client, mailer):
    await create_user(client)
    mailer.sent.clear()
    for _ in range(3):
        r = await client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
        assert r.status_code == 202
    r = await client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    assert r.status_code == 429
    assert len(mailer.sent) == 3  # nobody can flood someone's inbox


async def test_reset_limit_does_not_reveal_unknown_accounts(client):
    # Same 202 → 429 sequence for an address that has no account.
    codes = [
        (await client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})).status_code
        for _ in range(4)
    ]
    assert codes == [202, 202, 202, 429]


@pytest.mark.skipif(not os.environ.get("REDIS_TEST_URL"), reason="needs a real Redis")
async def test_redis_limiter_counts_and_expires_like_memory_limiter():
    redis = Redis.from_url(os.environ["REDIS_TEST_URL"])
    limiter = rl.RedisLimiter(redis)
    limit = rl.Limit("test-suite", 2, 30)
    await limiter.reset(limit, "k")
    try:
        assert await limiter.hit(limit, "k") == 0
        assert await limiter.blocked_for(limit, "k") == 0
        assert await limiter.hit(limit, "k") == 0
        assert 0 < await limiter.blocked_for(limit, "k") <= 30
        assert 0 < await limiter.hit(limit, "k") <= 30
        assert 0 < await redis.ttl("ratelimit:test-suite:k") <= 30  # window not extended by hits
        await limiter.reset(limit, "k")
        assert await limiter.hit(limit, "k") == 0
    finally:
        await limiter.reset(limit, "k")
        await redis.aclose()
