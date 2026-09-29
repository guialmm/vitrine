"""Back-office endpoints. Staff manage the catalog; only admins manage categories
and user roles."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.catalog.router import filter_products, paginate
from app.catalog.schemas import (
    AdminProductOut,
    CategoryIn,
    CategoryOut,
    Page,
    ProductIn,
    ProductPatch,
    Sort,
)
from app.core.deps import AdminUser, SessionDep, StaffUser
from app.models import Category, Product

router = APIRouter(prefix="/admin", tags=["admin"])


async def _commit_or_conflict(session, detail: str) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail) from None


async def _get_product(session, product_id: int) -> Product:
    product = await session.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return product


@router.get("/products", response_model=Page[AdminProductOut])
async def list_all_products(
    _: StaffUser,
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: Sort = "newest",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    # Unlike the storefront, includes inactive products.
    return await paginate(session, filter_products(select(Product), q), sort, page, page_size)


@router.post("/products", response_model=AdminProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(data: ProductIn, _: StaffUser, session: SessionDep):
    product = Product(**data.model_dump())
    session.add(product)
    await _commit_or_conflict(session, "Slug already in use or invalid category")
    await session.refresh(product, ["category"])
    return product


@router.patch("/products/{product_id}", response_model=AdminProductOut)
async def update_product(product_id: int, data: ProductPatch, _: StaffUser, session: SessionDep):
    product = await _get_product(session, product_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    await _commit_or_conflict(session, "Slug already in use or invalid category")
    await session.refresh(product, ["category", "updated_at"])
    return product


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_product(product_id: int, _: StaffUser, session: SessionDep):
    # Soft delete: past orders still reference the product.
    product = await _get_product(session, product_id)
    product.is_active = False
    await session.commit()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(data: CategoryIn, _: AdminUser, session: SessionDep):
    category = Category(**data.model_dump())
    session.add(category)
    await _commit_or_conflict(session, "Slug already in use")
    return category
