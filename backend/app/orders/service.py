"""Order lifecycle.

    pending ──(Stripe: paid)──▶ paid ──(staff)──▶ shipped
       │
       └──(Stripe: expired / reservation timeout)──▶ expired   (stock released)

Stock is reserved when the order is created, not when it is paid, so two
customers can never pay for the last unit.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.models import Order, OrderItem, OrderStatus, Product, User
from app.payments.gateway import PaymentGateway

log = logging.getLogger(__name__)


class OutOfStock(Exception):
    def __init__(self, product_name: str):
        self.product_name = product_name


class UnknownProduct(Exception):
    pass


async def _reserve(session: AsyncSession, product_id: int, quantity: int) -> bool:
    # A single conditional UPDATE is atomic: no read-then-write race between
    # concurrent checkouts, and the CHECK (stock >= 0) is a second safety net.
    reserved = await session.scalar(
        update(Product)
        .where(Product.id == product_id, Product.stock >= quantity, Product.is_active)
        .values(stock=Product.stock - quantity)
        .returning(Product.id)
    )
    return reserved is not None


async def _release(session: AsyncSession, order: Order) -> None:
    for item in order.items:
        await session.execute(
            update(Product)
            .where(Product.id == item.product_id)
            .values(stock=Product.stock + item.quantity)
        )


async def create_pending_order(
    session: AsyncSession, user: User, quantities: dict[int, int]
) -> Order:
    """Reserves stock and creates the order. Caller commits; on any exception
    the caller's rollback undoes every reservation made so far."""
    products = {
        p.id: p
        for p in await session.scalars(
            select(Product).where(Product.id.in_(quantities), Product.is_active)
        )
    }
    if len(products) != len(quantities):
        raise UnknownProduct

    order = Order(
        user_id=user.id,
        currency=settings.currency,
        total_cents=0,
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.reservation_minutes),
    )
    # Fixed lock order (by id) prevents deadlocks between overlapping carts.
    for product_id in sorted(quantities):
        product, qty = products[product_id], quantities[product_id]
        if not await _reserve(session, product_id, qty):
            raise OutOfStock(product.name)
        order.items.append(
            OrderItem(
                product_id=product_id,
                product_name=product.name,
                unit_price_cents=product.price_cents,
                quantity=qty,
            )
        )
        order.total_cents += product.price_cents * qty

    session.add(order)
    await session.flush()
    return order


async def lock_order(session: AsyncSession, order_id: uuid.UUID) -> Order | None:
    return await session.scalar(select(Order).where(Order.id == order_id).with_for_update())


async def expire_order(session: AsyncSession, order: Order) -> bool:
    """pending → expired, giving the stock back. No-op for any other status."""
    if order.status != OrderStatus.pending:
        return False
    await _release(session, order)
    order.status = OrderStatus.expired
    return True


async def mark_paid(session: AsyncSession, order: Order, checkout: dict) -> bool:
    """Apply a completed Stripe Checkout Session. Returns True if the order
    transitioned to paid (i.e. a confirmation email should go out)."""
    if order.status == OrderStatus.paid or order.status == OrderStatus.shipped:
        return False  # already applied
    if checkout.get("amount_total") != order.total_cents:
        log.error("Amount mismatch on order %s: %s", order.id, checkout.get("amount_total"))
        return False
    if order.status == OrderStatus.expired:
        # Paid after the reservation lapsed (shouldn't happen: the Stripe session
        # expires with it). Try to take the stock again before accepting.
        try:
            async with session.begin_nested():  # all-or-nothing
                for item in order.items:
                    if not await _reserve(session, item.product_id, item.quantity):
                        raise OutOfStock(item.product_name)
        except OutOfStock:
            log.error("Order %s paid after expiry and stock is gone: refund needed", order.id)
            return False
    elif order.status != OrderStatus.pending:
        log.error("Order %s paid while %s", order.id, order.status)
        return False

    order.status = OrderStatus.paid
    order.paid_at = datetime.now(UTC)
    order.stripe_payment_intent = checkout.get("payment_intent")
    details = checkout.get("collected_information") or {}
    order.shipping = details.get("shipping_details") or checkout.get("shipping_details")
    return True


async def expire_stale_orders(gateway: PaymentGateway, grace: timedelta) -> int:
    """Safety net for lost `checkout.session.expired` webhooks: release stock of
    pending orders whose reservation ran out. Returns how many were expired."""
    cutoff = datetime.now(UTC) - grace
    async with SessionLocal() as session:
        stale = (
            await session.execute(
                select(Order.id, Order.stripe_session_id).where(
                    Order.status == OrderStatus.pending, Order.expires_at < cutoff
                )
            )
        ).all()

    expired = 0
    for order_id, stripe_session_id in stale:
        # Close the Stripe session first so it can't be paid after we free the stock.
        # If the customer already paid, leave it: the `completed` webhook will arrive.
        if stripe_session_id and not await gateway.expire_checkout(stripe_session_id):
            continue
        async with SessionLocal() as session:
            order = await lock_order(session, order_id)
            if order and await expire_order(session, order):
                await session.commit()
                expired += 1
    if expired:
        log.info("Expired %d stale orders", expired)
    return expired
