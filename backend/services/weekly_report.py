"""Who receives the Monday task-report PDF, and whether this run may send it.

The recipient file is the contract. Matching looks at every assignee email on
the tasks, because one person can show up under a different address in HubSpot
and in Planner, but the message always goes to the address written in the file.
"""

import json
from pathlib import Path

RECIPIENTS_PATH = Path(__file__).resolve().parents[1] / "config" / "weekly_report_recipients.json"

# The Monday job needs both halves. A Planner outage must not go out as a
# report that simply looks like the person had no Planner tasks.
_REQUIRED_SOURCES = ("hubspot", "planner")


def load_recipients(path: Path = RECIPIENTS_PATH) -> list[dict]:
    recipients = json.loads(path.read_text(encoding="utf-8"))
    cleaned = []
    for entry in recipients:
        email = str(entry.get("email") or "").strip()
        name = str(entry.get("name") or "").strip()
        if not email or not name:
            raise ValueError(f"Recipient entries need a name and an email: {entry!r}")
        cleaned.append({"name": name, "email": email})
    return cleaned


def select_recipients(recipients: list[dict], only: list[str]) -> tuple[list[dict], list[str]]:
    """Narrow the file to the requested addresses. Unknown addresses come back
    separately so a typo in --only fails instead of sending the wrong set."""
    if not only:
        return list(recipients), []
    wanted = [(email.strip(), email.strip().lower()) for email in only if email.strip()]
    by_email = {entry["email"].lower(): entry for entry in recipients}
    chosen = []
    missing = []
    seen: set[str] = set()
    for raw, key in wanted:
        if key in seen:
            continue
        seen.add(key)
        entry = by_email.get(key)
        if entry is None:
            missing.append(raw)
        else:
            chosen.append(entry)
    return chosen, missing


def _person_key(person: dict) -> str:
    email = (person.get("email") or "").strip().lower()
    return person.get("key") or email or f"id:{person.get('id')}"


def match_recipients(recipients: list[dict], tasks: list[dict]) -> tuple[list[dict], list[str]]:
    """Pair each recipient with the person key that owns one of their addresses.

    The returned email is the one from the recipient file, not whichever
    address happened to be stored on the roster row.
    """
    key_by_email: dict[str, str] = {}
    for task in tasks:
        for person in task.get("assigned_to") or []:
            email = (person.get("email") or "").strip().lower()
            if email:
                key_by_email[email] = _person_key(person)

    matched = []
    missing = []
    for entry in recipients:
        email = entry["email"].strip().lower()
        key = key_by_email.get(email)
        if not key:
            missing.append(entry["email"])
            continue
        matched.append({"name": entry["name"], "email": entry["email"], "key": key})
    return matched, missing


def source_errors(sources: dict) -> list[str]:
    errors = []
    for name in _REQUIRED_SOURCES:
        info = sources.get(name) or {}
        if info.get("ok") is True:
            continue
        reason = info.get("reason") or "unavailable"
        errors.append(f"{name}: {reason}")
    return errors


def report_tasks(report: dict) -> list[dict]:
    tasks: list[dict] = []
    for key in ("done", "overdue", "due_next_week"):
        tasks.extend((report.get("buckets") or {}).get(key) or [])
    tasks.extend(report.get("later") or [])
    tasks.extend(report.get("no_due_date") or [])
    return tasks
