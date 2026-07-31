from unittest.mock import AsyncMock, patch

from core.config import settings
from fastapi.testclient import TestClient

from main import app
from services.data_engine import FINISHED_SKUS

client = TestClient(app)


def _auth_headers() -> dict:
    user = settings.dashboard_users[0]
    login = client.post("/auth/login", json={"username": user.username, "password": user.password})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_serials_rejects_unknown_sku():
    response = client.get("/dashboard/serials/NOT-A-FINISHED-SKU", headers=_auth_headers())
    assert response.status_code == 400


def test_serials_returns_list_for_finished_sku():
    fake = [{"serial_number": "CBS-1", "location": "Main", "qty": 0, "committed": False}]
    with (
        patch("routers.dashboard.fishbowl_client.get_serial_numbers", new=AsyncMock(return_value=fake)),
        patch("routers.dashboard.fishbowl_client.logout", new=AsyncMock(return_value=None)),
    ):
        response = client.get("/dashboard/serials/L3CBS001", headers=_auth_headers())

    assert response.status_code == 200
    payload = response.json()
    assert payload["sku"] == "L3CBS001"
    assert payload["serials"] == fake
    assert "L3CBS001" in FINISHED_SKUS


def test_serials_unavailable_when_fishbowl_disabled():
    # A public deployment with no Tailscale route to Fishbowl must fail fast here
    # instead of hanging for a minute against an unreachable host.
    with patch.object(settings, "enable_fishbowl", False):
        response = client.get("/dashboard/serials/L3CBS001", headers=_auth_headers())
    assert response.status_code == 503
