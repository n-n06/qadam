"""Authentication and RBAC (F7)."""
import pytest
from conftest import ADMIN, LEAD, MEMBER, PASSWORD, login


# ------------------------------------------------------------------ authentication
@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/users"),
        ("get", "/api/meetings"),
        ("get", "/api/drafts"),
        ("get", "/api/tasks"),
        ("post", "/api/tasks"),
        ("get", "/api/auth/me"),
    ],
)
def test_api_requires_login(anon, method, path):
    assert getattr(anon, method)(path).status_code == 401


def test_health_is_public(anon):
    assert anon.get("/api/health").status_code == 200


def test_login_returns_profile_with_permissions(anon):
    r = anon.post("/api/auth/login", json={"email": "ERLAN@qadam.kz", "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["name"] == "Ерлан" and body["user"]["role"] == "lead"
    assert "drafts.review" in body["user"]["permissions"] and "users.manage" not in body["user"]["permissions"]
    cookie = r.headers["set-cookie"].lower()
    assert "qadam_refresh=" in cookie and "httponly" in cookie and "samesite=strict" in cookie


def test_wrong_password_and_unknown_user_look_the_same(anon):
    a = anon.post("/api/auth/login", json={"email": LEAD, "password": "nope-nope"})
    b = anon.post("/api/auth/login", json={"email": "ghost@qadam.kz", "password": "nope-nope"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_login_is_throttled_after_repeated_failures(anon):
    for _ in range(5):
        assert anon.post("/api/auth/login", json={"email": LEAD, "password": "wrong-pass"}).status_code == 401
    assert anon.post("/api/auth/login", json={"email": LEAD, "password": PASSWORD}).status_code == 429


def test_garbage_and_tampered_tokens_are_rejected(anon):
    assert anon.get("/api/tasks", headers={"Authorization": "Bearer garbage"}).status_code == 401
    token = login(anon, MEMBER)["Authorization"]
    assert anon.get("/api/tasks", headers={"Authorization": token[:-2] + "xx"}).status_code == 401


def test_refresh_rotates_and_detects_reuse(anon):
    login(anon, MEMBER)
    old_cookie = anon.cookies.get("qadam_refresh")

    r = anon.post("/api/auth/refresh")
    assert r.status_code == 200 and r.json()["user"]["email"] == MEMBER
    assert anon.cookies.get("qadam_refresh") != old_cookie

    # Replaying the old (already rotated) cookie = likely theft -> every session of the user is revoked.
    anon.cookies.clear()
    anon.cookies.set("qadam_refresh", old_cookie, path="/api/auth")
    assert anon.post("/api/auth/refresh").status_code == 401


def test_logout_revokes_refresh_token(anon):
    login(anon, MEMBER)
    cookie = anon.cookies.get("qadam_refresh")
    assert anon.post("/api/auth/logout").status_code == 204
    anon.cookies.set("qadam_refresh", cookie, path="/api/auth")
    assert anon.post("/api/auth/refresh").status_code == 401


def test_change_password(anon):
    headers = login(anon, MEMBER)
    bad = anon.post("/api/auth/password", headers=headers, json={"current_password": "wrong", "new_password": "new-password-1"})
    assert bad.status_code == 400
    ok = anon.post("/api/auth/password", headers=headers, json={"current_password": PASSWORD, "new_password": "new-password-1"})
    assert ok.status_code == 200
    assert anon.post("/api/auth/login", json={"email": MEMBER, "password": PASSWORD}).status_code == 401
    login(anon, MEMBER, "new-password-1")


# ------------------------------------------------------------------ RBAC
def test_member_cannot_review_drafts(anon):
    headers = login(anon, MEMBER)
    draft = anon.get("/api/drafts", headers=headers).json()[0]
    assert anon.post(f"/api/drafts/{draft['id']}/approve", headers=headers).status_code == 403
    assert anon.post(f"/api/drafts/{draft['id']}/reject", headers=headers).status_code == 403
    assert anon.patch(f"/api/drafts/{draft['id']}", headers=headers, json={"title": "x"}).status_code == 403


def test_member_edits_only_own_tasks(anon):
    headers = login(anon, MEMBER)  # Айгерим: QAD-7 is hers, QAD-9 is Алия's
    tasks = {t["key"]: t for t in anon.get("/api/tasks", headers=headers).json()}
    assert anon.patch(f"/api/tasks/{tasks['QAD-7']['id']}", headers=headers, json={"status": "todo"}).status_code == 200
    assert anon.patch(f"/api/tasks/{tasks['QAD-9']['id']}", headers=headers, json={"status": "done"}).status_code == 403

    mine = anon.post("/api/tasks", headers=headers, json={"title": "Своя задача"}).json()
    assert mine["created_by_id"] == 3
    assert anon.patch(f"/api/tasks/{mine['id']}", headers=headers, json={"status": "done"}).status_code == 200


def test_lead_edits_any_task(client):
    task = next(t for t in client.get("/api/tasks").json() if t["key"] == "QAD-7")
    assert client.patch(f"/api/tasks/{task['id']}", json={"status": "todo"}).status_code == 200


def test_member_manages_only_own_meetings(anon):
    headers = login(anon, MEMBER)
    seeded = anon.get("/api/meetings", headers=headers).json()[0]  # created by the lead
    r = anon.post(f"/api/meetings/{seeded['id']}/transcript", headers=headers, json={"text": "Нужно что-то сделать."})
    assert r.status_code == 403

    own = anon.post("/api/meetings", headers=headers, json={"title": "Моя встреча"}).json()
    r = anon.post(f"/api/meetings/{own['id']}/transcript", headers=headers, json={"text": "Нужно что-то сделать."})
    assert r.status_code == 202


def test_only_admin_manages_users(anon):
    lead = login(anon, LEAD)
    assert anon.get("/api/users/admin", headers=lead).status_code == 403
    new = {"name": "Дана", "email": "dana@qadam.kz", "password": "dana-password", "role": "member"}
    assert anon.post("/api/users", headers=lead, json=new).status_code == 403

    admin = login(anon, ADMIN)
    created = anon.post("/api/users", headers=admin, json=new)
    assert created.status_code == 201 and created.json()["email"] == "dana@qadam.kz"
    assert anon.post("/api/users", headers=admin, json=new).status_code == 409
    login(anon, "dana@qadam.kz", "dana-password")


def test_public_user_list_hides_emails(client):
    assert all("email" not in u for u in client.get("/api/users").json())


def test_deactivated_user_is_locked_out_immediately(anon):
    member = login(anon, MEMBER)
    admin = login(anon, ADMIN)
    assert anon.patch("/api/users/3", headers=admin, json={"is_active": False}).status_code == 200
    assert anon.get("/api/tasks", headers=member).status_code == 401
    assert anon.post("/api/auth/login", json={"email": MEMBER, "password": PASSWORD}).status_code == 401


def test_role_change_applies_without_relogin(anon):
    member = login(anon, MEMBER)
    draft = anon.get("/api/drafts", headers=member).json()[0]
    admin = login(anon, ADMIN)
    anon.patch("/api/users/3", headers=admin, json={"role": "lead"})
    assert anon.post(f"/api/drafts/{draft['id']}/reject", headers=member).status_code == 200


def test_last_admin_cannot_be_removed(anon):
    admin = login(anon, ADMIN)
    assert anon.patch("/api/users/1", headers=admin, json={"role": "member"}).status_code == 409
    assert anon.patch("/api/users/1", headers=admin, json={"is_active": False}).status_code == 409
