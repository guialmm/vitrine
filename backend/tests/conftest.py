import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://vitrine:vitrine@localhost:5432/vitrine_test"
)
os.environ["ENV"] = "test"
os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_test_secret"

import hashlib  # noqa: E402
import hmac  # noqa: E402
import json  # noqa: E402
import time  # noqa: E402
import uuid  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402
from app.core.ratelimit import MemoryLimiter  # noqa: E402
from app.payments.gateway import CheckoutSession  # noqa: E402


class FakeMailer:
    def __init__(self):
        self.sent: list[tuple[str, str, dict]] = []

    async def send(self, template, to, context):
        self.sent.append((template, to, context))

    def last(self, template: str) -> dict:
        return next(ctx for t, _, ctx in reversed(self.sent) if t == template)

    def token_from(self, template: str) -> str:
        return self.last(template)["url"].split("token=")[1]


class FakeGateway:
    def __init__(self):
        self.created: list = []
        self.expired: list[str] = []
        self.fail = False
        self.completed: set[str] = set()  # sessions the "customer" already paid

    async def create_checkout(self, order, user):
        if self.fail:
            raise RuntimeError("stripe is down")
        self.created.append(order)
        sid = f"cs_test_{len(self.created)}"
        return CheckoutSession(id=sid, url=f"https://checkout.stripe.test/{sid}")

    async def expire_checkout(self, session_id):
        self.expired.append(session_id)
        return session_id not in self.completed


@pytest.fixture(scope="session", autouse=True)
async def schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_db():
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def mailer() -> FakeMailer:
    fake = FakeMailer()
    app.state.mailer = fake
    return fake


@pytest.fixture
def gateway() -> FakeGateway:
    fake = FakeGateway()
    app.state.gateway = fake
    return fake


@pytest.fixture
def limiter() -> MemoryLimiter:
    fake = MemoryLimiter()
    app.state.limiter = fake
    return fake


@pytest.fixture
async def client(mailer, gateway, limiter):
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as c:
        yield c


async def create_user(
    client: AsyncClient,
    email: str = "ana@example.com",
    password: str = "s3nha-forte",
    role: Role = Role.customer,
    verified: bool = True,
) -> dict:
    """Registers through the API, then adjusts role/verification directly in the DB.
    Returns the login response (access token + user)."""
    r = await client.post(
        "/api/auth/register", json={"email": email, "password": password, "full_name": "Ana"}
    )
    assert r.status_code == 201, r.text
    async with SessionLocal() as s:
        user = await s.get(User, r.json()["id"])
        user.role, user.is_verified = role, verified
        await s.commit()
    r = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def bearer(login: dict) -> dict:
    return {"Authorization": f"Bearer {login['access_token']}"}


def stripe_event(event_type: str, obj: dict, event_id: str | None = None) -> tuple[bytes, dict]:
    """Builds a webhook body signed exactly like Stripe does (t=..,v1=HMAC-SHA256)."""
    payload = json.dumps(
        {"id": event_id or f"evt_{uuid.uuid4().hex}", "type": event_type, "data": {"object": obj}}
    ).encode()
    ts = int(time.time())
    sig = hmac.new(
        os.environ["STRIPE_WEBHOOK_SECRET"].encode(), f"{ts}.".encode() + payload, hashlib.sha256
    ).hexdigest()
    return payload, {"Stripe-Signature": f"t={ts},v1={sig}", "Content-Type": "application/json"}
