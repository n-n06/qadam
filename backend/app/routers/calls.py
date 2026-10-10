import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlmodel import Session, select

from ..config import get_settings
from ..db import get_session
from ..models import Meeting, User, utcnow
from ..schemas import MeetingOut, TokenRequest
from ..serializers import meeting_out
from ..services import livekit_service as lk
from ..services.pipeline import run_pipeline
from .meetings import get_meeting_or_404

log = logging.getLogger("qadam.calls")
router = APIRouter(prefix="/api", tags=["calls"])

NO_RECORDING = "Запись звонка не велась. Загрузите аудио встречи или вставьте текст вручную."


def _require_livekit() -> None:
    if not lk.configured():
        raise HTTPException(503, "Сервер звонков не настроен (LIVEKIT_API_KEY / LIVEKIT_API_SECRET)")


@router.post("/meetings/{meeting_id}/call/token")
def call_token(meeting_id: int, body: TokenRequest, session: Session = Depends(get_session)):
    """Join token for the browser. The first join flips the meeting to `live`."""
    _require_livekit()
    meeting = get_meeting_or_404(session, meeting_id)
    user = session.get(User, body.user_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    if meeting.status not in ("scheduled", "live"):
        raise HTTPException(409, "Звонок уже завершён")
    if meeting.status == "scheduled":
        meeting.status, meeting.started_at = "live", utcnow()
        session.add(meeting)
        session.commit()
    token = lk.make_token(meeting.room_name, identity=f"user-{user.id}", name=user.name)
    return {"url": get_settings().livekit_url, "token": token, "room": meeting.room_name}


@router.post("/meetings/{meeting_id}/call/end", response_model=MeetingOut)
async def end_call(meeting_id: int, session: Session = Depends(get_session)):
    """End the call for everybody. LiveKit finalises the recording and then calls our webhook."""
    meeting = get_meeting_or_404(session, meeting_id)
    if meeting.status != "live":
        return meeting_out(session, meeting)

    meeting.ended_at = utcnow()
    if meeting.started_at:
        meeting.duration_sec = int((meeting.ended_at - meeting.started_at).total_seconds())

    if not meeting.egress_id:
        # Nothing was recorded -> tell the user instead of silently losing the meeting (F4 AC2).
        meeting.status, meeting.error = "failed", NO_RECORDING
        session.add(meeting)
        session.commit()
    else:
        meeting.status = "processing"
        session.add(meeting)
        session.commit()
        try:
            await lk.end_room(meeting.room_name)
        except Exception as exc:  # noqa: BLE001
            log.exception("Could not close room %s", meeting.room_name)
            meeting.status, meeting.error = "failed", f"Не удалось завершить запись: {exc}"[:500]
            session.add(meeting)
            session.commit()
    return meeting_out(session, meeting)


@router.post("/livekit/webhook")
async def livekit_webhook(request: Request, background: BackgroundTasks, session: Session = Depends(get_session)):
    """LiveKit -> backend events. Signature is verified with the API secret."""
    body = (await request.body()).decode()
    try:
        event = lk.parse_webhook(body, request.headers.get("Authorization", ""))
    except Exception as exc:  # noqa: BLE001
        log.warning("Rejected LiveKit webhook: %s", exc)
        raise HTTPException(401, "Bad webhook signature")

    if event.event == "room_started":
        meeting = session.exec(select(Meeting).where(Meeting.room_name == event.room.name)).first()
        if meeting and not meeting.egress_id and meeting.status in ("scheduled", "live"):
            try:
                meeting.egress_id = await lk.start_recording(meeting.room_name)
                meeting.status = "live"
                meeting.started_at = meeting.started_at or utcnow()
                session.add(meeting)
                session.commit()
            except Exception:  # noqa: BLE001
                log.exception("Could not start recording for %s", meeting.room_name)

    elif event.event == "egress_ended":
        info = event.egress_info
        meeting = session.exec(select(Meeting).where(Meeting.room_name == info.room_name)).first()
        if meeting and meeting.status in ("live", "processing"):
            filename = info.file_results[0].filename if info.file_results else ""
            path = Path(get_settings().recordings_dir) / Path(filename).name if filename else None
            meeting.ended_at = meeting.ended_at or utcnow()
            if info.error or not path or not path.exists():
                meeting.status = "failed"
                meeting.error = f"Запись не сохранена{': ' + info.error if info.error else ''}. {NO_RECORDING}"[:500]
                session.add(meeting)
                session.commit()
            else:
                meeting.audio_path = str(path)
                meeting.status = "processing"
                session.add(meeting)
                session.commit()
                background.add_task(run_pipeline, meeting.id, True)
    return {"ok": True}
