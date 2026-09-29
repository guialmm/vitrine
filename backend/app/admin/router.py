"""Back-office endpoints. Staff manage the catalog; only admins manage categories
and user roles."""

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

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
from app.auth.schemas import UserOut
from app.models import Category, Order, OrderStatus, Product, Role, User
from app.orders.schemas import AdminOrderOut

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



@router.get("/orders", response_model=list[AdminOrderOut])
async def list_orders(
    _: StaffUser,
    session: SessionDep,
    status_: Annotated[OrderStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    stmt = select(Order).options(selectinload(Order.user)).order_by(Order.created_at.desc())
    if status_:
        stmt = stmt.where(Order.status == status_)
    return (await session.scalars(stmt.limit(limit))).all()


@router.post("/orders/{order_id}/ship", response_model=AdminOrderOut)
async def ship_order(order_id: uuid.UUID, _: StaffUser, session: SessionDep):
    order = await session.get(Order, order_id, options=[selectinload(Order.user)], with_for_update=True)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status != OrderStatus.paid:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot ship a {order.status.value} order")
    order.status = OrderStatus.shipped
    await session.commit()
    return order


class RoleIn(BaseModel):
    role: Role


@router.get("/users", response_model=list[UserOut])
async def list_users(_: AdminUser, session: SessionDep):
    return (await session.scalars(select(User).order_by(User.created_at))).all()


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def set_role(user_id: uuid.UUID, data: RoleIn, admin: AdminUser, session: SessionDep):
    if user_id == admin.id:
        # Prevents an admin from locking the store out of its own back-office.
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot change your own role")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.role = data.role
    await session.commit()
    return user
