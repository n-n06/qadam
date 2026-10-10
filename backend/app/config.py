from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # storage
    database_url: str = "sqlite:///./data/qadam.db"
    recordings_dir: str = "./data/recordings"
    cors_origins: str = "http://localhost:5173"
    seed_demo: bool = True

    # speech-to-text (faster-whisper)
    whisper_model: str = "small"  # tiny | base | small | medium | large-v3
    whisper_device: str = "cpu"  # cpu | cuda
    whisper_compute_type: str = "int8"  # int8 on CPU, float16 on GPU
    whisper_language: str = ""  # "" = auto-detect, or "ru", "kk", "en"...

    # NLP step: "placeholder" (regex stub) | "none". A real LLM drafter plugs in here.
    drafter: str = "placeholder"

    # LiveKit (audio calls). url = what the BROWSER connects to, api_url = what the BACKEND calls.
    livekit_url: str = "ws://localhost:7880"
    livekit_api_url: str = "http://localhost:7880"
    livekit_api_key: str = ""
    livekit_api_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
