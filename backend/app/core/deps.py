import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.ratelimit import Limiter
from app.core.security import decode_token
from app.emails.mailer import Mailer
from app.models import Role, User
from app.payments.gateway import PaymentGateway

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_bearer = HTTPBearer(auto_error=False)

_unauthorized = HTTPException(
    status.HTTP_401_UNAUTHORIZED,
    "Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if creds is None:
        raise _unauthorized
    try:
        payload = decode_token(creds.credentials, "access")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise _unauthorized from None

    # Role is re-read from the DB rather than trusted from the token, so a demotion
    # takes effect immediately instead of when the access token expires.
    user = await session.get(User, user_id)
    if user is None:
        raise _unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role):
    async def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return checker


StaffUser = Annotated[User, Depends(require_roles(Role.staff, Role.admin))]
AdminUser = Annotated[User, Depends(require_roles(Role.admin))]


async def require_verified(user: CurrentUser) -> User:
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Verify your email first")
    return user


VerifiedUser = Annotated[User, Depends(require_verified)]


def get_mailer(request: Request) -> Mailer:
    return request.app.state.mailer


MailerDep = Annotated[Mailer, Depends(get_mailer)]


def get_gateway(request: Request) -> PaymentGateway:
    return request.app.state.gateway


GatewayDep = Annotated[PaymentGateway, Depends(get_gateway)]


def get_limiter(request: Request) -> Limiter:
    return request.app.state.limiter


LimiterDep = Annotated[Limiter, Depends(get_limiter)]


def client_ip(request: Request) -> str:
    # uvicorn's --proxy-headers resolves X-Forwarded-For into request.client.
    # Vercel overwrites that header, but a client calling the API host directly
    # can forge it: per-IP limits are best-effort, per-account limits are not.
    return request.client.host if request.client else "unknown"


ClientIP = Annotated[str, Depends(client_ip)]
