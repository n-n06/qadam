"""Team directory (everyone) and user administration (admin only)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from ..db import get_session
from ..models import User
from ..schemas import UserAdminOut, UserCreate, UserOut, UserUpdate
from ..security import hash_password, require, revoke_all_sessions

router = APIRouter(prefix="/api/users", tags=["users"])


def _email_taken(session: Session, email: str, except_id: int | None = None) -> bool:
    query = select(User.id).where(User.email == email)
    if except_id is not None:
        query = query.where(User.id != except_id)
    return session.exec(query).first() is not None


def _active_admins(session: Session) -> int:
    return session.exec(
        select(func.count()).select_from(User).where(User.role == "admin", User.is_active == True)  # noqa: E712
    ).one()


@router.get("", response_model=list[UserOut])
def list_users(session: Session = Depends(get_session), _: User = Depends(require("users.read"))):
    """Everybody needs the team list (assignee pickers, avatars). E-mails are not exposed here."""
    return session.exec(select(User).order_by(User.id)).all()


@router.get("/admin", response_model=list[UserAdminOut])
def list_users_admin(session: Session = Depends(get_session), _: User = Depends(require("users.manage"))):
    return session.exec(select(User).order_by(User.id)).all()


@router.post("", response_model=UserAdminOut, status_code=201)
def create_user(body: UserCreate, session: Session = Depends(get_session), _: User = Depends(require("users.manage"))):
    email = body.email.lower()
    if _email_taken(session, email):
        raise HTTPException(409, "Пользователь с такой почтой уже есть")
    user = User(name=body.name.strip(), email=email, role=body.role, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserAdminOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require("users.manage")),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    data = body.model_dump(exclude_unset=True)

    loses_admin = user.role == "admin" and user.is_active and (
        data.get("role", "admin") != "admin" or data.get("is_active") is False
    )
    if loses_admin and _active_admins(session) <= 1:
        raise HTTPException(409, "Нельзя убрать последнего администратора")
    if user.id == admin.id and (data.get("is_active") is False or data.get("role", "admin") != "admin"):
        raise HTTPException(409, "Нельзя понизить или отключить самого себя")

    if data.get("name"):
        user.name = data["name"].strip()
    if data.get("email"):
        email = data["email"].lower()
        if _email_taken(session, email, except_id=user.id):
            raise HTTPException(409, "Пользователь с такой почтой уже есть")
        user.email = email
    if data.get("role"):
        user.role = data["role"]
    if data.get("is_active") is not None:
        user.is_active = data["is_active"]
        if not user.is_active:
            revoke_all_sessions(session, user.id)
    if data.get("password"):
        user.password_hash = hash_password(data["password"])
        revoke_all_sessions(session, user.id)

    session.add(user)
    session.commit()
    session.refresh(user)
    return user
