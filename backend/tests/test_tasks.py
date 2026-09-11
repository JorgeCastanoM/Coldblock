import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from api.graph import (
    GraphAuthError,
    GraphClient,
    _auth_error,
    _in_window,
    _is_transient,
    _normalize_planner_task,
    _priority_label,
    _window_tasks,
    graph_client,
)
from api.hubspot import _normalize_task, _strip_html, _task_related
from core.config import settings
from services import tasks as tasks_service
from services.tasks import (
    _assign_person_keys,
    _bucket_for,
    _build_people,
    _local_today,
    _parse,
    build_tasks_report,
)

_OWNERS_BY_ID = {"555": {"name": "Sierra Quon", "email": "squon@coldblock.ca"}}
_OWNERS_BY_USER_ID = {"25974760": {"name": "Kathy Moffatt", "email": "kmoffatt@coldblock.ca"}}


def _task(**props) -> dict:
    return {"id": "1", "properties": props}


# --- HubSpot normalization -------------------------------------------------


def test_normalize_task_maps_fields_and_resolves_both_id_spaces():
    result = _normalize_task(
        _task(
            hs_task_subject="Follow up",
            hs_task_body="<p>Call them <b>back</b></p>",
            hs_task_status="NOT_STARTED",
            hs_timestamp="2026-07-20T13:00:00Z",
            hubspot_owner_id="555",
            hs_created_by_user_id="25974760",
        ),
        _OWNERS_BY_ID,
        _OWNERS_BY_USER_ID,
    )

    assert result["task_id"] == "hubspot:1"
    assert result["source"] == "hubspot"
    assert result["name"] == "Follow up"
    assert result["description"] == "Call them back"
    assert result["status"] == "not_started"
    assert result["is_done"] is False
    # Assignee resolves via owner.id, creator via owner.userId — different spaces.
    assert result["assigned_to"] == [{"id": "555", "name": "Sierra Quon", "email": "squon@coldblock.ca"}]
    assert result["created_by"] == {"id": "25974760", "name": "Kathy Moffatt", "email": "kmoffatt@coldblock.ca"}
    assert result["company"] is None
    assert result["contact"] is None
    assert result["deal"] is None


def test_normalize_task_attaches_related_records():
    related = {
        "company": {"id": "C1", "name": "Acme Corp"},
        "contact": {"id": "P1", "name": "Giel Eussen"},
        "deal": {"id": "D1", "name": "Acme Q3", "amount": 15000.0, "currency": "USD"},
    }
    result = _normalize_task(_task(hs_task_subject="Follow up"), {}, {}, related)
    assert result["company"] == related["company"]
    assert result["contact"] == related["contact"]
    assert result["deal"] == related["deal"]


def test_task_related_picks_first_named_and_falls_back_to_contact_company():
    related = _task_related(
        "1",
        {"1": ["10"]},
        {"1": []},
        {"1": ["20"]},
        {"10": {"firstname": "Giel", "lastname": "Eussen", "company": "Acme Corp"}},
        {},
        {"20": {"dealname": "Acme Q3", "amount": "15000", "deal_currency_code": "USD"}},
    )
    assert related["contact"] == {"id": "10", "name": "Giel Eussen"}
    assert related["company"] == {"id": None, "name": "Acme Corp"}
    assert related["deal"] == {"id": "20", "name": "Acme Q3", "amount": 15000.0, "currency": "USD"}


def test_normalize_task_deferred_is_not_done():
    # DEFERRED is an open task someone pushed out — it must stay in the
    # overdue/upcoming buckets rather than being counted as complete.
    result = _normalize_task(_task(hs_task_status="DEFERRED"), {}, {})
    assert result["status"] == "deferred"
    assert result["is_done"] is False


def test_normalize_task_completed_sets_is_done():
    result = _normalize_task(_task(hs_task_status="COMPLETED"), {}, {})
    assert result["is_done"] is True


def test_normalize_task_unresolved_creator_keeps_raw_id():
    # Verified live: some creator ids match no owner record at all.
    result = _normalize_task(_task(hs_created_by_user_id="45578187"), {}, {})
    assert result["created_by"] == {"id": "45578187", "name": None, "email": None}


