from functools import lru_cache
from typing import Literal

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-secret-not-for-production-use"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"
    database_url: str = "postgresql+asyncpg://vitrine:vitrine@localhost:5432/vitrine"
    redis_url: str = "redis://localhost:6379"
    frontend_url: str = "http://localhost:5174"

    # Auth
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 14
    email_token_ttl_hours: int = 24
    refresh_cookie_name: str = "vitrine_refresh"

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    currency: str = "brl"
    # Stripe requires Checkout Sessions to live at least 30 minutes.
    reservation_minutes: int = 30

    # Email
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_tls: bool = False  # STARTTLS (e.g. Brevo on port 587)
    mail_from: str = "Vitrine <no-reply@vitrine.dev>"

    # Deployment
    # Free hosting tiers charge for a separate worker process; this runs the
    # arq worker inside the API process instead. Docker keeps them separate.
    run_worker_inline: bool = False
    # Shared login shown on the public demo. It never receives email, so no
    # visitor can trigger a password reset that locks the others out.
    demo_email: str = "demo@example.com"

    @field_validator("database_url")
    @classmethod
    def _asyncpg_url(cls, url: str) -> str:
        """Accept the plain URLs hosts hand out (Neon, Render, Heroku):
        postgres://…?sslmode=require&channel_binding=require → asyncpg form."""
        parts = urlsplit(url)
        scheme = "postgresql+asyncpg" if parts.scheme in ("postgres", "postgresql") else parts.scheme
        query = dict(parse_qsl(parts.query))
        if (mode := query.pop("sslmode", None)) and mode != "disable":
            query["ssl"] = "require"
        query.pop("channel_binding", None)  # libpq-only option
        return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    @model_validator(mode="after")
    def _require_real_secret_in_prod(self) -> "Settings":
        if self.env == "prod" and (self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < 32):
            raise ValueError("JWT_SECRET must be set to 32+ random characters in production")
        return self

    @property
    def secure_cookies(self) -> bool:
        return self.env == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
