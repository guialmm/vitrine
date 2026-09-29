import pytest

from app.core.db import SessionLocal
from app.models import Category, Product, Role
from tests.conftest import bearer, create_user


@pytest.fixture
async def catalog():
    async with SessionLocal() as s:
        graos = Category(name="Grãos", slug="graos")
        moidos = Category(name="Moídos", slug="moidos")
        s.add_all([graos, moidos])
        await s.flush()
        s.add_all([
            Product(slug="catuai-amarelo", name="Catuaí Amarelo", origin="Sul de Minas",
                    roast="media", tasting_notes="caramelo, laranja", price_cents=5900,
                    stock=10, category_id=graos.id),
            Product(slug="bourbon-vermelho", name="Bourbon Vermelho", origin="Mogiana",
                    roast="clara", tasting_notes="frutas vermelhas", price_cents=7400,
                    stock=0, category_id=graos.id),
            Product(slug="blend-da-casa", name="Blend da Casa", origin="Cerrado Mineiro",
                    roast="escura", tasting_notes="chocolate", price_cents=3900,
                    stock=25, category_id=moidos.id),
            Product(slug="descontinuado", name="Descontinuado", price_cents=1000,
                    stock=5, is_active=False),
        ])
        await s.commit()


async def slugs(client, **params) -> list[str]:
    r = await client.get("/api/products", params=params)
    assert r.status_code == 200, r.text
    return [p["slug"] for p in r.json()["items"]]


async def test_storefront_hides_inactive_products(client, catalog):
    r = await client.get("/api/products")
    assert r.json()["total"] == 3
    assert "descontinuado" not in await slugs(client)
    assert (await client.get("/api/products/descontinuado")).status_code == 404


async def test_search_matches_name_origin_and_notes(client, catalog):
    assert await slugs(client, q="bourbon") == ["bourbon-vermelho"]
    assert await slugs(client, q="cerrado") == ["blend-da-casa"]
    assert await slugs(client, q="CHOCOLATE") == ["blend-da-casa"]


async def test_filters_and_sort(client, catalog):
    assert await slugs(client, category="moidos") == ["blend-da-casa"]
    assert await slugs(client, roast="clara") == ["bourbon-vermelho"]
    assert "bourbon-vermelho" not in await slugs(client, in_stock=True)
    assert await slugs(client, sort="price_asc") == [
        "blend-da-casa", "catuai-amarelo", "bourbon-vermelho"
    ]


async def test_pagination(client, catalog):
    r = await client.get("/api/products", params={"page_size": 2, "page": 2, "sort": "name"})
    body = r.json()
    assert body["total"] == 3
    assert [p["slug"] for p in body["items"]] == ["catuai-amarelo"]


async def test_product_detail_includes_category(client, catalog):
    r = await client.get("/api/products/catuai-amarelo")
    assert r.json()["category"]["slug"] == "graos"


@pytest.mark.parametrize("role,expected", [(Role.customer, 403), (Role.staff, 201), (Role.admin, 201)])
async def test_only_staff_can_create_products(client, role, expected):
    login = await create_user(client, role=role)
    r = await client.post(
        "/api/admin/products",
        json={"slug": "novo", "name": "Novo", "price_cents": 1000, "stock": 1},
        headers=bearer(login),
    )
    assert r.status_code == expected


async def test_admin_endpoints_require_auth(client):
    assert (await client.get("/api/admin/products")).status_code == 401


async def test_staff_updates_and_archives_product(client, catalog):
    login = await create_user(client, role=Role.staff)
    r = await client.patch("/api/admin/products/1", json={"price_cents": 6200}, headers=bearer(login))
    assert r.status_code == 200
    assert r.json()["price_cents"] == 6200
    assert r.json()["name"] == "Catuaí Amarelo"  # untouched fields preserved

    assert (await client.delete("/api/admin/products/1", headers=bearer(login))).status_code == 204
    assert (await client.get("/api/products/catuai-amarelo")).status_code == 404

    admin_list = await client.get("/api/admin/products", headers=bearer(login))
    assert admin_list.json()["total"] == 4  # back-office still sees archived items


async def test_duplicate_slug_conflicts(client, catalog):
    login = await create_user(client, role=Role.staff)
    r = await client.post(
        "/api/admin/products",
        json={"slug": "catuai-amarelo", "name": "Outro", "price_cents": 1000, "stock": 1},
        headers=bearer(login),
    )
    assert r.status_code == 409


async def test_invalid_price_rejected(client):
    login = await create_user(client, role=Role.staff)
    r = await client.post(
        "/api/admin/products",
        json={"slug": "x", "name": "Xx", "price_cents": 0, "stock": 1},
        headers=bearer(login),
    )
    assert r.status_code == 422


async def test_only_admin_creates_categories(client):
    staff = await create_user(client, "staff@example.com", role=Role.staff)
    admin = await create_user(client, "admin@example.com", role=Role.admin)
    body = {"name": "Acessórios", "slug": "acessorios"}
    assert (await client.post("/api/admin/categories", json=body, headers=bearer(staff))).status_code == 403
    assert (await client.post("/api/admin/categories", json=body, headers=bearer(admin))).status_code == 201
