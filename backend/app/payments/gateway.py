from dataclasses import dataclass
from typing import Protocol

import stripe

from app.core.config import settings
from app.models import Order, User


@dataclass
class CheckoutSession:
    id: str
    url: str


class PaymentGateway(Protocol):
    async def create_checkout(self, order: Order, user: User) -> CheckoutSession: ...

    async def refund(self, order: Order) -> None:
        """Full refund of the order's payment. Raises if Stripe refuses."""
        ...

    async def expire_checkout(self, session_id: str) -> bool:
        """Make sure the session can no longer be paid. Returns True if it is now
        expired, False if the customer already completed it."""
        ...


class StripeGateway:
    def __init__(self, api_key: str, api_base: str | None = None):
        self.client = stripe.StripeClient(
            api_key,
            http_client=stripe.HTTPXClient(),
            base_addresses={"api": api_base} if api_base else None,
        )

    async def create_checkout(self, order: Order, user: User) -> CheckoutSession:
        session = await self.client.v1.checkout.sessions.create_async(
            params={
                "mode": "payment",
                "customer_email": user.email,
                "client_reference_id": str(order.id),
                "metadata": {"order_id": str(order.id)},
                # Prices come from our database snapshot, never from the client.
                "line_items": [
                    {
                        "quantity": item.quantity,
                        "price_data": {
                            "currency": order.currency,
                            "unit_amount": item.unit_price_cents,
                            "product_data": {"name": item.product_name},
                        },
                    }
                    for item in order.items
                ],
                "shipping_address_collection": {"allowed_countries": ["BR"]},
                "expires_at": int(order.expires_at.timestamp()),
                "success_url": f"{settings.frontend_url}/pedidos/{order.id}?checkout=sucesso",
                "cancel_url": f"{settings.frontend_url}/carrinho?checkout=cancelado&pedido={order.id}",
            },
            # Retrying the same order never creates a second session.
            options={"idempotency_key": f"checkout-{order.id}"},
        )
        return CheckoutSession(id=session.id, url=session.url)

    async def expire_checkout(self, session_id: str) -> bool:
        try:
            await self.client.v1.checkout.sessions.expire_async(session_id)
        except stripe.InvalidRequestError:
            # Stripe refuses to expire sessions that are complete or already expired.
            session = await self.client.v1.checkout.sessions.retrieve_async(session_id)
            return session.status == "expired"
        return True

    async def refund(self, order: Order) -> None:
        await self.client.v1.refunds.create_async(
            params={"payment_intent": order.stripe_payment_intent},
            # A double click (or a retry after a timeout) can't refund twice.
            options={"idempotency_key": f"refund-{order.id}"},
        )
