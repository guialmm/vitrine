from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import Select, func, or_, select

from app.catalog.schemas import CategoryOut, Page, ProductOut, Sort
from app.core.deps import SessionDep
from app.models import Category, Product

router = APIRouter(tags=["catalog"])

SORTS = {
    "newest": Product.created_at.desc(),
    "price_asc": Product.price_cents.asc(),
    "price_desc": Product.price_cents.desc(),
    "name": Product.name.asc(),
}


def filter_products(
    stmt: Select,
    q: str | None = None,
    category: str | None = None,
    roast: str | None = None,
    in_stock: bool = False,
) -> Select:
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                Product.origin.ilike(like),
                Product.tasting_notes.ilike(like),
            )
        )
    if category:
        stmt = stmt.join(Category).where(Category.slug == category)
    if roast:
        stmt = stmt.where(Product.roast == roast)
    if in_stock:
        stmt = stmt.where(Product.stock > 0)
    return stmt


async def paginate(session, stmt: Select, sort: Sort, page: int, page_size: int) -> dict:
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = await session.scalars(
        stmt.order_by(SORTS[sort], Product.id).offset((page - 1) * page_size).limit(page_size)
    )
    return {"items": rows.all(), "total": total, "page": page, "page_size": page_size}


@router.get("/products", response_model=Page[ProductOut])
async def list_products(
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: str | None = None,
    roast: str | None = None,
    in_stock: bool = False,
    sort: Sort = "newest",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=60)] = 12,
):
    stmt = filter_products(select(Product).where(Product.is_active), q, category, roast, in_stock)
    return await paginate(session, stmt, sort, page, page_size)


@router.get("/products/{slug}", response_model=ProductOut)
async def get_product(slug: str, session: SessionDep):
    product = await session.scalar(
        select(Product).where(Product.slug == slug, Product.is_active)
    )
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return product


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(session: SessionDep):
    return (await session.scalars(select(Category).order_by(Category.name))).all()
