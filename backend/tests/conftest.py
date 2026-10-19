import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="qadam-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["RECORDINGS_DIR"] = f"{_tmp}/recordings"
os.environ["SEED_DEMO"] = "true"
os.environ["DEMO_PASSWORD"] = "test-password"
os.environ["JWT_SECRET"] = "test-secret-test-secret-test-secret-0123"
os.environ["LIVEKIT_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = ""
os.environ["BCRYPT_ROUNDS"] = "4"  # fast hashing in tests

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app.db import engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.security import login_throttle  # noqa: E402
from app.seed import seed_demo  # noqa: E402

PASSWORD = "test-password"
ADMIN, LEAD, MEMBER = "aliya@qadam.kz", "erlan@qadam.kz", "aigerim@qadam.kz"


def login(client: TestClient, email: str, password: str = PASSWORD) -> dict:
    """Log in and return the Authorization header (the refresh cookie lands in the client's jar)."""
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def anon():
    """Fresh, seeded database for every test; client without credentials."""
    SQLModel.metadata.drop_all(engine)
    init_db()
    seed_demo()
    login_throttle.reset()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def client(anon):
    """Client logged in as the lead (Ерлан) - the default reviewer."""
    anon.headers.update(login(anon, LEAD))
    return anon
