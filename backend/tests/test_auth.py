from fastapi.testclient import TestClient

from core.config import settings
from main import app

client = TestClient(app)


def test_login_rejects_wrong_password():
    username = settings.dashboard_users[0].username
    response = client.post("/auth/login", json={"username": username, "password": "wrong"})
    assert response.status_code == 401


def test_login_rejects_unknown_username():
    response = client.post("/auth/login", json={"username": "nobody", "password": "wrong"})
    assert response.status_code == 401


def test_login_issues_token_and_dashboard_requires_it():
    user = settings.dashboard_users[0]
    response = client.post("/auth/login", json={"username": user.username, "password": user.password})
    assert response.status_code == 200
    token = response.json()["access_token"]

    unauthorized = client.get("/dashboard/summary")
    assert unauthorized.status_code in (401, 403)

    authorized = client.get("/dashboard/summary", headers={"Authorization": f"Bearer {token}"})
    assert authorized.status_code == 200


def test_second_user_can_also_log_in():
    user = settings.dashboard_users[1]
    response = client.post("/auth/login", json={"username": user.username, "password": user.password})
    assert response.status_code == 200
