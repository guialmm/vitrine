from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    description: str
    origin: str
    roast: str
    tasting_notes: str
    price_cents: int
    stock: int
    image_url: str
    category: CategoryOut | None


class AdminProductOut(ProductOut):
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProductIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=120)
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    origin: str = ""
    roast: str = ""
    tasting_notes: str = ""
    price_cents: int = Field(gt=0)
    stock: int = Field(ge=0)
    image_url: str = ""
    category_id: int | None = None
    is_active: bool = True


class ProductPatch(BaseModel):
    """Every field optional: only what's sent gets updated."""

    slug: str | None = Field(None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=120)
    name: str | None = Field(None, min_length=2, max_length=120)
    description: str | None = None
    origin: str | None = None
    roast: str | None = None
    tasting_notes: str | None = None
    price_cents: int | None = Field(None, gt=0)
    stock: int | None = Field(None, ge=0)
    image_url: str | None = None
    category_id: int | None = None
    is_active: bool | None = None


Sort = Literal["newest", "price_asc", "price_desc", "name"]


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
