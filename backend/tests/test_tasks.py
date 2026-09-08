from datetime import datetime, timedelta, timezone

import pytest

from api.graph import _normalize_planner_task, _priority_label
from api.hubspot import _normalize_task, _strip_html, _task_related
from services.tasks import _bucket_for, _build_people, _local_today, _parse, build_tasks_report

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
        "title": "Ship demo unit",
        "percentComplete": 50,
        "dueDateTime": "2026-07-22T00:00:00Z",
        "createdBy": {"user": {"id": "aad-1"}},
        "assignments": {"aad-1": {}, "aad-2": {}},
    }

    result = _normalize_planner_task(task, {"T1": "Crate it"}, users)

    assert result["task_id"] == "planner:T1"
    assert result["status"] == "in_progress"
    assert result["description"] == "Crate it"
    assert [p["name"] for p in result["assigned_to"]] == ["Ana", "Bo"]


@pytest.mark.parametrize(
    "percent,expected",
    [(0, "not_started"), (None, "not_started"), (50, "in_progress"), (99, "in_progress"), (100, "completed")],
)
def test_normalize_planner_task_percent_complete_mapping(percent, expected):
    result = _normalize_planner_task({"id": "T", "percentComplete": percent}, {}, {})
    assert result["status"] == expected
    assert result["is_done"] is (expected == "completed")


def test_normalize_planner_task_created_by_application_has_no_user():
    # Teams/Flow-created tasks populate createdBy.application with no user.
    result = _normalize_planner_task({"id": "T", "createdBy": {"application": {"id": "x"}}}, {}, {})
    assert result["created_by"] is None


def test_priority_label_buckets():
    assert _priority_label(1) == "urgent"
    assert _priority_label(3) == "important"
    assert _priority_label(5) == "medium"
    assert _priority_label(9) == "low"
    assert _priority_label(None) is None


# --- Bucketing -------------------------------------------------------------

_NOW = datetime(2026, 7, 15, 18, 0, tzinfo=timezone.utc)
_TODAY = _local_today(_NOW)
_NEXT_WEEK = _TODAY + timedelta(days=7)


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


# --- Report assembly -------------------------------------------------------


@pytest.mark.asyncio
async def test_build_tasks_report_runs_without_planner():
    report = await build_tasks_report()

    assert report["sources"]["hubspot"]["ok"] is True
    # Planner is off until IT provisions the Azure app — it must degrade to a
    # reported status, never an error that takes the HubSpot half down with it.
    assert report["sources"]["planner"] == {"ok": False, "reason": "disabled"}
    assert set(report["buckets"]) == {"done", "overdue", "due_next_week"}
    assert "people" in report and "counts" in report