def test_normalize_task_with_no_assignee_is_empty_list():
    result = _normalize_task(_task(hs_task_subject="Orphan"), {}, {})
    assert result["assigned_to"] == []
    assert result["created_by"] is None


def test_strip_html_flattens_markup_and_entities():
    assert _strip_html("<p>Ring &amp; email</p><p>Then log it</p>") == "Ring & email Then log it"
    assert _strip_html("") is None
    assert _strip_html(None) is None


# --- Planner normalization -------------------------------------------------


def test_normalize_planner_task_reads_assignments_dict():
    # assignments is a dict keyed by user GUID, not a list — iterating it as a
    # list would silently yield zero assignees.
    users = {"aad-1": {"name": "Ana", "email": "ana@coldblock.ca"}, "aad-2": {"name": "Bo", "email": "bo@coldblock.ca"}}
    task = {
        "id": "T1",
        "planId": "P1",
        "title": "Ship demo unit",
        "percentComplete": 50,
        "dueDateTime": "2026-07-22T10:00:00Z",
        "createdBy": {"user": {"id": "aad-1"}},
        "assignments": {"aad-1": {}, "aad-2": {}},
    }

    result = _normalize_planner_task(task, {"T1": "Crate it"}, users, {"P1": "ColdBlock Team TO DO"})

    assert result["task_id"] == "planner:T1"
    assert result["status"] == "in_progress"
    assert result["description"] == "Crate it"
    assert [p["name"] for p in result["assigned_to"]] == ["Ana", "Bo"]
    assert result["plan"] == {"id": "P1", "name": "ColdBlock Team TO DO"}


def test_normalize_planner_task_plan_name_may_be_unknown():
    # A plan whose title lookup failed still shows its tasks — just unnamed.
    assert _normalize_planner_task({"id": "T", "planId": "P9"}, {}, {}, {})["plan"] == {"id": "P9", "name": None}
    assert _normalize_planner_task({"id": "T"}, {}, {}, {})["plan"] is None


@pytest.mark.parametrize(
    "percent,expected",
    [(0, "not_started"), (None, "not_started"), (50, "in_progress"), (99, "in_progress"), (100, "completed")],
)
def test_normalize_planner_task_percent_complete_mapping(percent, expected):
    result = _normalize_planner_task({"id": "T", "percentComplete": percent}, {}, {}, {})
    assert result["status"] == expected
    assert result["is_done"] is (expected == "completed")


def test_normalize_planner_task_created_by_application_has_no_user():
    # Teams/Flow-created tasks populate createdBy.application with no user.
    result = _normalize_planner_task({"id": "T", "createdBy": {"application": {"id": "x"}}}, {}, {}, {})
    assert result["created_by"] is None


def test_priority_label_buckets():
    assert _priority_label(1) == "urgent"
    assert _priority_label(3) == "important"
    # Medium is Planner's default and its board shows no marker for it.
    assert _priority_label(5) is None
    assert _priority_label(9) == "low"
    assert _priority_label(None) is None


# --- Graph client plumbing -------------------------------------------------


def _status_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://graph.microsoft.com/v1.0/users")
    return httpx.HTTPStatusError("boom", request=request, response=httpx.Response(code, request=request))


def test_is_transient_retries_throttling_and_server_errors_only():
    assert _is_transient(_status_error(429))
    assert _is_transient(_status_error(503))
    assert _is_transient(httpx.ConnectError("down"))
    # A 4xx is an answer — retrying a deleted user's 404 only delays the same result.
    assert not _is_transient(_status_error(404))
    assert not _is_transient(_status_error(403))
    assert not _is_transient(ValueError("nope"))


def test_auth_error_names_the_expired_secret():
    error = _auth_error(httpx.Response(401, json={"error": "invalid_client", "error_codes": [7000222]}))
    assert isinstance(error, GraphAuthError)
    assert "expired" in str(error)
    assert "GRAPH_CLIENT_SECRET" in str(error)


def test_auth_error_falls_back_to_status_and_code_name():
    error = _auth_error(httpx.Response(400, json={"error": "unauthorized_client", "error_codes": [1]}))
    assert "400" in str(error)
    assert "unauthorized_client" in str(error)


# --- Planner report window -------------------------------------------------

