import json
import logging
import uuid

import stripe
from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.deps import MailerDep, SessionDep
from app.models import Order, ProcessedStripeEvent, User
from app.orders import service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

PAID_EVENTS = {"checkout.session.completed", "checkout.session.async_payment_succeeded"}
EXPIRED_EVENTS = {"checkout.session.expired", "checkout.session.async_payment_failed"}
# Refunds issued from the Stripe dashboard (ours from the admin panel also echo here).
REFUNDED_EVENT = "charge.refunded"


@router.post("/stripe", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    session: SessionDep,
    mailer: MailerDep,
    stripe_signature: str = Header(alias="Stripe-Signature"),
):
    payload = await request.body()  # raw bytes: the signature covers them exactly
    try:
        stripe.WebhookSignature.verify_header(
            payload.decode(), stripe_signature, settings.stripe_webhook_secret
        )
    except stripe.SignatureVerificationError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid signature") from None

    event = json.loads(payload)

    # Recording the event and applying it happen in one transaction: if handling
    # fails, the insert rolls back too and Stripe's retry gets a fresh attempt.
    first_time = await session.scalar(
        insert(ProcessedStripeEvent)
        .values(id=event["id"], type=event["type"])
        .on_conflict_do_nothing()
        .returning(ProcessedStripeEvent.id)
    )
    if first_time is None:
        return {"status": "duplicate"}

    obj = event["data"]["object"]
    if event["type"] == REFUNDED_EVENT:
        return await _handle_refund(session, mailer, obj)

    checkout = obj
    order_id = (checkout.get("metadata") or {}).get("order_id")
    order = await service.lock_order(session, uuid.UUID(order_id)) if order_id else None

    newly_paid = False
    if order is None:
        log.info("Ignoring %s without a known order", event["type"])
    elif event["type"] in PAID_EVENTS and checkout.get("payment_status") == "paid":
        # For async methods (boleto) `completed` arrives unpaid; wait for the next event.
        newly_paid = await service.mark_paid(session, order, checkout)
    elif event["type"] in EXPIRED_EVENTS:
        await service.expire_order(session, order)

    await session.commit()

    if newly_paid:
        # After commit: never announce a payment that could still roll back.
        email = await session.scalar(select(User.email).where(User.id == order.user_id))
        await mailer.send("order_confirmation", email, {"order_id": str(order.id)})
    return {"status": "ok"}


async def _handle_refund(session, mailer, charge: dict) -> dict:
    order = await session.scalar(
        select(Order)
        .where(Order.stripe_payment_intent == charge.get("payment_intent"))
        .with_for_update()
    )
    newly = False
    if order is None:
        log.info("Refund for unknown payment %s", charge.get("payment_intent"))
    elif not charge.get("refunded"):
        log.warning("Partial refund on order %s: left for manual review", order.id)
    else:
        newly = await service.apply_refund(session, order)
    await session.commit()
    if newly:
        email = await session.scalar(select(User.email).where(User.id == order.user_id))
        await mailer.send("order_refunded", email, {"order_id": str(order.id)})
    return {"status": "ok"}
