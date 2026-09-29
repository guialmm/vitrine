import logging
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, GatewayDep, SessionDep, VerifiedUser
from app.models import Order, OrderStatus
from app.orders import service
from app.orders.schemas import CheckoutIn, CheckoutOut, OrderOut

log = logging.getLogger(__name__)

router = APIRouter(tags=["orders"])


@router.post("/checkout", response_model=CheckoutOut, status_code=status.HTTP_201_CREATED)
async def checkout(data: CheckoutIn, user: VerifiedUser, session: SessionDep, gateway: GatewayDep):
    try:
        order = await service.create_pending_order(
            session, user, {line.product_id: line.quantity for line in data.items}
        )
    except service.UnknownProduct:
        await session.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product unavailable") from None
    except service.OutOfStock as e:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Not enough stock: {e.product_name}") from None

    # Commit the reservation before calling Stripe so product rows aren't locked
    # for the duration of a network round-trip.
    await session.commit()

    try:
        checkout_session = await gateway.create_checkout(order, user)
    except Exception:
        log.exception("Stripe checkout failed for order %s", order.id)
        order = await service.lock_order(session, order.id)
        await service.expire_order(session, order)
        await session.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Payment provider unavailable") from None

    order.stripe_session_id = checkout_session.id
    await session.commit()
    return CheckoutOut(order_id=order.id, checkout_url=checkout_session.url)


@router.get("/orders", response_model=list[OrderOut])
async def my_orders(user: CurrentUser, session: SessionDep):
    rows = await session.scalars(
        select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())
    )
    return rows.all()


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: uuid.UUID, user: CurrentUser, session: SessionDep):
    order = await session.get(Order, order_id)
    # 404 rather than 403 for other people's orders: don't confirm they exist.
    if order is None or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
async def cancel_pending_order(
    order_id: uuid.UUID, user: CurrentUser, session: SessionDep, gateway: GatewayDep
):
    """Called when the customer backs out of Stripe Checkout: frees the reserved
    stock now instead of holding it until the reservation times out."""
    order = await session.get(Order, order_id)
    if order is None or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status != OrderStatus.pending:
        return order  # already paid/expired: nothing to undo, idempotent for retries
    if order.stripe_session_id and not await gateway.expire_checkout(order.stripe_session_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Order was already paid")
    order = await service.lock_order(session, order_id)
    await service.expire_order(session, order)
    await session.commit()
    await session.refresh(order)
    return order