_NOW = datetime(2026, 7, 15, 18, 0, tzinfo=timezone.utc)
_TODAY = _local_today(_NOW)
_NEXT_WEEK = _TODAY + timedelta(days=7)
_WINDOW = {
    "next_week": _NEXT_WEEK,
    "overdue_since": _TODAY - timedelta(days=90),
    "completed_since": _TODAY - timedelta(days=30),
}


def _planner_date(day: datetime) -> str:
    # Planner stores every date-only due date at 10:00 UTC (594/594 live).
    return day.strftime("%Y-%m-%dT10:00:00Z")


def _open(due_in_days: int | None) -> dict:
    due = None if due_in_days is None else _planner_date(_TODAY + timedelta(days=due_in_days))
    return {"id": "T", "percentComplete": 0, "dueDateTime": due}


def _done(days_ago: int) -> dict:
    return {"id": "T", "percentComplete": 100, "completedDateTime": (_NOW - timedelta(days=days_ago)).isoformat()}


def test_window_keeps_recent_overdue_upcoming_and_undated():
    assert _in_window(_open(-10), **_WINDOW) == "keep"
    assert _in_window(_open(0), **_WINDOW) == "keep"
    # "Next 7 days" is today plus six — the same edge _bucket_for draws.
    assert _in_window(_open(6), **_WINDOW) == "keep"
    assert _in_window(_open(7), **_WINDOW) is None
    # No due date can't be overdue or upcoming — kept so it isn't invisible.
    assert _in_window(_open(None), **_WINDOW) == "keep"


def test_window_counts_old_overdue_and_drops_later():
    assert _in_window(_open(-120), **_WINDOW) == "overdue_beyond"
    assert _in_window(_open(20), **_WINDOW) is None


def test_window_keeps_only_recently_completed():
    assert _in_window(_done(5), **_WINDOW) == "keep"
    assert _in_window(_done(40), **_WINDOW) is None


def test_window_everything_range_has_no_lower_bound():
    assert _in_window(_open(-400), **{**_WINDOW, "overdue_since": None}) == "keep"


def test_window_tasks_splits_shown_from_counted():
    kept, beyond = _window_tasks([_open(-3), _open(-200), _open(-300), _open(30), _done(90)], **_WINDOW)
    assert len(kept) == 1
    assert beyond == 2


@pytest.mark.asyncio
async def test_get_planner_tasks_sweeps_people_dedupes_and_windows(monkeypatch):
    monkeypatch.setattr(settings, "use_mock_data", False)
    monkeypatch.setattr(settings, "enable_planner", True)
    monkeypatch.setattr(settings, "graph_client_secret", "not-a-real-secret")

    shared = {
        "id": "T1",
        "planId": "P1",
        "title": "Shared",
        "percentComplete": 0,
        "dueDateTime": _planner_date(_TODAY - timedelta(days=5)),
        "assignments": {"u1": {}, "u2": {}},
        "hasDescription": True,
    }
    ancient = {**shared, "id": "T2", "dueDateTime": _planner_date(_TODAY - timedelta(days=200)), "assignments": {"u1": {}}}
    orphaned = {**shared, "id": "T3", "planId": "P404", "hasDescription": False, "assignments": {"u2": {}}}
    rows = {"u1": [shared, ancient], "u2": [shared, orphaned]}
    answers = {
        "/planner/plans/P1?$select=id,title": (200, {"title": "ColdBlock Team TO DO"}),
        "/planner/plans/P404?$select=id,title": (404, {}),
        "/planner/tasks/T1/details": (200, {"description": "  Crate it\n"}),
    }

    async def fake_token(self, client):
        return "token"

    async def fake_users(self, client):
        return {"u1": {"name": "Ana Lopez", "email": "ana@coldblock.ca"}, "u2": {"name": "Bo Chen", "email": "bo@coldblock.ca"}}

    async def fake_user_tasks(self, client, user_id, gate):
        return rows[user_id]

    async def fake_batch(self, client, urls):
        return {url: answers[url] for url in urls if url in answers}

    monkeypatch.setattr(GraphClient, "_access_token", fake_token)
    monkeypatch.setattr(GraphClient, "_list_users", fake_users)
    monkeypatch.setattr(GraphClient, "_user_tasks", fake_user_tasks)
    monkeypatch.setattr(GraphClient, "_batch_get", fake_batch)

    result = await GraphClient().get_planner_tasks(**_WINDOW)

    # T1 came back once per assignee but is one task; T2 is past the 90-day
    # window (counted, not shown); T3's plan was deleted.
    assert [task["task_id"] for task in result["tasks"]] == ["planner:T1"]
    assert result["overdue_beyond_window"] == 1
    task = result["tasks"][0]
    assert [person["name"] for person in task["assigned_to"]] == ["Ana Lopez", "Bo Chen"]
    assert task["plan"] == {"id": "P1", "name": "ColdBlock Team TO DO"}
    assert task["description"] == "Crate it"


