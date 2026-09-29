"""Background worker: `arq app.worker.WorkerSettings`"""

import logging
import uuid
from datetime import timedelta

import aiosmtplib
from arq import Retry, cron
from arq.connections import RedisSettings
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.db import SessionLocal
from app.emails.mailer import Template
from app.emails.sender import deliver
from app.models import Order
from app.orders.service import expire_stale_orders
from app.payments.gateway import StripeGateway

log = logging.getLogger(__name__)

MAX_TRIES = 5


async def order_email_context(order_id: str) -> dict:
    # Loaded at send time so the email reflects the committed order.
    async with SessionLocal() as session:
        order = await session.get(
            Order, uuid.UUID(order_id), options=[selectinload(Order.user)]
        )
    return {
        "name": order.user.full_name,
        "short_id": str(order.id)[:8],
        "total_cents": order.total_cents,
        "items": [
            {
                "product_name": i.product_name,
                "quantity": i.quantity,
                "subtotal": i.unit_price_cents * i.quantity,
            }
            for i in order.items
        ],
        "url": f"{settings.frontend_url}/pedidos/{order.id}",
    }


async def send_email(ctx: dict, template: Template, to: str, context: dict) -> None:
    if template == "order_confirmation":
        context = await order_email_context(context["order_id"])
    try:
        await deliver(to, template, context)
    except (aiosmtplib.SMTPException, OSError) as e:
        # arq only retries on Retry; back off 10s, 20s, 40s...
        log.warning("SMTP failure (try %s): %s", ctx["job_try"], e)
        raise Retry(defer=10 * 2 ** (ctx["job_try"] - 1)) from e


async def expire_stale(ctx: dict) -> int:
    return await expire_stale_orders(ctx["gateway"], grace=timedelta(minutes=5))


async def startup(ctx: dict) -> None:
    ctx["gateway"] = StripeGateway(settings.stripe_secret_key)


class WorkerSettings:
    functions = [send_email]
    cron_jobs = [cron(expire_stale, minute=set(range(0, 60, 5)), run_at_startup=True)]
    on_startup = startup
    max_tries = MAX_TRIES
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
