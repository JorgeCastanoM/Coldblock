import asyncio
import logging
import time
from datetime import datetime

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from core.config import settings

logger = logging.getLogger(__name__)

# Graph's JSON batch endpoint caps at 20 sub-requests.
_BATCH_SIZE = 20

# Per-person task reads in flight at once. Measured live: 56 people in 0.6s at
# 16, 1.0s at 8, no throttling at either.
_SWEEP_CONCURRENCY = 16

# Planner encodes progress as a percentage rather than a status enum.
_NOT_STARTED, _COMPLETE = 0, 100

# Token-endpoint failures worth translating. The raw AADSTS text is long and
# doesn't say which setting to fix — and an expired secret is a certainty
# eventually, since Azure secrets have a hard expiry date.
_AUTH_ERRORS = {
    7000222: "Azure client secret expired — create a new one under App registrations → "
    "ColdBlock Dashboard – Planner Read → Certificates & secrets, then update GRAPH_CLIENT_SECRET",
    7000215: "Azure client secret is invalid — GRAPH_CLIENT_SECRET must be the secret's Value, not its ID",
    700016: "Azure app not found in this tenant — check GRAPH_CLIENT_ID and GRAPH_TENANT_ID",
    90002: "Azure tenant not found — check GRAPH_TENANT_ID",
}

_MOCK_PLANNER_TASKS = [
    {
        "task_id": "planner:PLAN-TASK-1",
        "source": "planner",
        "name": "Ship CBM demo unit to Santiago",
        "description": "Crate, insure, and book the courier.",
        "status": "in_progress",
        "is_done": False,
        # Planner stores date-only due dates at 10:00 UTC.
        "due_date": "2026-07-22T10:00:00Z",
        "completed_date": None,
        "created_by": {"id": "aad-1", "name": "Sample Planner User", "email": "planner@coldblock.ca"},
        # Planner allows several assignees on one task; HubSpot never does.
        "assigned_to": [
            {"id": "aad-1", "name": "Sample Planner User", "email": "planner@coldblock.ca"},
            {"id": "aad-2", "name": "Second Assignee", "email": "second@coldblock.ca"},
        ],
        "priority": "important",
        "plan": {"id": "PLAN-1", "name": "ColdBlock Team TO DO"},
        "company": None,
        "contact": None,
        "deal": None,
    },
]

# Planner's 0-10 priority scale, per Microsoft's own bucketing. Medium is the
# default every new task gets and Planner's board shows no marker for it, so
# it stays unlabelled here too — otherwise every Planner row would read "Medium".
_PRIORITY_LABELS = [(1, "urgent"), (4, "important"), (7, None), (10, "low")]


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


