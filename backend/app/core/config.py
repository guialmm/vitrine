from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-secret-not-for-production-use"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"
    database_url: str = "postgresql+asyncpg://vitrine:vitrine@localhost:5432/vitrine"
    redis_url: str = "redis://localhost:6379"
    frontend_url: str = "http://localhost:5173"

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
    smtp_tls: bool = False
    mail_from: str = "Vitrine <no-reply@vitrine.dev>"

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
