"""Backlog / board tasks (F1) with activity history (F3)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from ..db import get_session
from ..models import Task, TaskEvent, User
from ..permissions import has_permission
from ..schemas import EventOut, TaskCreate, TaskDetail, TaskOut, TaskPatch
from ..security import require
from ..serializers import task_out

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

STATUS_LABEL = {"todo": "К выполнению", "in_progress": "В работе", "done": "Готово"}


def _get_or_404(session: Session, task_id: int) -> Task:
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Задача не найдена")
    return task


def _person(session: Session, user_id) -> str:
    user = session.get(User, user_id) if user_id else None
    return user.name if user else "не указан"


def _check_can_edit(user: User, task: Task) -> None:
    """Leads/admins edit any task; members only tasks assigned to them or created by them."""
    if has_permission(user.role, "tasks.update"):
        return
    if has_permission(user.role, "tasks.update_own") and user.id in (task.assignee_id, task.created_by_id):
        return
    raise HTTPException(403, "Менять эту задачу может исполнитель, автор или руководитель")


def _check_user(session: Session, user_id) -> None:
    if user_id is not None and not session.get(User, user_id):
        raise HTTPException(422, "Исполнитель не найден")


@router.get("", response_model=list[TaskOut])
def list_tasks(session: Session = Depends(get_session), _: User = Depends(require("tasks.read"))):
    tasks = session.exec(select(Task).order_by(Task.number.desc())).all()
    return [task_out(session, t) for t in tasks]


@router.post("", response_model=TaskOut, status_code=201)
def create_task(body: TaskCreate, session: Session = Depends(get_session), user: User = Depends(require("tasks.create"))):
    """Manual creation - the pilot fallback when the AI pipeline is unavailable."""
    _check_user(session, body.assignee_id)
    number = (session.exec(select(func.max(Task.number))).one() or 0) + 1
    task = Task(
        number=number,
        title=body.title.strip(),
        description=body.description.strip(),
        assignee_id=body.assignee_id,
        due_text=(body.due_text or "").strip() or None,
        created_by_id=user.id,
    )
    session.add(task)
    session.flush()
    session.add(TaskEvent(task_id=task.id, actor_id=user.id, text="Задача создана вручную"))
    session.commit()
    session.refresh(task)
    return task_out(session, task)


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(task_id: int, session: Session = Depends(get_session), _: User = Depends(require("tasks.read"))):
    task = _get_or_404(session, task_id)
    events = session.exec(select(TaskEvent).where(TaskEvent.task_id == task_id).order_by(TaskEvent.id.desc())).all()
    return TaskDetail(**task_out(session, task).model_dump(), events=[EventOut.model_validate(e) for e in events])


@router.patch("/{task_id}", response_model=TaskOut)
def patch_task(
    task_id: int,
    body: TaskPatch,
    session: Session = Depends(get_session),
    user: User = Depends(require("tasks.read")),
):
    task = _get_or_404(session, task_id)
    _check_can_edit(user, task)
    data = body.model_dump(exclude_unset=True)
    actor_id = user.id
    notes: list[str] = []

    if "status" in data and data["status"] and data["status"] != task.status:
        notes.append(f"Статус: {STATUS_LABEL[task.status]} → {STATUS_LABEL[data['status']]}")
        task.status = data["status"]
    if "assignee_id" in data and data["assignee_id"] != task.assignee_id:
        _check_user(session, data["assignee_id"])
        notes.append(f"Исполнитель: {_person(session, task.assignee_id)} → {_person(session, data['assignee_id'])}")
        task.assignee_id = data["assignee_id"]
    if "due_text" in data:
        new_due = (data["due_text"] or "").strip() or None
        if new_due != task.due_text:
            notes.append(f"Срок: {task.due_text or 'не указан'} → {new_due or 'не указан'}")
            task.due_text = new_due
    if data.get("title") and data["title"].strip() != task.title:
        notes.append("Название изменено")
        task.title = data["title"].strip()
    if "description" in data and data["description"] is not None and data["description"] != task.description:
        notes.append("Описание изменено")
        task.description = data["description"]

    session.add(task)
    for text in notes:
        session.add(TaskEvent(task_id=task.id, actor_id=actor_id, text=text))
    session.commit()
    session.refresh(task)
    return task_out(session, task)
