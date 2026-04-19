from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    database_url: str = "postgresql+asyncpg://app:app@localhost:5432/ragflow_legal"
    ragflow_base_url: str = "http://localhost:9380"
    ragflow_api_key: str = ""
    ragflow_chat_id: str = ""
    cors_origins: str = "http://127.0.0.1:3000,http://localhost:3000"

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
