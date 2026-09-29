import asyncio

import pytest
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import Order, OrderStatus, Product
from tests.conftest import bearer, create_user, stripe_event


@pytest.fixture
async def products():
    async with SessionLocal() as s:
        s.add_all([
            Product(slug="catuai", name="Catuaí", price_cents=5900, stock=10),
            Product(slug="bourbon", name="Bourbon", price_cents=7400, stock=1),
            Product(slug="antigo", name="Antigo", price_cents=1000, stock=9, is_active=False),
        ])
        await s.commit()


async def stock(slug: str) -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(Product.stock).where(Product.slug == slug))


async def get_order(order_id) -> Order:
    async with SessionLocal() as s:
        return await s.get(Order, order_id)


async def checkout(client, login, items):
    return await client.post("/api/checkout", json={"items": items}, headers=bearer(login))


async def paid_order(client, gateway, login) -> dict:
    r = await checkout(client, login, [{"product_id": 1, "quantity": 2}])
    assert r.status_code == 201, r.text
    return r.json()


def completed_session(order_id: str, amount: int = 11800, payment_status: str = "paid") -> dict:
    return {
        "id": "cs_test_1",
        "object": "checkout.session",
        "metadata": {"order_id": order_id},
        "amount_total": amount,
        "payment_status": payment_status,
        "payment_intent": "pi_123",
        "collected_information": {
            "shipping_details": {"name": "Ana", "address": {"city": "São Paulo", "country": "BR"}}
        },
    }


# ---------- checkout ----------

async def test_checkout_requires_verified_email(client, products):
    login = await create_user(client, verified=False)
    r = await checkout(client, login, [{"product_id": 1, "quantity": 1}])
    assert r.status_code == 403


async def test_checkout_reserves_stock_and_uses_db_prices(client, gateway, products):
    login = await create_user(client)
    r = await checkout(client, login, [{"product_id": 1, "quantity": 2}, {"product_id": 2, "quantity": 1}])
    assert r.status_code == 201
    assert r.json()["checkout_url"].startswith("https://checkout.stripe.test/")

    order = await get_order(r.json()["order_id"])
    assert order.status == OrderStatus.pending
    assert order.total_cents == 2 * 5900 + 7400
    assert order.stripe_session_id == "cs_test_1"
    assert await stock("catuai") == 8
    assert await stock("bourbon") == 0


async def test_out_of_stock_rolls_back_the_whole_cart(client, products):
    login = await create_user(client)
    r = await checkout(client, login, [{"product_id": 1, "quantity": 3}, {"product_id": 2, "quantity": 5}])
    assert r.status_code == 409
    assert "Bourbon" in r.json()["detail"]
    assert await stock("catuai") == 10  # first line's reservation undone


async def test_inactive_or_unknown_products_cannot_be_bought(client, products):
    login = await create_user(client)
    assert (await checkout(client, login, [{"product_id": 3, "quantity": 1}])).status_code == 404
    assert (await checkout(client, login, [{"product_id": 999, "quantity": 1}])).status_code == 404


async def test_duplicate_lines_and_bad_quantities_rejected(client, products):
    login = await create_user(client)
    dup = [{"product_id": 1, "quantity": 1}, {"product_id": 1, "quantity": 1}]
    assert (await checkout(client, login, dup)).status_code == 422
    assert (await checkout(client, login, [{"product_id": 1, "quantity": 0}])).status_code == 422


async def test_stripe_failure_releases_reservation(client, gateway, products):
    gateway.fail = True
    login = await create_user(client)
    r = await checkout(client, login, [{"product_id": 1, "quantity": 4}])
    assert r.status_code == 502
    assert await stock("catuai") == 10


async def test_concurrent_checkouts_cannot_oversell_last_unit(client, products):
    a = await create_user(client, "a@example.com")
    b = await create_user(client, "b@example.com")
    line = [{"product_id": 2, "quantity": 1}]
    results = await asyncio.gather(checkout(client, a, line), checkout(client, b, line))
    assert sorted(r.status_code for r in results) == [201, 409]
    assert await stock("bourbon") == 0


# ---------- webhook ----------

async def test_webhook_rejects_bad_signature(client):
    payload, headers = stripe_event("checkout.session.completed", {})
    headers["Stripe-Signature"] = headers["Stripe-Signature"][:-4] + "beef"
    r = await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    assert r.status_code == 400


