import asyncio
import unicodedata
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

# Planner runs alongside HubSpot, and normally finishes first. If it stalls,
# the report goes out without it rather than hanging the page.
_PLANNER_BUDGET_SECONDS = 15


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


def _name_key(name: str | None) -> str | None:
    """Accent-, case- and spacing-insensitive full name — or None when there's
    too little to go on, since a lone first name collides too easily."""
    if not name:
        return None
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    words = plain.lower().split()
    return " ".join(words) if len(words) >= 2 else None


def _assign_person_keys(tasks: list[dict]) -> None:
    """Give every assignee a `key` for the human rather than the account.

    Email is the join between HubSpot owners and Azure AD users, but it isn't
    always the same address in both — verified live: Stephen Varty is
    svarty@coldblock.ca in Planner and stephen.varty@gmail.com in HubSpot, and
    Darryl Khan dkhan@coldblock.ca vs darryl@armadawebsolutions.com. Accounts
    sharing a full display name are folded into one key so each person appears
    once, with both systems' tasks. People with no resolvable name keep their
    own key and are never merged.
    """
    people = [person for task in tasks for person in task.get("assigned_to") or []]

    keys_by_name: dict[str, set[str]] = {}
    for person in people:
        name = _name_key(person.get("name"))
        if name:
            keys_by_name.setdefault(name, set()).add(_person_key(person))

    # Tiny union-find: one account can carry two spellings of a name across
    # systems, which chains groups together. The smallest key wins each merge
    # so the result is the same on every request.
    root: dict[str, str] = {}

    def find(key: str) -> str:
        while root.get(key, key) != key:
            key = root[key]
        return key

    for keys in keys_by_name.values():
        roots = sorted({find(key) for key in keys})
        for other in roots[1:]:
            root[other] = roots[0]

    for person in people:
        person["key"] = find(_person_key(person))


def _build_people(tasks: list[dict]) -> list[dict]:
    """Roster for the scope dropdown, derived from the tasks actually present —
    a directory dump would list dozens of people with nothing assigned.
    Scope is by assignee; creators deliberately don't create roster entries."""
    people: dict[str, dict] = {}
    for task in tasks:
        for person in task.get("assigned_to") or []:
            key = person.get("key") or _person_key(person)
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


async def _fetch_planner_tasks(*, next_week: datetime, overdue_since: datetime | None, completed_since: datetime) -> dict:
    """Planner runs only when ENABLE_PLANNER is set, since it needs the Azure
    app registration's credentials. Without it the report runs on HubSpot alone."""
    if not settings.enable_planner:
        return {"tasks": [], "overdue_beyond_window": 0}
    from api.graph import graph_client

    try:
        return await asyncio.wait_for(
            graph_client.get_planner_tasks(
                next_week=next_week, overdue_since=overdue_since, completed_since=completed_since
            ),
            timeout=_PLANNER_BUDGET_SECONDS,
        )
    except TimeoutError:
        # A bare TimeoutError stringifies to "", which would reach the page as
        # an empty reason.
        raise RuntimeError(
            f"Planner didn't answer within {_PLANNER_BUDGET_SECONDS}s — showing HubSpot only"
        ) from None


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
        _fetch_planner_tasks(next_week=next_week, overdue_since=overdue_since, completed_since=completed_since),
        hubspot_client.count_open_tasks_before(ms(overdue_since)) if overdue_since else _zero(),
        return_exceptions=True,
    )

    sources: dict[str, dict] = {}
    tasks: list[dict] = []
    # Kept per source so the page can quote the right figure when it's
    # filtered to one system.
    hidden_overdue = {
        "hubspot": 0 if isinstance(excluded_result, Exception) or excluded_result is None else int(excluded_result),
        "planner": 0,
    }

    if isinstance(hubspot_result, Exception):
        sources["hubspot"] = {"ok": False, "reason": str(hubspot_result)}
    else:
        sources["hubspot"] = {"ok": True}
        tasks.extend(hubspot_result)

    if not settings.enable_planner:
        sources["planner"] = {"ok": False, "reason": "disabled"}
    elif isinstance(planner_result, Exception):
        sources["planner"] = {"ok": False, "reason": str(planner_result) or type(planner_result).__name__}
    else:
        sources["planner"] = {"ok": True}
        tasks.extend(planner_result["tasks"])
        hidden_overdue["planner"] = planner_result["overdue_beyond_window"]

    _assign_person_keys(tasks)

    for task in tasks:
        task["bucket"] = _bucket_for(task, today, next_week)

    buckets = {"done": [], "overdue": [], "due_next_week": [], "later": [], "no_due_date": []}
    for task in tasks:
        buckets[task["bucket"]].append(task)

    buckets["overdue"].sort(key=lambda t: _parse(t.get("due_date")) or today)
    buckets["due_next_week"].sort(key=lambda t: _parse(t.get("due_date")) or today)
    buckets["done"].sort(key=lambda t: _parse(t.get("completed_date")) or today, reverse=True)

    return {
        "window": window,
        "generated_at": now.isoformat(),
        "buckets": {key: buckets[key] for key in ("done", "overdue", "due_next_week")},
        "later": buckets["later"],
        "no_due_date": buckets["no_due_date"],
        "people": _build_people(tasks),
        "counts": {key: len(value) for key, value in buckets.items()},
        "excluded": {
            "overdue_beyond_window": sum(hidden_overdue.values()),
            "overdue_beyond_window_by_source": hidden_overdue,
            "overdue_lookback_days": _OVERDUE_LOOKBACK_DAYS,
            "completed_lookback_days": _COMPLETED_LOOKBACK_DAYS,
        },
        "sources": sources,
    }


async def _zero() -> int:
    return 0
