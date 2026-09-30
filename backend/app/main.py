import asyncio
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
from app.orders.router import router as orders_router
from app.payments.gateway import StripeGateway
from app.payments.webhooks import router as webhooks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tests install fakes on app.state before startup; only fill in what's missing.
    if not hasattr(app.state, "gateway"):
        app.state.gateway = StripeGateway(settings.stripe_secret_key)
    redis = None
    if not hasattr(app.state, "mailer"):
        redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        app.state.mailer = ArqMailer(redis)
    worker = None
    if settings.run_worker_inline:
        from arq.worker import create_worker

        from app.worker import WorkerSettings

        worker = create_worker(WorkerSettings, handle_signals=False)
        worker_task = asyncio.create_task(worker.async_run())
    yield
    if worker:
        await worker.close()
        worker_task.cancel()
    if redis:
        await redis.aclose()


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
api.include_router(orders_router)
api.include_router(webhooks_router)
api.include_router(admin_router)


@api.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}


app.include_router(api)