async def test_completed_webhook_marks_paid_and_emails_once(client, gateway, mailer, products):
    login = await create_user(client)
    order_id = (await paid_order(client, gateway, login))["order_id"]

    payload, headers = stripe_event("checkout.session.completed", completed_session(order_id), "evt_1")
    r = await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    assert r.json() == {"status": "ok"}

    order = await get_order(order_id)
    assert order.status == OrderStatus.paid
    assert order.stripe_payment_intent == "pi_123"
    assert order.shipping["address"]["city"] == "São Paulo"

    # Stripe retries the same event: acknowledged, but nothing happens twice.
    r = await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    assert r.json() == {"status": "duplicate"}
    confirmations = [m for m in mailer.sent if m[0] == "order_confirmation"]
    assert confirmations == [("order_confirmation", "ana@example.com", {"order_id": order_id})]


async def test_unpaid_completion_waits_for_async_payment(client, gateway, products):
    login = await create_user(client)
    order_id = (await paid_order(client, gateway, login))["order_id"]
    payload, headers = stripe_event(
        "checkout.session.completed", completed_session(order_id, payment_status="unpaid")
    )
    await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    assert (await get_order(order_id)).status == OrderStatus.pending

    payload, headers = stripe_event(
        "checkout.session.async_payment_succeeded", completed_session(order_id)
    )
    await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    assert (await get_order(order_id)).status == OrderStatus.paid


async def test_amount_mismatch_is_not_marked_paid(client, gateway, products):
    login = await create_user(client)
    order_id = (await paid_order(client, gateway, login))["order_id"]
    payload, headers = stripe_event("checkout.session.completed", completed_session(order_id, amount=1))
    await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    assert (await get_order(order_id)).status == OrderStatus.pending


async def test_expired_webhook_releases_stock_exactly_once(client, gateway, products):
    login = await create_user(client)
    order_id = (await paid_order(client, gateway, login))["order_id"]
    assert await stock("catuai") == 8

    for _ in range(2):  # two distinct events for the same order
        payload, headers = stripe_event("checkout.session.expired", {"metadata": {"order_id": order_id}})
        await client.post("/api/webhooks/stripe", content=payload, headers=headers)

    assert (await get_order(order_id)).status == OrderStatus.expired
    assert await stock("catuai") == 10


async def test_payment_after_expiry_retakes_stock(client, gateway, products):
    login = await create_user(client)
    order_id = (await paid_order(client, gateway, login))["order_id"]
    payload, headers = stripe_event("checkout.session.expired", {"metadata": {"order_id": order_id}})
    await client.post("/api/webhooks/stripe", content=payload, headers=headers)

    payload, headers = stripe_event("checkout.session.completed", completed_session(order_id))
    await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    assert (await get_order(order_id)).status == OrderStatus.paid
    assert await stock("catuai") == 8


# ---------- my orders ----------

async def test_customers_only_see_their_own_orders(client, gateway, products):
    ana = await create_user(client, "ana@example.com")
    bia = await create_user(client, "bia@example.com")
    order_id = (await paid_order(client, gateway, ana))["order_id"]

    assert len((await client.get("/api/orders", headers=bearer(ana))).json()) == 1
    assert (await client.get("/api/orders", headers=bearer(bia))).json() == []
    assert (await client.get(f"/api/orders/{order_id}", headers=bearer(ana))).status_code == 200
    assert (await client.get(f"/api/orders/{order_id}", headers=bearer(bia))).status_code == 404


# ---------- cancel on return from Stripe ----------

async def test_customer_backing_out_of_stripe_releases_stock(client, gateway, products):
    login = await create_user(client)
    order_id = (await paid_order(client, gateway, login))["order_id"]
    assert await stock("catuai") == 8

    r = await client.post(f"/api/orders/{order_id}/cancel", headers=bearer(login))
    assert r.json()["status"] == "expired"
    assert await stock("catuai") == 10
    assert gateway.expired == ["cs_test_1"]

    # Retrying is harmless: no double release.
    await client.post(f"/api/orders/{order_id}/cancel", headers=bearer(login))
    assert await stock("catuai") == 10


async def test_cannot_cancel_an_order_already_paid_on_stripe(client, gateway, products):
    login = await create_user(client)
    order_id = (await paid_order(client, gateway, login))["order_id"]
    gateway.completed.add("cs_test_1")
    r = await client.post(f"/api/orders/{order_id}/cancel", headers=bearer(login))
    assert r.status_code == 409
    assert await stock("catuai") == 8


async def test_cannot_cancel_someone_elses_order(client, gateway, products):
    ana = await create_user(client, "ana@example.com")
    bia = await create_user(client, "bia@example.com")
    order_id = (await paid_order(client, gateway, ana))["order_id"]
    r = await client.post(f"/api/orders/{order_id}/cancel", headers=bearer(bia))
    assert r.status_code == 404
