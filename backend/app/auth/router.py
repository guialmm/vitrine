import uuid
from typing import Annotated

import jwt
from fastapi import APIRouter, Cookie, HTTPException, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth import service
from app.auth.schemas import (
    EmailIn,
    LoginIn,
    RegisterIn,
    ResetPasswordIn,
    TokenIn,
    TokenOut,
    UserOut,
)
from app.core.config import settings
from app.core.deps import CurrentUser, MailerDep, SessionDep
from app.core.security import (
    create_access_token,
    create_email_token,
    decode_token,
    hash_password,
    reset_token_matches,
    verify_password,
)
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_PATH = "/api/auth"
RefreshCookie = Annotated[str | None, Cookie(alias=settings.refresh_cookie_name)]


def _set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        settings.refresh_cookie_name,
        raw,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,  # unreachable from JS, so XSS can't steal it
        secure=settings.secure_cookies,
        samesite="lax",
        path=COOKIE_PATH,  # only sent to auth endpoints
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.refresh_cookie_name, path=COOKIE_PATH)


async def _send_verification(mailer: MailerDep, user: User) -> None:
    token = create_email_token(user, "verify")
    await mailer.send(
        "verify_email",
        user.email,
        {"name": user.full_name, "url": f"{settings.frontend_url}/verify-email?token={token}"},
    )


def _normalize(email: str) -> str:
    return email.strip().lower()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterIn, session: SessionDep, mailer: MailerDep):
    user = User(
        email=_normalize(data.email),
        password_hash=hash_password(data.password),
        full_name=data.full_name.strip(),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered") from None
    await _send_verification(mailer, user)
    return user


@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn, response: Response, session: SessionDep):
    user = await session.scalar(
        select(User).where(func.lower(User.email) == _normalize(data.email))
    )
    if not verify_password(data.password, user.password_hash if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    raw = await service.issue_refresh_token(session, user)
    await session.commit()
    _set_refresh_cookie(response, raw)
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/refresh", response_model=TokenOut)
async def refresh(response: Response, session: SessionDep, cookie: RefreshCookie = None):
    if not cookie:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing refresh token")
    try:
        user, new_raw = await service.rotate_refresh_token(session, cookie)
    except service.InvalidRefreshToken:
        # A raised HTTPException would drop our Set-Cookie, so return the 401 directly.
        error = JSONResponse({"detail": "Invalid refresh token"}, status.HTTP_401_UNAUTHORIZED)
        _clear_refresh_cookie(error)
        return error
    _set_refresh_cookie(response, new_raw)
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, session: SessionDep, cookie: RefreshCookie = None):
    if cookie and (family := await service.family_of(session, cookie)):
        await service.revoke_family(session, family)
        await session.commit()
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user


@router.post("/verify-email", response_model=UserOut)
async def verify_email(data: TokenIn, session: SessionDep):
    try:
        payload = decode_token(data.token, "verify")
        user = await session.get(User, uuid.UUID(payload["sub"]))
    except (jwt.InvalidTokenError, KeyError, ValueError):
        user = None
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired link")
    user.is_verified = True
    await session.commit()
    return user


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(user: CurrentUser, mailer: MailerDep):
    if not user.is_verified:
        await _send_verification(mailer, user)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(data: EmailIn, session: SessionDep, mailer: MailerDep):
    # Always 202, whether or not the account exists, to avoid leaking who is registered.
    user = await session.scalar(
        select(User).where(func.lower(User.email) == _normalize(data.email))
    )
    if user:
        token = create_email_token(user, "reset")
        await mailer.send(
            "reset_password",
            user.email,
            {"name": user.full_name, "url": f"{settings.frontend_url}/reset-password?token={token}"},
        )


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(data: ResetPasswordIn, session: SessionDep):
    try:
        payload = decode_token(data.token, "reset")
        user = await session.get(User, uuid.UUID(payload["sub"]))
    except (jwt.InvalidTokenError, KeyError, ValueError):
        user = None
    if user is None or not reset_token_matches(payload, user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired link")

    user.password_hash = hash_password(data.password)
    # Receiving the email proves ownership of the inbox.
    user.is_verified = True
    # Log out every session: whoever knew the old password shouldn't stay signed in.
    await service.revoke_all_for_user(session, user.id)
    await session.commit()
