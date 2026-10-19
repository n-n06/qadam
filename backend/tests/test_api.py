from app.services import pipeline
from app.services.drafting import SegmentIn
from app.services.transcription import TranscriptionResult


def test_seed_matches_mock(client):
    assert [u["name"] for u in client.get("/api/users").json()] == ["Алия", "Ерлан", "Айгерим"]
    assert len(client.get("/api/drafts").json()) == 1
    assert len(client.get("/api/tasks").json()) == 3


def test_pending_draft_is_not_in_backlog(client):  # F6 AC2
    keys = [t["key"] for t in client.get("/api/tasks").json()]
    assert keys == ["QAD-11", "QAD-9", "QAD-7"]


def test_edit_then_approve_moves_draft_to_backlog(client):  # F6 AC1
    draft = client.get("/api/drafts").json()[0]
    r = client.patch(f"/api/drafts/{draft['id']}", json={"title": "Выгрузка отчёта в Excel", "due_text": None})
    assert r.status_code == 200 and r.json()["due_text"] is None

    task = client.post(f"/api/drafts/{draft['id']}/approve").json()
    assert task["key"] == "QAD-12" and task["title"] == "Выгрузка отчёта в Excel"
    assert task["origin_meeting_title"] == "Планирование спринта"
    assert client.get("/api/drafts").json() == []
    assert client.post(f"/api/drafts/{draft['id']}/approve").status_code == 409

    detail = client.get(f"/api/tasks/{task['id']}").json()
    assert detail["events"][0]["text"].startswith("Принято со встречи")


def test_reject_never_reaches_backlog(client):
    draft = client.get("/api/drafts").json()[0]
    assert client.post(f"/api/drafts/{draft['id']}/reject").json()["status"] == "rejected"
    assert len(client.get("/api/tasks").json()) == 3


def test_task_status_change_is_logged(client):
    task = client.get("/api/tasks").json()[0]
    r = client.patch(f"/api/tasks/{task['id']}", json={"status": "done"})
    assert r.json()["status"] == "done"
    events = client.get(f"/api/tasks/{task['id']}").json()["events"]
    assert "В работе → Готово" in events[0]["text"]
    assert events[0]["actor_id"] == 2  # taken from the token, not from the request body


def test_manual_transcript_creates_drafts_without_inventing_fields(client):
    meeting = client.post("/api/meetings", json={"title": "Стендап"}).json()
    r = client.post(f"/api/meetings/{meeting['id']}/transcript", json={"text": "Алия: Нужно обновить документацию."})
    assert r.status_code == 202
    detail = client.get(f"/api/meetings/{meeting['id']}").json()  # background task already ran
    assert detail["status"] == "ready"
    assert detail["segments"][0]["speaker"] == "Алия"
    assert len(detail["drafts"]) == 1
    assert detail["drafts"][0]["assignee_id"] is None and detail["drafts"][0]["due_text"] is None


def test_audio_upload_runs_transcription_then_drafting(client, monkeypatch):
    monkeypatch.setattr(
        pipeline,
        "transcribe_file",
        lambda path: TranscriptionResult([SegmentIn(0, None, "Нужно подготовить релиз.")], 60.0, "ru"),
    )
    meeting = client.post("/api/meetings", json={"title": "Звонок"}).json()
    r = client.post(f"/api/meetings/{meeting['id']}/audio", files={"file": ("call.ogg", b"fake", "audio/ogg")})
    assert r.status_code == 202
    detail = client.get(f"/api/meetings/{meeting['id']}").json()
    assert detail["status"] == "ready" and detail["duration_sec"] == 60 and len(detail["drafts"]) == 1


def test_transcription_failure_is_visible_not_silent(client, monkeypatch):  # F4 AC2
    def boom(path):
        raise RuntimeError("model crashed")

    monkeypatch.setattr(pipeline, "transcribe_file", boom)
    meeting = client.post("/api/meetings", json={"title": "Звонок"}).json()
    client.post(f"/api/meetings/{meeting['id']}/audio", files={"file": ("call.ogg", b"fake", "audio/ogg")})
    detail = client.get(f"/api/meetings/{meeting['id']}").json()
    assert detail["status"] == "failed" and "model crashed" in detail["error"]


def test_call_token_needs_livekit_config(client):
    meeting = client.post("/api/meetings", json={"title": "Звонок"}).json()
    r = client.post(f"/api/meetings/{meeting['id']}/call/token")
    assert r.status_code == 503
