"""ORM object -> API model helpers (they add the joined fields the UI needs)."""
from sqlmodel import Session, func, select

from .models import DraftTask, Meeting, Task
from .schemas import DraftOut, MeetingOut, TaskOut


def meeting_out(session: Session, m: Meeting) -> MeetingOut:
    pending = session.exec(
        select(func.count()).select_from(DraftTask).where(DraftTask.meeting_id == m.id, DraftTask.status == "pending")
    ).one()
    return MeetingOut.model_validate(m).model_copy(update={"recording": bool(m.egress_id), "pending_drafts": pending})


def draft_out(session: Session, d: DraftTask) -> DraftOut:
    m = session.get(Meeting, d.meeting_id)
    return DraftOut.model_validate(d).model_copy(
        update={
            "meeting_title": m.title if m else "",
            "meeting_date": m.created_at if m else None,
            "meeting_skipped_note": m.skipped_note if m else "",
        }
    )


def task_out(session: Session, t: Task) -> TaskOut:
    m = session.get(Meeting, t.origin_meeting_id) if t.origin_meeting_id else None
    return TaskOut.model_validate(t).model_copy(
        update={
            "origin_meeting_title": m.title if m else None,
            "origin_meeting_date": m.created_at if m else None,
        }
    )
