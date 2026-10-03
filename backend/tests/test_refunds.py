import pytest
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import Order, OrderStatus, Product, Role
from tests.conftest import bearer, create_user, stripe_event


@pytest.fixture
async def product():
    async with SessionLocal() as s:
        s.add(Product(slug="catuai", name="Catuaí", price_cents=5900, stock=10))
        await s.commit()


async def stock() -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(Product.stock))


async def status(order_id: str) -> OrderStatus:
    async with SessionLocal() as s:
        return (await s.get(Order, order_id)).status


async def paid_order(client, customer, qty: int = 2) -> str:
    r = await client.post(
        "/api/checkout", json={"items": [{"product_id": 1, "quantity": qty}]}, headers=bearer(customer)
    )
    order_id = r.json()["order_id"]
    payload, headers = stripe_event("checkout.session.completed", {
        "metadata": {"order_id": order_id}, "amount_total": 5900 * qty,
        "payment_status": "paid", "payment_intent": f"pi_{order_id[:8]}",
    })
    await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    return order_id


@pytest.fixture
async def people(client):
    return {
        "customer": await create_user(client, "ana@example.com"),
        "staff": await create_user(client, "staff@example.com", role=Role.staff),
        "admin": await create_user(client, "admin@example.com", role=Role.admin),
    }


async def test_refunding_a_paid_order_returns_money_stock_and_emails(client, gateway, mailer, product, people):
    order_id = await paid_order(client, people["customer"])
    assert await stock() == 8

    r = await client.post(f"/api/admin/orders/{order_id}/refund", headers=bearer(people["admin"]))
    assert r.status_code == 200
    assert r.json()["status"] == "refunded"
    assert gateway.refunded == [f"pi_{order_id[:8]}"]
    assert await stock() == 10  # never shipped: bags go back on the shelf
    assert ("order_refunded", "ana@example.com", {"order_id": order_id}) in mailer.sent


async def test_refunding_a_shipped_order_keeps_stock_out(client, gateway, product, people):
    order_id = await paid_order(client, people["customer"])
    await client.post(f"/api/admin/orders/{order_id}/ship", headers=bearer(people["staff"]))
    r = await client.post(f"/api/admin/orders/{order_id}/refund", headers=bearer(people["admin"]))
    assert r.json()["status"] == "refunded"
    assert await stock() == 8  # the coffee already left the building


async def test_only_admins_can_refund(client, product, people):
    order_id = await paid_order(client, people["customer"])
    for who in ("customer", "staff"):
        r = await client.post(f"/api/admin/orders/{order_id}/refund", headers=bearer(people[who]))
        assert r.status_code == 403
    assert await status(order_id) == OrderStatus.paid


async def test_cannot_refund_twice_or_refund_unpaid_orders(client, gateway, product, people):
    order_id = await paid_order(client, people["customer"])
    await client.post(f"/api/admin/orders/{order_id}/refund", headers=bearer(people["admin"]))
    again = await client.post(f"/api/admin/orders/{order_id}/refund", headers=bearer(people["admin"]))
    assert again.status_code == 409
    assert len(gateway.refunded) == 1
    assert await stock() == 10  # released exactly once

    r = await client.post(
        "/api/checkout", json={"items": [{"product_id": 1, "quantity": 1}]}, headers=bearer(people["customer"])
    )
    pending = r.json()["order_id"]
    r = await client.post(f"/api/admin/orders/{pending}/refund", headers=bearer(people["admin"]))
    assert r.status_code == 409


async def test_stripe_refusal_leaves_the_order_untouched(client, gateway, mailer, product, people):
    order_id = await paid_order(client, people["customer"])
    gateway.refuse_refunds = True
    r = await client.post(f"/api/admin/orders/{order_id}/refund", headers=bearer(people["admin"]))
    assert r.status_code == 502
    assert await status(order_id) == OrderStatus.paid
    assert await stock() == 8
    assert not [m for m in mailer.sent if m[0] == "order_refunded"]


async def test_shipping_emails_the_customer(client, mailer, product, people):
    order_id = await paid_order(client, people["customer"])
    await client.post(f"/api/admin/orders/{order_id}/ship", headers=bearer(people["staff"]))
    assert ("order_shipped", "ana@example.com", {"order_id": order_id}) in mailer.sent


# ---------- refunds made directly in the Stripe dashboard ----------

async def test_dashboard_refund_webhook_refunds_the_order_once(client, mailer, product, people):
    order_id = await paid_order(client, people["customer"])
    charge = {"object": "charge", "payment_intent": f"pi_{order_id[:8]}", "refunded": True}
    for _ in range(2):  # two distinct deliveries describing the same refund
        payload, headers = stripe_event("charge.refunded", charge)
        await client.post("/api/webhooks/stripe", content=payload, headers=headers)

    assert await status(order_id) == OrderStatus.refunded
    assert await stock() == 10
    assert len([m for m in mailer.sent if m[0] == "order_refunded"]) == 1


async def test_partial_refund_is_left_for_manual_review(client, product, people):
    order_id = await paid_order(client, people["customer"])
    payload, headers = stripe_event(
        "charge.refunded", {"payment_intent": f"pi_{order_id[:8]}", "refunded": False, "amount_refunded": 100}
    )
    await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    assert await status(order_id) == OrderStatus.paid