# --- Bucketing -------------------------------------------------------------


def _bucket(**task) -> str:
    return _bucket_for(task, _TODAY, _NEXT_WEEK)


def test_bucket_done_wins_regardless_of_due_date():
    assert _bucket(is_done=True, due_date="2020-01-01T00:00:00Z") == "done"


def test_bucket_overdue_and_upcoming():
    assert _bucket(is_done=False, due_date="2026-07-01T00:00:00Z") == "overdue"
    assert _bucket(is_done=False, due_date="2026-07-18T00:00:00Z") == "due_next_week"
    assert _bucket(is_done=False, due_date="2026-09-01T00:00:00Z") == "later"


def test_bucket_due_today_is_upcoming_not_overdue():
    # Off-by-one worth pinning: a task due today still has the day to run.
    due_today = (_TODAY + timedelta(hours=12)).isoformat()
    assert _bucket(is_done=False, due_date=due_today) == "due_next_week"


def test_bucket_planner_date_only_due_dates_land_on_the_local_day():
    # Planner writes date-only due dates as 10:00 UTC. Against the local
    # (UTC-5) day boundary, "due today" must stay upcoming, not overdue.
    assert _bucket(is_done=False, due_date=_planner_date(_TODAY)) == "due_next_week"
    assert _bucket(is_done=False, due_date=_planner_date(_TODAY - timedelta(days=1))) == "overdue"


def test_bucket_no_due_date_gets_its_own_bucket():
    # Without this it would match none of the three buckets and disappear.
    assert _bucket(is_done=False, due_date=None) == "no_due_date"


def test_parse_accepts_iso_and_epoch_millis():
    assert _parse("2026-07-20T13:00:00Z").year == 2026
    assert _parse(1_753_000_000_000).year == 2025
    assert _parse("1753000000000").year == 2025
    assert _parse(None) is None
    assert _parse("not a date") is None


# --- People roster ---------------------------------------------------------


def test_build_people_merges_across_sources_by_email():
    tasks = [
        {"source": "hubspot", "assigned_to": [{"id": "1", "name": "Ana", "email": "Ana@coldblock.ca"}]},
        {"source": "planner", "assigned_to": [{"id": "aad-1", "name": "Ana", "email": "ana@coldblock.ca"}]},
    ]
    people = _build_people(tasks)
    assert len(people) == 1
    assert people[0]["task_count"] == 2
    assert sorted(people[0]["sources"]) == ["hubspot", "planner"]


def test_build_people_keeps_unresolved_person_separate():
    tasks = [
        {"source": "hubspot", "assigned_to": [{"id": "999", "name": None, "email": None}]},
        {"source": "hubspot", "assigned_to": [{"id": "1", "name": "Ana", "email": "ana@coldblock.ca"}]},
    ]
    assert len(_build_people(tasks)) == 2


def test_build_people_ignores_unassigned_tasks():
    assert _build_people([{"source": "hubspot", "assigned_to": []}]) == []


def test_assign_person_keys_joins_one_person_across_different_emails():
    # Verified live: the same person under a different address in each system.
    tasks = [
        {"source": "planner", "assigned_to": [{"id": "aad-1", "name": "Stephen Varty", "email": "svarty@coldblock.ca"}]},
        {"source": "hubspot", "assigned_to": [{"id": "77", "name": "stephen  VARTY", "email": "stephen.varty@gmail.com"}]},
        {"source": "hubspot", "assigned_to": [{"id": "78", "name": "Stephen Varty", "email": "steve@rapid-sci.co.za"}]},
    ]
    _assign_person_keys(tasks)

    assert len({task["assigned_to"][0]["key"] for task in tasks}) == 1
    people = _build_people(tasks)
    assert len(people) == 1
    assert people[0]["task_count"] == 3
    assert sorted(people[0]["sources"]) == ["hubspot", "planner"]


