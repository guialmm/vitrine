"""Email delivery is always asynchronous: the API only enqueues a job and the
arq worker renders and sends it, so a slow SMTP server never blocks a request."""

import asyncio
import logging
from typing import Literal, Protocol

from arq.connections import ArqRedis
from redis.exceptions import RedisError

from app.core.config import settings

Template = Literal[
    "verify_email", "reset_password", "order_confirmation", "order_shipped", "order_refunded"
]


log = logging.getLogger(__name__)


class Mailer(Protocol):
    async def send(self, template: Template, to: str, context: dict) -> None: ...


class ArqMailer:
    def __init__(self, redis: ArqRedis):
        self.redis = redis

    async def send(self, template: Template, to: str, context: dict) -> None:
        if to.lower() == settings.demo_email.lower():
            return  # shared demo account: never mail it (see Settings.demo_email)
        await self.redis.enqueue_job("send_email", template, to, context)


class DirectMailer:
    """Sends from the API process, without the queue: used while Redis is down.
    No retries, but a password reset still arrives."""

    def __init__(self):
        self._tasks: set[asyncio.Task] = set()  # keep references until each send ends

    async def send(self, template: Template, to: str, context: dict) -> None:
        if to.lower() == settings.demo_email.lower():
            return
        task = asyncio.create_task(self._deliver(template, to, context))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _deliver(self, template: Template, to: str, context: dict) -> None:
        from app.emails.sender import deliver
        from app.worker import order_email_context

        try:
            if template.startswith("order_"):
                context = await order_email_context(context["order_id"])
            await deliver(to, template, context)
        except Exception:
            log.exception("direct email %s to %s failed", template, to)


class FallbackMailer:
    """Queue through Redis; if enqueuing fails, send directly."""

    def __init__(self, primary: Mailer, fallback: Mailer | None = None):
        self.primary = primary
        self.fallback = fallback or DirectMailer()

    async def send(self, template: Template, to: str, context: dict) -> None:
        try:
            await self.primary.send(template, to, context)
        except (RedisError, OSError) as e:
            log.warning("mailer: Redis unavailable, sending directly (%s)", e)
            await self.fallback.send(template, to, context)
