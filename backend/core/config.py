from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class DashboardUser(BaseModel):
    username: str
    password: str


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    fishbowl_base_url: str = "http://100.x.x.x:2456"
    fishbowl_username: str = ""
    fishbowl_password: str = ""
    fishbowl_app_name: str = "ColdBlockDashboard"
    fishbowl_app_id: int = 1
    fishbowl_app_description: str = "ColdBlock Intelligence Dashboard"
    fishbowl_app_key: str = "coldblock-dashboard-key"

    hubspot_base_url: str = "https://api.hubapi.com"
    hubspot_api_token: str = ""

    dashboard_users: list[DashboardUser] = []
    jwt_secret: str = ""
    jwt_expire_minutes: int = 720

    use_mock_data: bool = True
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
