"""Demo data that reproduces the screens of qadam-mock.html (disable with SEED_DEMO=false)."""
from datetime import timedelta

import logging

from sqlmodel import Session, select

from .config import get_settings
from .db import engine
from .models import DraftTask, Meeting, Segment, Task, TaskEvent, User, utcnow
from .security import hash_password

log = logging.getLogger("qadam.seed")

# name -> (e-mail, role). Login with DEMO_PASSWORD (default "qadam-demo").
DEMO_USERS = {
    "Алия": ("aliya@qadam.kz", "admin"),
    "Ерлан": ("erlan@qadam.kz", "lead"),
    "Айгерим": ("aigerim@qadam.kz", "member"),
}

TRANSCRIPT = [
    (4, "Алия", "Давайте в этот спринт добавим выгрузку недельного отчёта в Excel."),
    (6, "Ерлан", "Хорошо. Пусть сделает Айгерим, срок — пятница."),
    (7, "Айгерим", "Готово, когда руководитель скачивает файл. Внутри дата, статус и исполнитель."),
    (11, "Ерлан", "И когда-нибудь надо подумать про уведомления. Пока без решения."),
]


def _demo_user(name: str, password_hash: str) -> User:
    email, role = DEMO_USERS[name]
    return User(name=name, email=email, role=role, password_hash=password_hash)


def _backfill_demo_credentials(s: Session, password_hash: str) -> None:
    """A DB created before auth existed has the demo users without e-mail/password: give them the demo login."""
    for user in s.exec(select(User).where(User.email.is_(None))).all():
        if user.name in DEMO_USERS:
            user.email, user.role = DEMO_USERS[user.name]
            user.password_hash = password_hash
            user.is_active = True
            s.add(user)
    s.commit()


def ensure_admin() -> None:
    """Bootstrap the first admin from ADMIN_EMAIL / ADMIN_PASSWORD (for real deployments with SEED_DEMO=false)."""
    settings = get_settings()
    if not (settings.admin_email and settings.admin_password):
        return
    email = settings.admin_email.strip().lower()
    with Session(engine) as s:
        if s.exec(select(User).where(User.email == email)).first():
            return
        s.add(User(name=settings.admin_name, email=email, role="admin", password_hash=hash_password(settings.admin_password)))
        s.commit()
        log.info("Created admin %s", email)


def seed_demo() -> None:
    password_hash = hash_password(get_settings().demo_password)
    with Session(engine) as s:
        if s.exec(select(User)).first():
            _backfill_demo_credentials(s, password_hash)
            return

        aliya, erlan, aigerim = (_demo_user(n, password_hash) for n in ("Алия", "Ерлан", "Айгерим"))
        s.add_all([aliya, erlan, aigerim])
        s.flush()

        meeting = Meeting(
            title="Планирование спринта",
            created_by_id=erlan.id,
            status="ready",
            created_at=utcnow() - timedelta(days=1),
            duration_sec=24 * 60,
            summary=(
                "Команда решила добавить выгрузку недельного отчёта. Исполнитель — Айгерим, срок — пятница. "
                "Файл Excel: дата, статус, исполнитель."
            ),
            skipped_note="Не создано — уведомления. На встрече не было решения.",
        )
        s.add(meeting)
        s.flush()
        meeting.room_name = f"meeting-{meeting.id}"
        s.add(meeting)

        for start, speaker, text in TRANSCRIPT:
            s.add(Segment(meeting_id=meeting.id, start_sec=start, speaker=speaker, text=text))

        # The AI proposal waiting for a human decision (mock screen 2).
        s.add(
            DraftTask(
                meeting_id=meeting.id,
                title="Выгрузка недельного отчёта",
                description="Добавить экспорт отчёта в Excel для руководителя.",
                acceptance_criteria=["Руководитель скачивает файл Excel.", "В файле есть дата, статус и исполнитель."],
                assignee_id=aigerim.id,
                due_text="пятница",
                source_quote="Пусть сделает Айгерим, срок — пятница.",
                reviewer_id=erlan.id,
            )
        )

        # Existing backlog items (mock screens 3-4).
        for number, title, owner, status in [
            (7, "Обновить текст пустого отчёта", aigerim, "done"),
            (9, "Подключить выгрузку CSV", aliya, "in_progress"),
            (11, "Исправить фильтр по дате", erlan, "in_progress"),
        ]:
            task = Task(number=number, title=title, assignee_id=owner.id, status=status, created_by_id=erlan.id)
            s.add(task)
            s.flush()
            s.add(TaskEvent(task_id=task.id, text="Задача создана вручную"))

        s.commit()
