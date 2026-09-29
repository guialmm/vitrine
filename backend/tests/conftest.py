import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://vitrine:vitrine@localhost:5432/vitrine_test"
)
os.environ["ENV"] = "test"

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402


class FakeMailer:
    def __init__(self):
        self.sent: list[tuple[str, str, dict]] = []

    async def send(self, template, to, context):
        self.sent.append((template, to, context))

    def last(self, template: str) -> dict:
        return next(ctx for t, _, ctx in reversed(self.sent) if t == template)

    def token_from(self, template: str) -> str:
        return self.last(template)["url"].split("token=")[1]


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
async def client(mailer):
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
