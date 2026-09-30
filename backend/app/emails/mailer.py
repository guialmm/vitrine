"""Email delivery is always asynchronous: the API only enqueues a job and the
arq worker renders and sends it, so a slow SMTP server never blocks a request."""

from typing import Literal, Protocol

from arq.connections import ArqRedis

from app.core.config import settings

Template = Literal["verify_email", "reset_password", "order_confirmation"]


class Mailer(Protocol):
    async def send(self, template: Template, to: str, context: dict) -> None: ...


class ArqMailer:
    def __init__(self, redis: ArqRedis):
        self.redis = redis

    async def send(self, template: Template, to: str, context: dict) -> None:
        if to.lower() == settings.demo_email.lower():
            return  # shared demo account: never mail it (see Settings.demo_email)
        await self.redis.enqueue_job("send_email", template, to, context)
