import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_refresh_token, new_refresh_token
from app.models import RefreshToken, User


class InvalidRefreshToken(Exception):
    pass


async def issue_refresh_token(
    session: AsyncSession, user: User, family_id: uuid.UUID | None = None
) -> str:
    raw, token_hash = new_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            family_id=family_id or uuid.uuid4(),
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    return raw


async def revoke_family(session: AsyncSession, family_id: uuid.UUID) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def revoke_all_for_user(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def rotate_refresh_token(session: AsyncSession, raw: str) -> tuple[User, str]:
    """Swap a valid refresh token for a new one in the same family.

    Commits on its own: when reuse is detected, the family revocation must be
    persisted even though the request itself fails.
    """
    # FOR UPDATE serialises concurrent refreshes of the same token (e.g. two tabs),
    # so only one of them wins instead of both minting new tokens.
    token = await session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw))
        .with_for_update()
    )
    if token is None:
        raise InvalidRefreshToken

    now = datetime.now(UTC)
    if token.revoked_at is not None:
        # An already-rotated token came back: someone else holds a copy.
        await revoke_family(session, token.family_id)
        await session.commit()
        raise InvalidRefreshToken
    if token.expires_at <= now:
        raise InvalidRefreshToken

    token.revoked_at = now
    user = await session.get_one(User, token.user_id)
    new_raw = await issue_refresh_token(session, user, token.family_id)
    await session.commit()
    return user, new_raw


async def family_of(session: AsyncSession, raw: str) -> uuid.UUID | None:
    return await session.scalar(
        select(RefreshToken.family_id).where(
            RefreshToken.token_hash == hash_refresh_token(raw)
        )
    )
