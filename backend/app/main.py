import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routers import auth, calls, drafts, meetings, tasks, users
from .seed import ensure_admin, seed_demo
from .services import livekit_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    Path(settings.recordings_dir).mkdir(parents=True, exist_ok=True)
    if settings.seed_demo:
        seed_demo()
    ensure_admin()
    yield


app = FastAPI(title="Qadam API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,  # the refresh-token cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(meetings.router)
app.include_router(calls.router)
app.include_router(drafts.router)
app.include_router(tasks.router)


@app.get("/api/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "livekit": livekit_service.configured(),
        "whisper_model": settings.whisper_model,
        "drafter": settings.drafter,
    }
