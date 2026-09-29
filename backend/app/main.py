from contextlib import asynccontextmanager

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.catalog.router import router as catalog_router
from app.core.config import settings
from app.emails.mailer import ArqMailer


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tests install their own mailer before startup; don't replace it.
    if not hasattr(app.state, "mailer"):
        redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        app.state.mailer = ArqMailer(redis)
        yield
        await redis.aclose()
    else:
        yield


app = FastAPI(title="Vitrine API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(catalog_router)
api.include_router(admin_router)


@api.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}


app.include_router(api)
