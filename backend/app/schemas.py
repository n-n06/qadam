from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field

TaskStatus = Literal["todo", "in_progress", "done"]


class UserIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: Literal["lead", "member"] = "member"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    role: str


class SegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    start_sec: float
    speaker: Optional[str]
    text: str


class DraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    meeting_id: int
    title: str
    description: str
    acceptance_criteria: list[str]
    assignee_id: Optional[int]
    due_text: Optional[str]
    source_quote: str
    status: str
    reviewer_id: Optional[int]
    meeting_title: str = ""
    meeting_date: Optional[datetime] = None
    meeting_skipped_note: str = ""


class DraftPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    acceptance_criteria: Optional[list[str]] = None
    assignee_id: Optional[int] = None
    due_text: Optional[str] = None


class ReviewAction(BaseModel):
    user_id: Optional[int] = None


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    created_at: datetime
    status: str
    summary: str
    skipped_note: str
    error: str
    duration_sec: Optional[int]
    room_name: str
    recording: bool = False
    pending_drafts: int = 0


class MeetingDetail(MeetingOut):
    segments: list[SegmentOut] = []
    drafts: list[DraftOut] = []


class TranscriptIn(BaseModel):
    text: str = Field(min_length=1)


class TokenRequest(BaseModel):
    user_id: int


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    assignee_id: Optional[int] = None
    due_text: Optional[str] = None
    user_id: Optional[int] = None


class TaskPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    assignee_id: Optional[int] = None
    due_text: Optional[str] = None
    user_id: Optional[int] = None  # who made the change (for activity history)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    actor_id: Optional[int]
    text: str
    created_at: datetime


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: int
    title: str
    description: str
    acceptance_criteria: list[str]
    assignee_id: Optional[int]
    due_text: Optional[str]
    status: str
    origin_meeting_id: Optional[int]
    origin_quote: str
    created_at: datetime
    origin_meeting_title: Optional[str] = None
    origin_meeting_date: Optional[datetime] = None

    @computed_field
    @property
    def key(self) -> str:
        return f"QAD-{self.number}"


class TaskDetail(TaskOut):
    events: list[EventOut] = []
