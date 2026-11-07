import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import timedelta

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from redis.exceptions import RedisError

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.catalog.router import router as catalog_router
from app.core.config import settings
from app.core.ratelimit import FallbackLimiter, MemoryLimiter, RedisLimiter
from app.emails.mailer import ArqMailer, DirectMailer, FallbackMailer
from app.orders.router import router as orders_router
from app.payments.gateway import StripeGateway
from app.payments.webhooks import router as webhooks_router

log = logging.getLogger(__name__)


async def expire_stale_loop(gateway) -> None:
    """The worker's 5-minute cron, for when there is no Redis to run the worker."""
    from app.orders.service import expire_stale_orders

    while True:
        try:
            await expire_stale_orders(gateway, grace=timedelta(minutes=5))
        except Exception:
            log.exception("expiring stale orders failed")
        await asyncio.sleep(5 * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Tests install fakes on app.state before startup; only fill in what's missing.
    if not hasattr(app.state, "gateway"):
        app.state.gateway = StripeGateway(settings.stripe_secret_key, settings.stripe_api_base)
    redis = None
    sem_redis = False
    if not (hasattr(app.state, "mailer") and hasattr(app.state, "limiter")):
        # Redis is a helper (email queue, rate-limit counters): if it is gone, the
        # shop still opens, with in-process stand-ins.
        try:
            redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        except (RedisError, OSError) as e:
            log.error("Redis unavailable at startup, running without it: %s", e)
            sem_redis = True
        if not hasattr(app.state, "mailer"):
            app.state.mailer = FallbackMailer(ArqMailer(redis)) if redis else DirectMailer()
        if not hasattr(app.state, "limiter"):
            app.state.limiter = FallbackLimiter(RedisLimiter(redis)) if redis else MemoryLimiter()
    worker = expirer = None
    if settings.run_worker_inline and sem_redis:
        expirer = asyncio.create_task(expire_stale_loop(app.state.gateway))
    elif settings.run_worker_inline:
        from arq.worker import create_worker

        from app.worker import WorkerSettings

        worker = create_worker(WorkerSettings, handle_signals=False)
        worker_task = asyncio.create_task(worker.async_run())
    yield
    if expirer:
        expirer.cancel()
    if worker:
        await worker.close()
        worker_task.cancel()
    if redis:
        await redis.aclose()


app = FastAPI(title="Vitrine API", version="0.1.0", lifespan=lifespan)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.url.path.startswith("/api/auth/"):
        # Responses carry access tokens: never let a browser or proxy cache them.
        response.headers["Cache-Control"] = "no-store"
    return response


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
