import pytest

from app.core.config import DEV_JWT_SECRET, Settings
from app.emails.mailer import ArqMailer


@pytest.mark.parametrize(
    "given,expected",
    [
        (
            "postgresql://u:p@ep-x.neon.tech/db?sslmode=require&channel_binding=require",
            "postgresql+asyncpg://u:p@ep-x.neon.tech/db?ssl=require",
        ),
        ("postgres://u:p@host:5432/db", "postgresql+asyncpg://u:p@host:5432/db"),
        ("postgresql+asyncpg://u:p@localhost/db", "postgresql+asyncpg://u:p@localhost/db"),
    ],
)
def test_hosted_database_urls_are_normalized_for_asyncpg(given, expected):
    assert Settings(database_url=given).database_url == expected


def test_production_refuses_the_dev_jwt_secret():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(_env_file=None, env="prod", jwt_secret=DEV_JWT_SECRET)
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(_env_file=None, env="prod", jwt_secret="short")


class FakeRedis:
    def __init__(self):
        self.jobs = []

    async def enqueue_job(self, *args):
        self.jobs.append(args)


async def test_shared_demo_account_never_receives_email():
    redis = FakeRedis()
    mailer = ArqMailer(redis)
    await mailer.send("reset_password", "Demo@Example.com", {})
    await mailer.send("reset_password", "ana@example.org", {})
    assert [job[2] for job in redis.jobs] == ["ana@example.org"]
