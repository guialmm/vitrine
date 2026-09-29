import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import OrderStatus


class CartLine(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=20)


class CheckoutIn(BaseModel):
    items: list[CartLine] = Field(min_length=1, max_length=30)

    @field_validator("items")
    @classmethod
    def unique_products(cls, items: list[CartLine]) -> list[CartLine]:
        if len({i.product_id for i in items}) != len(items):
            raise ValueError("each product may appear only once")
        return items


class CheckoutOut(BaseModel):
    order_id: uuid.UUID
    checkout_url: str


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int
    product_name: str
    unit_price_cents: int
    quantity: int


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: OrderStatus
    total_cents: int
    currency: str
    items: list[OrderItemOut]
    shipping: dict | None
    created_at: datetime
    expires_at: datetime
    paid_at: datetime | None


class AdminOrderOut(OrderOut):
    user_id: uuid.UUID
    customer_email: str
