import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from pwdlib import PasswordHash

from app.core.config import settings
from app.models import User

password_hasher = PasswordHash.recommended()  # argon2id

# Hash compared against when the email doesn't exist, so a login for an unknown
# account takes as long as one with a wrong password (no timing-based enumeration).
_DUMMY_HASH = password_hasher.hash("not-a-real-password")

EmailPurpose = Literal["verify", "reset"]


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    return password_hasher.verify(password, password_hash or _DUMMY_HASH) and (
        password_hash is not None
    )


def _now() -> datetime:
    return datetime.now(UTC)


def _encode(claims: dict, ttl: timedelta) -> str:
    now = _now()
    payload = {**claims, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: str) -> dict:
    """Raises jwt.InvalidTokenError on bad signature, expiry or wrong type."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def create_access_token(user: User) -> str:
    return _encode(
        {"sub": str(user.id), "role": user.role.value, "type": "access"},
        timedelta(minutes=settings.access_token_ttl_minutes),
    )


def _password_fingerprint(user: User) -> str:
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


def create_email_token(user: User, purpose: EmailPurpose) -> str:
    claims = {"sub": str(user.id), "type": purpose}
    if purpose == "reset":
        # Binding the token to the current password hash makes it single-use:
        # once the password changes, the fingerprint no longer matches.
        claims["pwd"] = _password_fingerprint(user)
    return _encode(claims, timedelta(hours=settings.email_token_ttl_hours))


def reset_token_matches(payload: dict, user: User) -> bool:
    return secrets.compare_digest(payload.get("pwd", ""), _password_fingerprint(user))


def new_refresh_token() -> tuple[str, str]:
    """Returns (raw token for the cookie, sha256 hash for the database)."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
