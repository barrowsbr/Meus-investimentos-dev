from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    google_api_key: str = ""
    spreadsheet_id: str = ""
    gemini_api_key: str = ""
    frontend_url: str = "http://localhost:3000"


settings = Settings()
