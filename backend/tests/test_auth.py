from fastapi.testclient import TestClient

from core.config import settings
from main import app

client = TestClient(app)


def test_login_rejects_wrong_password():
    response = client.post("/auth/login", json={"password": "wrong"})
    assert response.status_code == 401


def test_login_issues_token_and_dashboard_requires_it():
    response = client.post("/auth/login", json={"password": settings.dashboard_access_password})
    assert response.status_code == 200
    token = response.json()["access_token"]

    unauthorized = client.get("/dashboard/summary")
    assert unauthorized.status_code in (401, 403)

    authorized = client.get("/dashboard/summary", headers={"Authorization": f"Bearer {token}"})
    assert authorized.status_code == 200
