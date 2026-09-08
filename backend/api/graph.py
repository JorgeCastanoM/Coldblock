import asyncio
import time

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.config import settings

# Graph's JSON batch endpoint caps at 20 sub-requests.
_BATCH_SIZE = 20

# Planner encodes progress as a percentage rather than a status enum.
_NOT_STARTED, _COMPLETE = 0, 100

_MOCK_PLANNER_TASKS = [
    {
        "task_id": "planner:PLAN-TASK-1",
        "source": "planner",
        "name": "Ship CBM demo unit to Santiago",
        "description": "Crate, insure, and book the courier.",
        "status": "in_progress",
        "is_done": False,
        "due_date": "2026-07-22T00:00:00Z",
        "completed_date": None,
        "created_by": {"id": "aad-1", "name": "Sample Planner User", "email": "planner@coldblock.ca"},
        # Planner allows several assignees on one task; HubSpot never does.
        "assigned_to": [
            {"id": "aad-1", "name": "Sample Planner User", "email": "planner@coldblock.ca"},
            {"id": "aad-2", "name": "Second Assignee", "email": "second@coldblock.ca"},
        ],
        "priority": "important",
        "company": None,
        "contact": None,
        "deal": None,
    },
]

# Planner's 0-10 priority scale, per Microsoft's own bucketing.
_PRIORITY_LABELS = [(1, "urgent"), (4, "important"), (7, "medium"), (10, "low")]


def _priority_label(value) -> str | None:
    if value is None:
        return None
    try:
        priority = int(value)
    except (TypeError, ValueError):
        return None
    for ceiling, label in _PRIORITY_LABELS:
        if priority <= ceiling:
            return label
    return "low"


def _chunks(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


class GraphClient:
    """Microsoft Graph, app-only (client credentials). Covers Planner tasks and
    the /users lookups needed to turn Azure AD GUIDs into names.

    Named for the system rather than the feature because the same credentials
    and token serve both.
    """

    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        """Cached in-process for its lifetime. This is not persistence — it's the
        same shape as FishbowlClient's session token and dies with the worker."""
        if self._token and time.monotonic() < self._token_expires_at:
            return self._token
        response = await client.post(
            f"{settings.graph_login_url}/{settings.graph_tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": settings.graph_client_id,
                "client_secret": settings.graph_client_secret,
                "scope": "https://graph.microsoft.com/.default",
            },
        )
        response.raise_for_status()
        payload = response.json()
        self._token = payload["access_token"]
        # Renew a minute early so a request never rides an expiring token.
        self._token_expires_at = time.monotonic() + max(60, int(payload.get("expires_in", 3600)) - 60)
        return self._token

    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TransportError)),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
    )
    async def _get(self, client: httpx.AsyncClient, path: str, params: dict | None = None) -> dict:
        token = await self._access_token(client)
        response = await client.get(
            f"{settings.graph_base_url}{path}", headers={"Authorization": f"Bearer {token}"}, params=params
        )
        response.raise_for_status()
        return response.json()

    async def _list_plan_tasks(self, client: httpx.AsyncClient, plan_id: str) -> list[dict]:
        data = await self._get(client, f"/planner/plans/{plan_id}/tasks")
        return data.get("value", [])

    async def _batch_descriptions(self, client: httpx.AsyncClient, task_ids: list[str]) -> dict[str, str | None]:
        """Descriptions live on a separate plannerTaskDetails entity, so this is
        an unavoidable N+1. Callers pass only tasks whose hasDescription is true,
        and requests go 20-at-a-time through Graph's $batch endpoint.

        Sub-request failures (including 429s) surface as per-item statuses inside
        a 200 response, so they're inspected individually — the retry decorator
        on the outer call can't see them.
        """
        descriptions: dict[str, str | None] = {}
        token = await self._access_token(client)
        for chunk in _chunks(task_ids, _BATCH_SIZE):
            body = {
                "requests": [
                    {"id": str(index), "method": "GET", "url": f"/planner/tasks/{task_id}/details"}
                    for index, task_id in enumerate(chunk)
                ]
            }
            response = await client.post(
                f"{settings.graph_base_url}/$batch",
                headers={"Authorization": f"Bearer {token}"},
                json=body,
            )
            response.raise_for_status()
            for item in response.json().get("responses", []):
                index = int(item.get("id", -1))
                if index < 0 or index >= len(chunk):
                    continue
                if item.get("status") != 200:
                    continue  # Leave it unset; the row renders without a description.
                descriptions[chunk[index]] = (item.get("body") or {}).get("description") or None
        return descriptions

    async def _resolve_users(self, client: httpx.AsyncClient, user_ids: set[str]) -> dict[str, dict]:
        results: dict[str, dict] = {}
        for user_id in user_ids:
            try:
                data = await self._get(client, f"/users/{user_id}", params={"$select": "id,displayName,mail,userPrincipalName"})
            except httpx.HTTPStatusError:
                # Deleted users, and tasks created by an application rather than
                # a person, both 404 here. Leave unresolved rather than failing.
                continue
            results[user_id] = {
                "name": data.get("displayName"),
                "email": data.get("mail") or data.get("userPrincipalName"),
            }
        return results

    async def get_planner_tasks(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_PLANNER_TASKS
        if not settings.enable_planner or not settings.graph_client_secret or not settings.planner_plan_ids:
            return []

        async with httpx.AsyncClient(timeout=30) as client:
            plans = await asyncio.gather(
                *(self._list_plan_tasks(client, plan_id) for plan_id in settings.planner_plan_ids)
            )
            raw_tasks = [task for plan_tasks in plans for task in plan_tasks]

            described = [task["id"] for task in raw_tasks if task.get("hasDescription")]
            user_ids = set()
            for task in raw_tasks:
                created = ((task.get("createdBy") or {}).get("user") or {}).get("id")
                if created:
                    user_ids.add(created)
                # assignments is a DICT keyed by user GUID, not a list.
                user_ids.update((task.get("assignments") or {}).keys())

            descriptions, users = await asyncio.gather(
                self._batch_descriptions(client, described),
                self._resolve_users(client, user_ids),
            )

        return [_normalize_planner_task(task, descriptions, users) for task in raw_tasks]


def _person(user_id: str | None, users: dict[str, dict]) -> dict | None:
    if not user_id:
        return None
    resolved = users.get(user_id) or {}
    return {"id": user_id, "name": resolved.get("name"), "email": resolved.get("email")}


def _normalize_planner_task(task: dict, descriptions: dict[str, str | None], users: dict[str, dict]) -> dict:
    percent = task.get("percentComplete")
    if percent == _COMPLETE:
        status = "completed"
    elif percent in (None, _NOT_STARTED):
        status = "not_started"
    else:
        status = "in_progress"

    created_id = ((task.get("createdBy") or {}).get("user") or {}).get("id")

    return {
        "task_id": f"planner:{task.get('id')}",
        "source": "planner",
        "name": task.get("title") or None,
        "description": descriptions.get(task.get("id")),
        "status": status,
        "is_done": status == "completed",
        "due_date": task.get("dueDateTime"),
        "completed_date": task.get("completedDateTime"),
        "created_by": _person(created_id, users),
        "assigned_to": [p for p in (_person(uid, users) for uid in (task.get("assignments") or {})) if p],
        "priority": _priority_label(task.get("priority")),
        "company": None,
        "contact": None,
        "deal": None,
    }


graph_client = GraphClient()
