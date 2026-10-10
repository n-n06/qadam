import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="qadam-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["RECORDINGS_DIR"] = f"{_tmp}/recordings"
os.environ["SEED_DEMO"] = "true"
os.environ["LIVEKIT_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app.db import engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_demo  # noqa: E402


@pytest.fixture()
def client():
    """Fresh, seeded database for every test."""
    SQLModel.metadata.drop_all(engine)
    init_db()
    seed_demo()
    with TestClient(app) as c:
        yield c
