import re
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, delete, select

from ..config import get_settings
from ..db import get_session
from ..models import DraftTask, Meeting, Segment, User
from ..schemas import (
    MeetingCreate,
    MeetingDetail,
    MeetingOut,
    SegmentOut,
    TranscriptIn,
    UserIn,
    UserOut,
)
from ..serializers import draft_out, meeting_out
from ..services.pipeline import run_pipeline

users_router = APIRouter(prefix="/api/users", tags=["users"])
router = APIRouter(prefix="/api/meetings", tags=["meetings"])

AUDIO_EXT = {".ogg", ".opus", ".mp3", ".wav", ".m4a", ".mp4", ".webm", ".flac", ".aac", ".mkv"}


# ------------------------------------------------------------------ users
@users_router.get("", response_model=list[UserOut])
def list_users(session: Session = Depends(get_session)):
    return session.exec(select(User).order_by(User.id)).all()


@users_router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserIn, session: Session = Depends(get_session)):
    user = User(name=body.name.strip(), role=body.role)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# ------------------------------------------------------------------ meetings
def get_meeting_or_404(session: Session, meeting_id: int) -> Meeting:
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "Встреча не найдена")
    return meeting


@router.get("", response_model=list[MeetingOut])
def list_meetings(session: Session = Depends(get_session)):
    meetings = session.exec(select(Meeting).order_by(Meeting.created_at.desc(), Meeting.id.desc())).all()
    return [meeting_out(session, m) for m in meetings]


@router.post("", response_model=MeetingOut, status_code=201)
def create_meeting(body: MeetingCreate, session: Session = Depends(get_session)):
    meeting = Meeting(title=body.title.strip())
    session.add(meeting)
    session.flush()
    meeting.room_name = f"meeting-{meeting.id}"
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return meeting_out(session, meeting)


@router.get("/{meeting_id}", response_model=MeetingDetail)
def get_meeting(meeting_id: int, session: Session = Depends(get_session)):
    meeting = get_meeting_or_404(session, meeting_id)
    segments = session.exec(
        select(Segment).where(Segment.meeting_id == meeting_id).order_by(Segment.start_sec, Segment.id)
    ).all()
    drafts = session.exec(select(DraftTask).where(DraftTask.meeting_id == meeting_id).order_by(DraftTask.id)).all()
    base = meeting_out(session, meeting)
    return MeetingDetail(
        **base.model_dump(),
        segments=[SegmentOut.model_validate(s) for s in segments],
        drafts=[draft_out(session, d) for d in drafts],
    )


@router.post("/{meeting_id}/audio", response_model=MeetingOut, status_code=202)
def upload_audio(
    meeting_id: int,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    """Fallback / test path: upload a recording instead of (or in addition to) a live call."""
    meeting = get_meeting_or_404(session, meeting_id)
    if meeting.status in ("live", "processing"):
        raise HTTPException(409, "Встреча сейчас обрабатывается или идёт звонок")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in AUDIO_EXT:
        raise HTTPException(422, "Нужен аудио- или видеофайл: " + ", ".join(sorted(AUDIO_EXT)))

    target_dir = Path(get_settings().recordings_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"upload-{meeting_id}-{uuid.uuid4().hex[:8]}{ext}"
    with target.open("wb") as out:
        while chunk := file.file.read(1024 * 1024):
            out.write(chunk)

    meeting.audio_path = str(target)
    meeting.status, meeting.error = "processing", ""
    session.add(meeting)
    session.commit()
    background.add_task(run_pipeline, meeting_id, True)
    return meeting_out(session, meeting)


_LINE = re.compile(r"^\s*([^:\n]{1,40}):\s+(.+)$")


@router.post("/{meeting_id}/transcript", response_model=MeetingOut, status_code=202)
def upload_transcript(
    meeting_id: int,
    body: TranscriptIn,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Manual transcript (F4 AC2 fallback). One utterance per line, optionally 'Name: text'."""
    meeting = get_meeting_or_404(session, meeting_id)
    if meeting.status in ("live", "processing"):
        raise HTTPException(409, "Встреча сейчас обрабатывается или идёт звонок")
    lines = [ln.strip() for ln in body.text.splitlines() if ln.strip()]
    if not lines:
        raise HTTPException(422, "Текст пустой")

    session.exec(delete(Segment).where(Segment.meeting_id == meeting_id))
    for i, line in enumerate(lines):
        m = _LINE.match(line)
        speaker, text = (m.group(1).strip(), m.group(2).strip()) if m else (None, line)
        session.add(Segment(meeting_id=meeting_id, start_sec=i, speaker=speaker, text=text))
    meeting.status, meeting.error = "processing", ""
    session.add(meeting)
    session.commit()
    background.add_task(run_pipeline, meeting_id, False)
    return meeting_out(session, meeting)


@router.post("/{meeting_id}/reprocess", response_model=MeetingOut, status_code=202)
def reprocess(meeting_id: int, background: BackgroundTasks, session: Session = Depends(get_session)):
    """Re-run the NLP step on the stored transcript (e.g. after swapping the drafter)."""
    meeting = get_meeting_or_404(session, meeting_id)
    if meeting.status in ("live", "processing"):
        raise HTTPException(409, "Встреча сейчас обрабатывается или идёт звонок")
    has_text = session.exec(select(Segment.id).where(Segment.meeting_id == meeting_id)).first()
    if not has_text:
        raise HTTPException(409, "Нет транскрипта — загрузите запись или текст")
    meeting.status = "processing"
    session.add(meeting)
    session.commit()
    background.add_task(run_pipeline, meeting_id, False)
    return meeting_out(session, meeting)
