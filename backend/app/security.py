"""Authentication: password hashing, JWT access tokens, rotating refresh tokens, FastAPI dependencies.

Flow:
- POST /api/auth/login -> short-lived access JWT in the body + long-lived refresh token in an httpOnly cookie.
- The browser keeps the access token in memory only and sends it as `Authorization: Bearer ...`.
- POST /api/auth/refresh swaps the cookie for a new pair (rotation). Re-using an already rotated
  refresh token revokes every session of that user (token theft detection).
- The role is read from the DB on every request, so a demotion or deactivation applies immediately.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .config import get_settings
from .db import get_session
from .models import RefreshToken, User, utcnow
from .permissions import has_permission

log = logging.getLogger("qadam.auth")

ALGORITHM = "HS256"
REFRESH_COOKIE = "qadam_refresh"
REFRESH_COOKIE_PATH = "/api/auth"

_settings = get_settings()
_jwt_secret = _settings.jwt_secret
if not _jwt_secret:
    _jwt_secret = secrets.token_urlsafe(48)
    log.warning("JWT_SECRET is not set - using a random one; everybody is logged out on restart.")


# ------------------------------------------------------------------ passwords
def _prehash(password: str) -> bytes:
    # bcrypt only looks at the first 72 bytes; SHA-256 first so long / non-ASCII passwords are fully used.
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt(rounds=_settings.bcrypt_rounds)).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(_prehash(password), password_hash.encode())
    except ValueError:
        return False


# Used when the e-mail is unknown, so a login attempt takes the same time either way.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def authenticate(session: Session, email: str, password: str) -> User | None:
    user = session.exec(select(User).where(User.email == email.strip().lower())).first()
    if not user or not user.password_hash:
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, user.password_hash) or not user.is_active:
        return None
    return user


# ------------------------------------------------------------------ brute-force guard
class LoginThrottle:
    """In-memory: N failed logins per (IP, e-mail) within a window -> 429. Per process; fine for one pilot API."""

    def __init__(self, max_failures: int = 5, window_sec: int = 15 * 60):
        self.max_failures, self.window = max_failures, window_sec
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> list[float]:
        now = time.monotonic()
        recent = [t for t in self._failures.get(key, []) if now - t < self.window]
        self._failures[key] = recent
        return recent

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key)) >= self.max_failures

    def fail(self, key: str) -> None:
        with self._lock:
            self._recent(key).append(time.monotonic())

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._failures.clear()
            else:
                self._failures.pop(key, None)


login_throttle = LoginThrottle()


# ------------------------------------------------------------------ tokens
def create_access_token(user: User) -> tuple[str, int]:
    ttl = _settings.access_token_minutes * 60
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "type": "access", "iat": now, "exp": now + timedelta(seconds=ttl)}
    return jwt.encode(payload, _jwt_secret, algorithm=ALGORITHM), ttl


def _sha256(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # SQLite drops tzinfo


def issue_refresh_token(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(48)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_sha256(token),
            expires_at=utcnow() + timedelta(days=_settings.refresh_token_days),
        )
    )
    return token


def rotate_refresh_token(session: Session, token: str) -> tuple[User, str] | None:
    """Validate a refresh token, revoke it and return (user, new token). None if invalid."""
    row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == _sha256(token))).first()
    if not row:
        return None
    if row.revoked_at is not None:
        log.warning("Re-used refresh token for user %s - revoking all sessions", row.user_id)
        revoke_all_sessions(session, row.user_id)
        session.commit()
        return None
    user = session.get(User, row.user_id)
    if _aware(row.expires_at) <= utcnow() or not user or not user.is_active:
        return None
    row.revoked_at = utcnow()
    session.add(row)
    return user, issue_refresh_token(session, user)


def revoke_refresh_token(session: Session, token: str) -> None:
    row = session.exec(select(RefreshToken).where(RefreshToken.token_hash == _sha256(token))).first()
    if row and row.revoked_at is None:
        row.revoked_at = utcnow()
        session.add(row)


def revoke_all_sessions(session: Session, user_id: int) -> None:
    rows = session.exec(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    ).all()
    for row in rows:
        row.revoked_at = utcnow()
        session.add(row)


# ------------------------------------------------------------------ dependencies
_bearer = HTTPBearer(auto_error=False)
_UNAUTHORIZED = HTTPException(401, "Требуется вход", headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise _UNAUTHORIZED
    try:
        payload = jwt.decode(creds.credentials, _jwt_secret, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Сессия истекла", headers={"WWW-Authenticate": "Bearer"})
    except jwt.PyJWTError:
        raise _UNAUTHORIZED
    if payload.get("type") != "access":
        raise _UNAUTHORIZED
    user = session.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise _UNAUTHORIZED
    return user


def require(permission: str):
    """Dependency factory: `user: User = Depends(require("drafts.review"))`."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user.role, permission):
            raise HTTPException(403, "Недостаточно прав")
        return user

    return dependency


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