def test_assign_person_keys_never_merges_on_thin_names():
    tasks = [
        {"source": "hubspot", "assigned_to": [{"id": "1", "name": None, "email": None}]},
        {"source": "hubspot", "assigned_to": [{"id": "2", "name": None, "email": None}]},
        {"source": "planner", "assigned_to": [{"id": "a", "name": "Pooja", "email": "pooja@one.com"}]},
        {"source": "hubspot", "assigned_to": [{"id": "b", "name": "Pooja", "email": "pooja@two.com"}]},
    ]
    _assign_person_keys(tasks)
    assert len({task["assigned_to"][0]["key"] for task in tasks}) == 4


# --- Report assembly -------------------------------------------------------


def _report_tasks(report: dict) -> list[dict]:
    return [task for rows in (*report["buckets"].values(), report["later"], report["no_due_date"]) for task in rows]


@pytest.fixture
def mock_sources(monkeypatch):
    # Pin the flags rather than inherit backend/.env, which turns Planner on.
    monkeypatch.setattr(settings, "use_mock_data", True)
    monkeypatch.setattr(settings, "enable_planner", True)


@pytest.mark.asyncio
async def test_build_tasks_report_runs_without_planner(mock_sources, monkeypatch):
    monkeypatch.setattr(settings, "enable_planner", False)
    report = await build_tasks_report()

    assert report["sources"]["hubspot"]["ok"] is True
    # With Planner off, it must degrade to a reported status — never an error
    # that takes the HubSpot half down with it.
    assert report["sources"]["planner"] == {"ok": False, "reason": "disabled"}
    assert set(report["buckets"]) == {"done", "overdue", "due_next_week"}
    assert "people" in report and "counts" in report


@pytest.mark.asyncio
async def test_build_tasks_report_merges_planner_tasks(mock_sources):
    report = await build_tasks_report()

    assert report["sources"] == {"hubspot": {"ok": True}, "planner": {"ok": True}}
    planner_rows = [task for task in _report_tasks(report) if task["source"] == "planner"]
    assert planner_rows
    assert planner_rows[0]["plan"]["name"] == "ColdBlock Team TO DO"
    assert all(person.get("key") for task in _report_tasks(report) for person in task["assigned_to"])


@pytest.mark.asyncio
async def test_build_tasks_report_adds_planner_hidden_overdue(mock_sources, monkeypatch):
    async def planner(**_):
        return {"tasks": [], "overdue_beyond_window": 3}

    monkeypatch.setattr(graph_client, "get_planner_tasks", planner)
    report = await build_tasks_report()
    # HubSpot's mock count is 0, so all of it is Planner's.
    assert report["excluded"]["overdue_beyond_window"] == 3
    assert report["excluded"]["overdue_beyond_window_by_source"] == {"hubspot": 0, "planner": 3}


@pytest.mark.asyncio
async def test_build_tasks_report_survives_planner_failure(mock_sources, monkeypatch):
    async def broken(**_):
        raise GraphAuthError("Azure client secret expired")

    monkeypatch.setattr(graph_client, "get_planner_tasks", broken)
    report = await build_tasks_report()

    assert report["sources"]["hubspot"] == {"ok": True}
    assert report["sources"]["planner"] == {"ok": False, "reason": "Azure client secret expired"}
    assert any(task["source"] == "hubspot" for task in _report_tasks(report))


@pytest.mark.asyncio
async def test_build_tasks_report_gives_up_on_slow_planner(mock_sources, monkeypatch):
    async def stalled(**_):
        await asyncio.sleep(5)

    monkeypatch.setattr(graph_client, "get_planner_tasks", stalled)
    monkeypatch.setattr(tasks_service, "_PLANNER_BUDGET_SECONDS", 0.01)
    report = await build_tasks_report()

    assert report["sources"]["planner"]["ok"] is False
    assert "didn't answer" in report["sources"]["planner"]["reason"]
    assert any(task["source"] == "hubspot" for task in _report_tasks(report))
