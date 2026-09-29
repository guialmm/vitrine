from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.db import SessionLocal
from app.emails.sender import brl, render
from app.models import Order, OrderStatus, Product
from app.orders.service import expire_stale_orders
from app.worker import order_email_context
from tests.conftest import bearer, create_user


def test_brl_formatting():
    assert brl(5900) == "R$ 59,00"
    assert brl(123456) == "R$ 1.234,56"


def test_templates_render_html_and_text():
    msg = render("verify_email", {"name": "Ana", "url": "http://x/verify?token=abc"})
    assert msg["Subject"] == "Confirme seu e-mail na Vitrine"
    text, html = (part.get_content() for part in msg.iter_parts())
    assert "http://x/verify?token=abc" in text
    assert 'href="http://x/verify?token=abc"' in html


def test_user_input_is_escaped_in_html():
    msg = render("reset_password", {"name": "<script>x</script>", "url": "http://x"})
    html = list(msg.iter_parts())[1].get_content()
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_missing_variable_fails_instead_of_sending_broken_email():
    with pytest.raises(Exception):
        render("verify_email", {"name": "Ana"})


@pytest.fixture
async def product():
    async with SessionLocal() as s:
        s.add(Product(slug="catuai", name="Catuaí", price_cents=5900, stock=10))
        await s.commit()


async def stock() -> int:
    async with SessionLocal() as s:
        return await s.scalar(select(Product.stock))


async def make_order(client, login) -> str:
    r = await client.post(
        "/api/checkout", json={"items": [{"product_id": 1, "quantity": 3}]}, headers=bearer(login)
    )
    return r.json()["order_id"]


async def backdate(order_id: str, minutes: int) -> None:
    async with SessionLocal() as s:
        order = await s.get(Order, order_id)
        order.expires_at = datetime.now(UTC) - timedelta(minutes=minutes)
        await s.commit()


async def status(order_id: str) -> OrderStatus:
    async with SessionLocal() as s:
        return (await s.get(Order, order_id)).status


async def test_order_confirmation_context(client, product):
    login = await create_user(client)
    order_id = await make_order(client, login)
    ctx = await order_email_context(order_id)
    assert ctx["name"] == "Ana"
    assert ctx["items"] == [{"product_name": "Catuaí", "quantity": 3, "subtotal": 17700}]
    msg = render("order_confirmation", ctx)
    assert msg["Subject"] == f"Pedido #{order_id[:8]} confirmado"
    assert "R$ 177,00" in list(msg.iter_parts())[1].get_content()


async def test_stale_orders_are_expired_and_stock_released(client, gateway, product):
    login = await create_user(client)
    old = await make_order(client, login)
    fresh = await make_order(client, login)
    await backdate(old, minutes=10)
    assert await stock() == 4

    assert await expire_stale_orders(gateway, grace=timedelta(minutes=5)) == 1
    assert await status(old) == OrderStatus.expired
    assert await status(fresh) == OrderStatus.pending
    assert await stock() == 7
    assert gateway.expired == ["cs_test_1"]  # Stripe session closed first


async def test_orders_already_paid_on_stripe_are_left_for_the_webhook(client, gateway, product):
    login = await create_user(client)
    order_id = await make_order(client, login)
    await backdate(order_id, minutes=10)
    gateway.completed.add("cs_test_1")

    assert await expire_stale_orders(gateway, grace=timedelta(minutes=5)) == 0
    assert await status(order_id) == OrderStatus.pending
    assert await stock() == 7