def _is_transient(exc: BaseException) -> bool:
    """Retry throttling, server errors and dropped connections only. A 4xx is
    an answer — retrying a 404 just triples the wait before the same failure."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return status == 429 or status >= 500
    return False


_retry_transient = retry(
    retry=retry_if_exception(_is_transient),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)


class GraphAuthError(RuntimeError):
    """The client-credentials token exchange failed. The message names the
    setting to fix, and is what the Tasks page shows."""


def _auth_error(response: httpx.Response) -> GraphAuthError:
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    codes = payload.get("error_codes") or []
    message = next((_AUTH_ERRORS[code] for code in codes if code in _AUTH_ERRORS), None)
    if message is None:
        message = f"Azure sign-in failed ({response.status_code} {payload.get('error') or 'unknown error'})"
    logger.error("Graph token request failed: %s (AADSTS codes %s)", message, codes)
    return GraphAuthError(message)


def _parse_graph_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _in_window(
    task: dict, *, next_week: datetime, overdue_since: datetime | None, completed_since: datetime
) -> str | None:
    """The HubSpot search filter groups (hubspot.get_tasks), applied in Python
    because Planner task lists take no $filter.

    Returns "keep"; "overdue_beyond" for an open task due before the window
    (counted, not shown); or None for tasks outside the report entirely —
    completed long ago, or not due until after next week.
    overdue_since=None is the show-everything range: no lower bound.
    """
    if task.get("percentComplete") == _COMPLETE:
        completed = _parse_graph_date(task.get("completedDateTime"))
        return "keep" if completed and completed >= completed_since else None
    due = _parse_graph_date(task.get("dueDateTime"))
    if due is None:
        return "keep"
    if due > next_week:
        return None
    if overdue_since is not None and due < overdue_since:
        return "overdue_beyond"
    return "keep"


def _window_tasks(tasks, **bounds) -> tuple[list[dict], int]:
    kept: list[dict] = []
    overdue_beyond = 0
    for task in tasks:
        verdict = _in_window(task, **bounds)
        if verdict == "keep":
            kept.append(task)
        elif verdict == "overdue_beyond":
            overdue_beyond += 1
    return kept, overdue_beyond


class GraphClient:
    """Microsoft Graph, app-only (client credentials). Covers Planner tasks and
    the directory lookups that turn Azure AD GUIDs into names.

    Named for the system rather than the feature because the same credentials
    and token serve both.
    """

    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    @_retry_transient
    async def _request_token(self, client: httpx.AsyncClient) -> httpx.Response:
        response = await client.post(
            f"{settings.graph_login_url}/{settings.graph_tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": settings.graph_client_id,
                "client_secret": settings.graph_client_secret,
                "scope": "https://graph.microsoft.com/.default",
            },
        )
        # Only throttling/server errors raise (and so retry). A 4xx here is a
        # verdict on the credentials, handed back for _auth_error to explain.
        if response.status_code == 429 or response.status_code >= 500:
            response.raise_for_status()
        return response

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        """Cached in-process for its lifetime. This is not persistence — it's the
        same shape as FishbowlClient's session token and dies with the worker."""
        if self._token and time.monotonic() < self._token_expires_at:
            return self._token
        response = await self._request_token(client)
        if response.status_code != 200:
            raise _auth_error(response)
        payload = response.json()
        self._token = payload["access_token"]
        # Renew a minute early so a request never rides an expiring token.
        self._token_expires_at = time.monotonic() + max(60, int(payload.get("expires_in", 3600)) - 60)
        return self._token

    @_retry_transient
    async def _request(
        self, client: httpx.AsyncClient, method: str, url: str, *, params: dict | None = None, json: dict | None = None
    ) -> dict:
        """Accepts a path or an absolute URL — @odata.nextLink links are absolute."""
        token = await self._access_token(client)
        if not url.startswith("http"):
            url = f"{settings.graph_base_url}{url}"
        response = await client.request(
            method, url, headers={"Authorization": f"Bearer {token}"}, params=params, json=json
        )
        response.raise_for_status()
        return response.json()

    async def _get_all(self, client: httpx.AsyncClient, path: str, params: dict | None = None) -> list[dict]:
        """Every page of a Graph collection. Planner pages at ~400 rows, and a
        busy plan crossed that in live testing."""
        items: list[dict] = []
        url, query = path, params
        while url:
            data = await self._request(client, "GET", url, params=query)
            items.extend(data.get("value", []))
            # The next link already carries the query string.
            url, query = data.get("@odata.nextLink"), None
        return items

    async def _list_users(self, client: httpx.AsyncClient) -> dict[str, dict]:
        """The whole directory in one call — both the list of people to sweep
        and the id → name/email map for assignees and creators."""
        rows = await self._get_all(
            client, "/users", {"$select": "id,displayName,mail,userPrincipalName", "$top": "999"}
        )
        return {
            row["id"]: {"name": row.get("displayName"), "email": row.get("mail") or row.get("userPrincipalName")}
            for row in rows
            if row.get("id")
        }

    async def _user_tasks(self, client: httpx.AsyncClient, user_id: str, gate: asyncio.Semaphore) -> list[dict]:
        async with gate:
            try:
                return await self._get_all(client, f"/users/{user_id}/planner/tasks")
            except httpx.HTTPStatusError as exc:
                # Accounts without Planner (rooms, shared mailboxes, unlicensed
                # users) answer 403/404 — that's "no tasks", not an outage.
                if exc.response.status_code in (403, 404):
                    return []
                raise

    async def _batch_get(self, client: httpx.AsyncClient, urls: list[str]) -> dict[str, tuple[int | None, dict]]:
        """GET many Graph URLs through $batch, 20 per call, chunks in parallel.

        Sub-request failures (including 429s) surface as per-item statuses
        inside a 200 response, so each URL's status is returned for the caller
        to judge — the retry on the outer POST can't see them.
        """

        async def run(chunk: list[str]) -> dict[str, tuple[int | None, dict]]:
            body = {"requests": [{"id": str(index), "method": "GET", "url": url} for index, url in enumerate(chunk)]}
            data = await self._request(client, "POST", "/$batch", json=body)
            answers: dict[str, tuple[int | None, dict]] = {}
            for item in data.get("responses", []):
                try:
                    index = int(item.get("id"))
                except (TypeError, ValueError):
                    continue
                if 0 <= index < len(chunk):
                    answers[chunk[index]] = (item.get("status"), item.get("body") or {})
            return answers

        results: dict[str, tuple[int | None, dict]] = {}
        chunks = await asyncio.gather(*(run(chunk) for chunk in _chunks(urls, _BATCH_SIZE)), return_exceptions=True)
        for answers in chunks:
            if isinstance(answers, BaseException):
                # Plan names and descriptions are decoration: a lost chunk
                # blanks a few of them rather than failing the Planner source.
                logger.warning("Graph $batch chunk failed: %s", answers)
                continue
            results.update(answers)
        return results

    async def get_planner_tasks(
        self, *, next_week: datetime, overdue_since: datetime | None, completed_since: datetime
    ) -> dict:
        """Every person's Planner tasks across every plan, trimmed to the
        report window.

        Read per person (GET /users/{id}/planner/tasks) rather than per plan:
        there's no app-only way to list plans without Group.Read.All, new plans
        show up with no config, and unassigned tasks — nearly half of Planner —
        stay out, since the report is organised by person.
        """
        if settings.use_mock_data:
            return {"tasks": _MOCK_PLANNER_TASKS, "overdue_beyond_window": 0}
        if not settings.enable_planner or not settings.graph_client_secret:
            return {"tasks": [], "overdue_beyond_window": 0}

        async with httpx.AsyncClient(timeout=30) as client:
            # Warm the token first so the fan-out below doesn't race a dozen
            # token requests on a cold start.
            await self._access_token(client)
            users = await self._list_users(client)
            gate = asyncio.Semaphore(_SWEEP_CONCURRENCY)
            per_person = await asyncio.gather(*(self._user_tasks(client, user_id, gate) for user_id in users))

            # A task with two assignees comes back once per person, and every
            # copy carries the full assignments dict — keeping one loses nothing.
            unique = {task["id"]: task for rows in per_person for task in rows if task.get("id")}
            kept, overdue_beyond = _window_tasks(
                unique.values(), next_week=next_week, overdue_since=overdue_since, completed_since=completed_since
            )

            # Only now fetch details, and only for what will be shown — the
            # description N+1 over the full history would be ~700 calls.
            plan_urls = {
                plan_id: f"/planner/plans/{plan_id}?$select=id,title"
                for plan_id in sorted({task["planId"] for task in kept if task.get("planId")})
            }
            detail_urls = {task["id"]: f"/planner/tasks/{task['id']}/details" for task in kept if task.get("hasDescription")}
            answers = await self._batch_get(client, [*plan_urls.values(), *detail_urls.values()])

        plans: dict[str, str | None] = {}
        deleted_plans: set[str] = set()
        for plan_id, url in plan_urls.items():
            status, body = answers.get(url, (None, {}))
            if status == 200:
                plans[plan_id] = body.get("title") or None
            elif status == 404:
                deleted_plans.add(plan_id)

        descriptions: dict[str, str | None] = {}
        for task_id, url in detail_urls.items():
            status, body = answers.get(url, (None, {}))
            if status == 200:
                descriptions[task_id] = (body.get("description") or "").strip() or None

        if deleted_plans:
            # Tasks can outlive their plan's group for a while; nobody can open
            # them in Planner any more, so they don't belong in the report.
            logger.info("Skipped Planner tasks from %d deleted plan(s)", len(deleted_plans))

        return {
            "tasks": [
                _normalize_planner_task(task, descriptions, users, plans)
                for task in kept
                if task.get("planId") not in deleted_plans
            ],
            "overdue_beyond_window": overdue_beyond,
        }


def _person(user_id: str | None, users: dict[str, dict]) -> dict | None:
    if not user_id:
        return None
    resolved = users.get(user_id) or {}
    return {"id": user_id, "name": resolved.get("name"), "email": resolved.get("email")}


def _normalize_planner_task(
    task: dict, descriptions: dict[str, str | None], users: dict[str, dict], plans: dict[str, str | None]
) -> dict:
    percent = task.get("percentComplete")
    if percent == _COMPLETE:
        status = "completed"
    elif percent in (None, _NOT_STARTED):
        status = "not_started"
    else:
        status = "in_progress"

    created_id = ((task.get("createdBy") or {}).get("user") or {}).get("id")
    plan_id = task.get("planId")

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
        # assignments is a DICT keyed by user GUID, not a list.
        "assigned_to": [p for p in (_person(uid, users) for uid in (task.get("assignments") or {})) if p],
        "priority": _priority_label(task.get("priority")),
        "plan": {"id": plan_id, "name": plans.get(plan_id)} if plan_id else None,
        "company": None,
        "contact": None,
        "deal": None,
    }


graph_client = GraphClient()
