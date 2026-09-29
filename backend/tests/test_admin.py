import pytest

from app.core.db import SessionLocal
from app.models import Product, Role
from tests.conftest import bearer, create_user, stripe_event


@pytest.fixture
async def product():
    async with SessionLocal() as s:
        s.add(Product(slug="catuai", name="Catuaí", price_cents=5900, stock=10))
        await s.commit()


async def place_order(client, login, pay: bool) -> str:
    r = await client.post(
        "/api/checkout", json={"items": [{"product_id": 1, "quantity": 1}]}, headers=bearer(login)
    )
    order_id = r.json()["order_id"]
    if pay:
        payload, headers = stripe_event("checkout.session.completed", {
            "metadata": {"order_id": order_id}, "amount_total": 5900, "payment_status": "paid",
        })
        await client.post("/api/webhooks/stripe", content=payload, headers=headers)
    return order_id


async def test_staff_lists_orders_with_customer_and_status_filter(client, product):
    ana = await create_user(client, "ana@example.com")
    staff = await create_user(client, "staff@example.com", role=Role.staff)
    await place_order(client, ana, pay=True)
    await place_order(client, ana, pay=False)

    r = await client.get("/api/admin/orders", headers=bearer(staff))
    assert len(r.json()) == 2
    assert r.json()[0]["customer_email"] == "ana@example.com"

    r = await client.get("/api/admin/orders", params={"status": "paid"}, headers=bearer(staff))
    assert [o["status"] for o in r.json()] == ["paid"]

    assert (await client.get("/api/admin/orders", headers=bearer(ana))).status_code == 403


async def test_only_paid_orders_can_ship(client, product):
    ana = await create_user(client, "ana@example.com")
    staff = await create_user(client, "staff@example.com", role=Role.staff)
    paid = await place_order(client, ana, pay=True)
    pending = await place_order(client, ana, pay=False)

    r = await client.post(f"/api/admin/orders/{pending}/ship", headers=bearer(staff))
    assert r.status_code == 409
    r = await client.post(f"/api/admin/orders/{paid}/ship", headers=bearer(staff))
    assert r.json()["status"] == "shipped"
    # Shipping twice is also a conflict, not a silent no-op.
    assert (await client.post(f"/api/admin/orders/{paid}/ship", headers=bearer(staff))).status_code == 409


async def test_admin_promotes_users_but_not_themselves(client):
    admin = await create_user(client, "admin@example.com", role=Role.admin)
    ana = await create_user(client, "ana@example.com")

    r = await client.patch(
        f"/api/admin/users/{ana['user']['id']}/role", json={"role": "staff"}, headers=bearer(admin)
    )
    assert r.json()["role"] == "staff"
    # The promotion is effective right away with the *existing* token (role read from DB).
    assert (await client.get("/api/admin/orders", headers=bearer(ana))).status_code == 200

    r = await client.patch(
        f"/api/admin/users/{admin['user']['id']}/role", json={"role": "customer"}, headers=bearer(admin)
    )
    assert r.status_code == 409


async def test_staff_cannot_manage_roles(client):
    staff = await create_user(client, "staff@example.com", role=Role.staff)
    r = await client.patch(
        f"/api/admin/users/{staff['user']['id']}/role", json={"role": "admin"}, headers=bearer(staff)
    )
    assert r.status_code == 403
