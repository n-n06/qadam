"""Login / session endpoints. See security.py for the token model."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Session

from ..config import get_settings
from ..db import get_session
from ..models import User
from ..permissions import permissions_for
from ..schemas import LoginIn, MeOut, PasswordChange, TokenOut, UserAdminOut
from ..security import (
    REFRESH_COOKIE,
    REFRESH_COOKIE_PATH,
    authenticate,
    client_ip,
    create_access_token,
    get_current_user,
    hash_password,
    issue_refresh_token,
    login_throttle,
    revoke_all_sessions,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def me_out(user: User) -> MeOut:
    profile = UserAdminOut.model_validate(user).model_dump()
    return MeOut(**profile, permissions=sorted(permissions_for(user.role)))


def _set_refresh_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=s.refresh_token_days * 24 * 3600,
        httponly=True,
        secure=s.cookie_secure,
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


def _session_response(session: Session, response: Response, user: User) -> TokenOut:
    refresh = issue_refresh_token(session, user)
    session.commit()
    _set_refresh_cookie(response, refresh)
    access, ttl = create_access_token(user)
    return TokenOut(access_token=access, expires_in=ttl, user=me_out(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, response: Response, session: Session = Depends(get_session)):
    key = f"{client_ip(request)}|{body.email.lower()}"
    if login_throttle.blocked(key):
        raise HTTPException(429, "Слишком много попыток входа. Попробуйте через 15 минут.")
    user = authenticate(session, body.email, body.password)
    if not user:
        login_throttle.fail(key)
        raise HTTPException(401, "Неверная почта или пароль")
    login_throttle.reset(key)
    return _session_response(session, response, user)


@router.post("/refresh", response_model=TokenOut)
def refresh(request: Request, response: Response, session: Session = Depends(get_session)):
    token = request.cookies.get(REFRESH_COOKIE)
    rotated = rotate_refresh_token(session, token) if token else None
    if not rotated:
        _clear_refresh_cookie(response)
        raise HTTPException(401, "Сессия истекла, войдите снова")
    user, new_token = rotated
    session.commit()
    _set_refresh_cookie(response, new_token)
    access, ttl = create_access_token(user)
    return TokenOut(access_token=access, expires_in=ttl, user=me_out(user))


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, session: Session = Depends(get_session)):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        revoke_refresh_token(session, token)
        session.commit()
    _clear_refresh_cookie(response)
    response.status_code = 204
    return response


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return me_out(user)


@router.post("/password", response_model=TokenOut)
def change_password(
    body: PasswordChange,
    response: Response,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Change own password. Logs out every other session and starts a fresh one here."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Текущий пароль указан неверно")
    user.password_hash = hash_password(body.new_password)
    session.add(user)
    revoke_all_sessions(session, user.id)
    return _session_response(session, response, user)
