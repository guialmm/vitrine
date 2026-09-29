"""Demo data. Safe to run repeatedly: rows are upserted by slug/email.

    python -m app.seed
"""

import asyncio
import os

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Category, Product, Role, User

CATEGORIES = [
    ("Grãos", "graos"),
    ("Moídos", "moidos"),
    ("Microlotes", "microlotes"),
]

# (slug, name, category, origin, roast, notes, price_cents, stock, description)
PRODUCTS = [
    ("catuai-amarelo", "Catuaí Amarelo", "graos", "Sul de Minas, MG", "media",
     "caramelo, laranja, chocolate ao leite", 5900, 40,
     "Um café redondo e doce, cultivado a 1.100 m. Ótimo no coado e na prensa francesa."),
    ("bourbon-vermelho", "Bourbon Vermelho", "graos", "Alta Mogiana, SP", "clara",
     "frutas vermelhas, mel, floral", 7400, 25,
     "Acidez brilhante e corpo sedoso. Brilha em métodos filtrados como V60 e Chemex."),
    ("mundo-novo", "Mundo Novo", "graos", "Cerrado Mineiro, MG", "media-escura",
     "castanhas, cacau, rapadura", 5200, 60,
     "Encorpado e com final longo. O café do dia a dia para quem gosta de intensidade."),
    ("blend-da-casa", "Blend da Casa", "moidos", "Cerrado Mineiro, MG", "escura",
     "chocolate amargo, melaço", 3900, 80,
     "Moagem média, pensada para cafeteira italiana e coador de pano."),
    ("espresso-vitrine", "Espresso Vitrine", "moidos", "Sul de Minas, MG", "media-escura",
     "cacau, avelã, caramelo queimado", 4600, 50,
     "Blend desenvolvido para espresso: crema densa e doçura que aguenta leite."),
    ("geisha-chapada", "Geisha da Chapada", "microlotes", "Chapada Diamantina, BA", "clara",
     "jasmim, bergamota, pêssego", 18900, 6,
     "Microlote de 12 sacas, fermentação controlada. Complexo, floral e raro."),
    ("yellow-bourbon-natural", "Yellow Bourbon Natural", "microlotes", "Mantiqueira de Minas, MG",
     "clara", "manga, melaço de cana, vinho", 11200, 10,
     "Processo natural com secagem lenta em terreiro suspenso. Frutado e licoroso."),
    ("arara-fermentado", "Arara Fermentado", "microlotes", "Caparaó, ES", "media",
     "abacaxi, canela, chocolate branco", 9800, 0,
     "Fermentação anaeróbica de 72 h. Esgotado — volta na próxima safra."),
]


async def seed() -> None:
    async with SessionLocal() as s:
        cats = {c.slug: c for c in await s.scalars(select(Category))}
        for name, slug in CATEGORIES:
            if slug not in cats:
                cats[slug] = Category(name=name, slug=slug)
                s.add(cats[slug])
        await s.flush()

        existing = {p.slug: p for p in await s.scalars(select(Product))}
        for slug, name, cat, origin, roast, notes, price, stock, desc in PRODUCTS:
            product = existing.get(slug) or Product(slug=slug)
            product.name, product.origin, product.roast = name, origin, roast
            product.tasting_notes, product.price_cents, product.stock = notes, price, stock
            product.description, product.category_id = desc, cats[cat].id
            s.add(product)

        email = os.environ.get("ADMIN_EMAIL", "admin@vitrine.dev")
        admin = await s.scalar(select(User).where(User.email == email))
        if admin is None:
            s.add(User(
                email=email,
                # Dev default only; set ADMIN_PASSWORD for any shared deployment.
                password_hash=hash_password(os.environ.get("ADMIN_PASSWORD", "vitrine-admin")),
                full_name="Admin Vitrine",
                role=Role.admin,
                is_verified=True,
            ))
        await s.commit()
    print(f"Seeded {len(CATEGORIES)} categories, {len(PRODUCTS)} products, admin {email}")


if __name__ == "__main__":
    asyncio.run(seed())
