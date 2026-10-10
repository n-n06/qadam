"""Demo data that reproduces the screens of qadam-mock.html (disable with SEED_DEMO=false)."""
from datetime import timedelta

from sqlmodel import Session, select

from .db import engine
from .models import DraftTask, Meeting, Segment, Task, TaskEvent, User, utcnow

TRANSCRIPT = [
    (4, "Алия", "Давайте в этот спринт добавим выгрузку недельного отчёта в Excel."),
    (6, "Ерлан", "Хорошо. Пусть сделает Айгерим, срок — пятница."),
    (7, "Айгерим", "Готово, когда руководитель скачивает файл. Внутри дата, статус и исполнитель."),
    (11, "Ерлан", "И когда-нибудь надо подумать про уведомления. Пока без решения."),
]


def seed_demo() -> None:
    with Session(engine) as s:
        if s.exec(select(User)).first():
            return

        aliya, erlan, aigerim = (User(name="Алия"), User(name="Ерлан", role="lead"), User(name="Айгерим"))
        s.add_all([aliya, erlan, aigerim])
        s.flush()

        meeting = Meeting(
            title="Планирование спринта",
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
            task = Task(number=number, title=title, assignee_id=owner.id, status=status)
            s.add(task)
            s.flush()
            s.add(TaskEvent(task_id=task.id, text="Задача создана вручную"))

        s.commit()
