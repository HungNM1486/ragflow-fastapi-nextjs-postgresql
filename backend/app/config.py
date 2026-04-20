from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_ENV_PATH = _BACKEND_DIR / ".env"
_settings_kwargs: dict[str, object] = {"extra": "ignore"}
if _ENV_PATH.is_file():
    _settings_kwargs["env_file"] = _ENV_PATH
    _settings_kwargs["env_file_encoding"] = "utf-8"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(**_settings_kwargs)

    database_url: str = (
        "postgresql+asyncpg://app:app_dev_change_me@127.0.0.1:5433/ragflow_legal"
    )
    ragflow_base_url: str = "http://localhost:9380"
    ragflow_api_key: str = ""
    ragflow_chat_id: str = ""
    cors_origins: str = "http://127.0.0.1:3000,http://localhost:3000"

    session_cookie_name: str = "rl_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 7

    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("ragflow_api_key", "ragflow_chat_id", mode="before")
    @classmethod
    def strip_str(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()


settings = Settings()
