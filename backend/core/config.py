from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    fishbowl_base_url: str = "http://100.x.x.x:2456"
    fishbowl_username: str = ""
    fishbowl_password: str = ""

    hubspot_base_url: str = "https://api.hubapi.com"
    hubspot_api_token: str = ""

    dashboard_access_password: str = "changeme"
    dashboard_access_token: str = "changeme-token"

    use_mock_data: bool = True
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
