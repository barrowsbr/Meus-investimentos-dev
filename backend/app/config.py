import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    google_api_key: str = os.environ.get("GOOGLE_API_KEY", "")
    spreadsheet_id: str = os.environ.get("SPREADSHEET_ID", "")
    gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "")
    frontend_url: str = os.environ.get("FRONTEND_URL", "http://localhost:3000")


settings = Settings()
