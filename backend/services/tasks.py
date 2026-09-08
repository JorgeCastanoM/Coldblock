import asyncio
from datetime import datetime, timedelta, timezone

from api.hubspot import hubspot_client
from core.config import settings

# Overdue/upcoming are judged against the local business day, not UTC. Vercel
# runs in UTC, so a task due "today" in Toronto would otherwise flip to overdue
# up to 5 hours early. Fixed offset rather than a tz database lookup — the app
# has no other timezone handling and this is the only place it matters.
_LOCAL_UTC_OFFSET = timedelta(hours=-5)

# How far back the default view reaches. Everything older is counted and
# offered behind "show all" rather than dropped silently.
_OVERDUE_LOOKBACK_DAYS = 90
_COMPLETED_LOOKBACK_DAYS = 30
_UPCOMING_DAYS = 7


def _local_today(now: datetime) -> datetime:
    """Midnight of the current local business day, expressed in UTC."""
    local = now + _LOCAL_UTC_OFFSET
    local_midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight - _LOCAL_UTC_OFFSET


def _parse(value) -> datetime | None:
    """Tasks carry dates as ISO-8601 strings (Graph, and HubSpot's search
    output) or epoch millis (HubSpot occasionally). Accept both."""
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    text = str(value).strip()
    if text.isdigit():
        return datetime.fromtimestamp(int(text) / 1000, tz=timezone.utc)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _bucket_for(task: dict, today: datetime, next_week: datetime) -> str:
    if task.get("is_done"):
        return "done"
    due = _parse(task.get("due_date"))
    if due is None:
        return "no_due_date"
    if due < today:
        return "overdue"
    # A task due today is upcoming, not overdue — it still has the day to run.
    if due <= next_week:
        return "due_next_week"
    return "later"


def _person_key(person: dict) -> str:
    """Email is the join key across systems — HubSpot owners and Azure AD users
    share nothing else. Falls back to the raw id for people who resolve to no
    email, which keeps them as their own row instead of merging strangers."""
    email = (person.get("email") or "").strip().lower()
    return email or f"id:{person.get('id')}"


def _build_people(tasks: list[dict]) -> list[dict]:
    """Roster for the scope dropdown, derived from the tasks actually present —
    a directory dump would list dozens of people with nothing assigned.
    Scope is by assignee; creators deliberately don't create roster entries."""
    people: dict[str, dict] = {}
    for task in tasks:
        for person in task.get("assigned_to") or []:
            key = _person_key(person)
            entry = people.get(key)
            if entry is None:
                entry = {
                    "key": key,
                    "name": person.get("name"),
                    "email": person.get("email"),
                    "sources": [],
                    "task_count": 0,
                }
                people[key] = entry
            entry["task_count"] += 1
            if person.get("name") and not entry["name"]:
                entry["name"] = person["name"]
            source = task.get("source")
            if source and source not in entry["sources"]:
                entry["sources"].append(source)
    return sorted(people.values(), key=lambda p: (-p["task_count"], (p["name"] or p["key"]).lower()))


async def _fetch_planner_tasks() -> list[dict]:
    """Planner is behind a flag until IT provisions the Azure app registration
    (application permissions need admin consent). Until then this is a no-op
    and the report runs on HubSpot alone."""
    if not settings.enable_planner:
        return []
    from api.graph import graph_client

    return await graph_client.get_planner_tasks()


async def build_tasks_report(window: str = "actionable") -> dict:
    now = datetime.now(timezone.utc)
    today = _local_today(now)
    next_week = today + timedelta(days=_UPCOMING_DAYS)

    overdue_since = None if window == "all" else today - timedelta(days=_OVERDUE_LOOKBACK_DAYS)
    completed_since = today - timedelta(days=_COMPLETED_LOOKBACK_DAYS)
    ms = lambda dt: int(dt.timestamp() * 1000)  # noqa: E731

    # return_exceptions so a Planner outage can never blank the HubSpot half —
    # the two sources are reported on independently below.
    hubspot_result, planner_result, excluded_result = await asyncio.gather(
        hubspot_client.get_tasks(
            overdue_since_ms=ms(overdue_since) if overdue_since else None,
            due_until_ms=ms(next_week),
            completed_since_ms=ms(completed_since),
        ),
        _fetch_planner_tasks(),
        hubspot_client.count_open_tasks_before(ms(overdue_since)) if overdue_since else _zero(),
        return_exceptions=True,
    )

    sources: dict[str, dict] = {}
    tasks: list[dict] = []

    if isinstance(hubspot_result, Exception):
        sources["hubspot"] = {"ok": False, "reason": str(hubspot_result)}
    else:
        sources["hubspot"] = {"ok": True}
        tasks.extend(hubspot_result)

    if not settings.enable_planner:
        sources["planner"] = {"ok": False, "reason": "disabled"}
    elif isinstance(planner_result, Exception):
        sources["planner"] = {"ok": False, "reason": str(planner_result)}
    else:
        sources["planner"] = {"ok": True}
        tasks.extend(planner_result)

    for task in tasks:
        task["bucket"] = _bucket_for(task, today, next_week)

    buckets = {"done": [], "overdue": [], "due_next_week": [], "later": [], "no_due_date": []}
    for task in tasks:
        buckets[task["bucket"]].append(task)

    buckets["overdue"].sort(key=lambda t: _parse(t.get("due_date")) or today)
    buckets["due_next_week"].sort(key=lambda t: _parse(t.get("due_date")) or today)
    buckets["done"].sort(key=lambda t: _parse(t.get("completed_date")) or today, reverse=True)

    older_overdue = 0 if isinstance(excluded_result, Exception) or excluded_result is None else int(excluded_result)

    return {
        "window": window,
        "generated_at": now.isoformat(),
        "buckets": {key: buckets[key] for key in ("done", "overdue", "due_next_week")},
        "later": buckets["later"],
        "no_due_date": buckets["no_due_date"],
        "people": _build_people(tasks),
        "counts": {key: len(value) for key, value in buckets.items()},
        "excluded": {
            "overdue_beyond_window": older_overdue,
            "overdue_lookback_days": _OVERDUE_LOOKBACK_DAYS,
            "completed_lookback_days": _COMPLETED_LOOKBACK_DAYS,
        },
        "sources": sources,
    }


async def _zero() -> int:
    return 0
