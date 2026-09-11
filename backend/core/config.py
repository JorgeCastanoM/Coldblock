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

    # Microsoft Planner, read via Graph with app-only (client-credentials) auth.
    # Requires an Azure AD app registration with the APPLICATION permissions
    # Tasks.Read.All + User.Read.All and tenant admin consent. Tasks are read
    # per person across every plan, so there are no plan IDs to configure.
    # The client secret has a hard expiry date — when it lapses, the Tasks page
    # says so and carries on with HubSpot alone.
    graph_base_url: str = "https://graph.microsoft.com/v1.0"
    graph_login_url: str = "https://login.microsoftonline.com"
    graph_tenant_id: str = ""
    graph_client_id: str = ""
    graph_client_secret: str = ""
    enable_planner: bool = False

    dashboard_users: list[DashboardUser] = []
    jwt_secret: str = ""
    jwt_expire_minutes: int = 720

    # Fishbowl is only reachable over the office Tailscale tailnet — a publicly
    # deployed backend (Vercel, etc.) has no route to it. Off by default there;
    # local dev on the tailnet should set this true via .env.
    enable_fishbowl: bool = True

    use_mock_data: bool = True
    log_level: str = "INFO"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


settings = Settings()
