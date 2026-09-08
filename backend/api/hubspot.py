import asyncio
import html
import re

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.config import settings

# This portal has 6 deal pipelines; "OLD - ARCHIVE Sales Pipeline" is explicitly
# labeled archived and its sample deals are all from 2022 (dealstage=LOST), so
# it's excluded from the live Sales view rather than cluttering it with history.
_ARCHIVED_PIPELINE_ID = "36187665"

_DEAL_PROPERTIES = [
    "dealname",
    "amount",
    "deal_currency_code",
    "dealstage",
    "pipeline",
    "closedate",
    "createdate",
    "hs_lastmodifieddate",
    "hubspot_owner_id",
]

# HubSpot's batch/read and batch-associations endpoints cap at 100 inputs per
# request; 100 deals can easily reference more than 100 unique line items.
_BATCH_SIZE = 100

# batch/read with propertiesWithHistory has its own, stricter cap — confirmed via
# a live 400 ("The maximum number of inputs supported in a batch request for
# property histories is 50") when a full 100-deal page was sent in one call.
_HISTORY_BATCH_SIZE = 50


def _chunks(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


_CONTACT_PROPERTIES = ["firstname", "lastname", "email", "company", "conference_name", "contact_source", "createdate"]

_TASK_PROPERTIES = [
    "hs_task_subject",
    "hs_task_body",
    "hs_task_status",
    "hs_task_priority",
    "hs_task_type",
    "hs_timestamp",
    "hs_task_completion_date",
    "hubspot_owner_id",
    "hs_created_by_user_id",
]

# HubSpot's own status vocabulary. DEFERRED is deliberately NOT treated as done —
# it's a task someone pushed out, so it still belongs in overdue/upcoming.
_OPEN_TASK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "WAITING", "DEFERRED"]

_TASK_STATUS_MAP = {
    "NOT_STARTED": "not_started",
    "IN_PROGRESS": "in_progress",
    "WAITING": "waiting",
    "COMPLETED": "completed",
    "DEFERRED": "deferred",
}

_MOCK_TASKS = [
    {
        "task_id": "hubspot:TASK-1",
        "source": "hubspot",
        "name": "Follow up on Acme quote",
        "description": "Customer asked for revised pricing on the CBM package.",
        "status": "not_started",
        "is_done": False,
        "due_date": "2026-07-20T13:00:00Z",
        "completed_date": None,
        "created_by": {"id": "USER-1", "name": "Sample Rep", "email": "rep@coldblock.ca"},
        "assigned_to": [{"id": "OWNER-1", "name": "Sample Rep", "email": "rep@coldblock.ca"}],
        "priority": "HIGH",
        "company": {"id": "C1", "name": "Acme Corp"},
        "contact": {"id": "P1", "name": "Giel Eussen"},
        "deal": {"id": "D1", "name": "Acme Corp Q3 Order", "amount": 15000.0, "currency": "USD"},
    },
    {
        # Creator id that resolves to nothing — a real case (deleted/non-owner
        # users), so the UI has to render the gap rather than assume a name.
        "task_id": "hubspot:TASK-2",
        "source": "hubspot",
        "name": "Send North Lab the revised SOW",
        "description": None,
        "status": "completed",
        "is_done": True,
        "due_date": "2026-07-10T13:00:00Z",
        "completed_date": "2026-07-09T18:22:00Z",
        "created_by": {"id": "45578187", "name": None, "email": None},
        "assigned_to": [{"id": "OWNER-2", "name": "Another Rep", "email": "another@coldblock.ca"}],
        "priority": "NONE",
        "company": {"id": "C2", "name": "North Lab"},
        "contact": None,
        "deal": None,
    },
    {
        # No due date at all — can't be overdue or due-next-week, so it would
        # vanish from a three-bucket view if that case weren't handled.
        "task_id": "hubspot:TASK-3",
        "source": "hubspot",
        "name": "Tidy up the sample tracker",
        "description": "Ongoing, no hard deadline.",
        "status": "deferred",
        "is_done": False,
        "due_date": None,
        "completed_date": None,
        "created_by": None,
        "assigned_to": [],
        "priority": "LOW",
        "company": None,
        "contact": None,
        "deal": None,
    },
]


def _strip_html(value: str | None) -> str | None:
    """hs_task_body is HTML authored in the CRM. Flatten it to plain text here
    so the frontend never has to consider rendering it as markup."""
    if not value:
        return None
    text = re.sub(r"<br\s*/?>|</p>|</div>|</li>", " ", value, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None

_MOCK_CONFERENCE_CONTACTS = [
    {
        "contact_id": "CONTACT-1",
        "name": "Jane Prospect",
        "company": "Example Labs",
        "conference": "Analytica Germany 2026",
        "source": "CONFERENCE",
        "create_date": "2026-06-15",
    },
]

_MOCK_DEALS = [
    {
        "deal_id": "DEAL-1",
        "name": "Acme Corp Q3 Order",
        "company": "Acme Corp",
        "pipeline": "Active Sales Pipeline",
        "stage": "Confirmed Interest - expect PO wi 60 days",
        "stage_order": 5,
        "is_closed": False,
        "is_won": False,
        "amount": 15000.0,
        "currency": "USD",
        "close_date": None,
        "create_date": "2026-07-01",
        "owner": {"id": "OWNER-1", "name": "Sample Rep", "email": "rep@coldblock.ca"},
        "items": [
            {"sku": "CB-VALVE-100", "name": "Valve 100", "quantity": 10, "price": 500.0},
        ],
        "stage_history": [
            {"stage": "Qualified Opportunity - uncontacted", "stage_order": 0, "changed_at": "2026-06-20T00:00:00Z"},
            {"stage": "Confirmed Interest - expect PO wi 60 days", "stage_order": 5, "changed_at": "2026-07-01T00:00:00Z"},
        ],
    },
    {
        "deal_id": "DEAL-2",
        "name": "North Lab Package",
        "company": "North Lab",
        "pipeline": "Active Sales Pipeline",
        "stage": "Closed Won - sale, trial, subscription",
        "stage_order": 7,
        "is_closed": True,
        "is_won": True,
        "amount": 42000.0,
        "currency": "USD",
        "close_date": "2025-11-15",
        "create_date": "2025-10-01",
        "owner": {"id": "OWNER-2", "name": "Another Rep", "email": "another@coldblock.ca"},
        "items": [],
        "stage_history": [
            {"stage": "Qualified Opportunity - uncontacted", "stage_order": 0, "changed_at": "2025-10-01T00:00:00Z"},
            {"stage": "Closed Won - sale, trial, subscription", "stage_order": 7, "changed_at": "2025-11-15T00:00:00Z"},
        ],
    },
]


class HubspotClient:
    def __init__(self) -> None:
        self._base_url = settings.hubspot_base_url
        self._headers = {"Authorization": f"Bearer {settings.hubspot_api_token}"}

    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TransportError)),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
    )
    async def _get(self, client: httpx.AsyncClient, path: str, params: dict | None = None) -> dict:
        response = await client.get(f"{self._base_url}{path}", headers=self._headers, params=params)
        response.raise_for_status()
        return response.json()

    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TransportError)),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
    )
    async def _post(self, client: httpx.AsyncClient, path: str, json_body: dict) -> dict:
        response = await client.post(f"{self._base_url}{path}", headers=self._headers, json=json_body)
        response.raise_for_status()
        return response.json()

    async def get_deal_pipelines(self, client: httpx.AsyncClient) -> dict[str, dict]:
        """{pipeline_id: {"label": ..., "stages": {stage_id: {"label", "is_closed", "is_won", "order"}}}}"""
        data = await self._get(client, "/crm/v3/pipelines/deals")
        pipelines: dict[str, dict] = {}
        for pipeline in data.get("results", []):
            pipelines[pipeline["id"]] = {
                "label": pipeline["label"],
                "stages": {
                    stage["id"]: {
                        "label": stage["label"],
                        "is_closed": stage["metadata"].get("isClosed") == "true",
                        # "isClosed" alone doesn't distinguish won from lost — a
                        # closed deal at probability 0.0 is lost, not revenue.
                        # Confirmed consistent across all 5 non-archived pipelines.
                        "is_won": float(stage["metadata"].get("probability") or 0) >= 1.0,
                        "order": stage["displayOrder"],
                    }
                    for stage in pipeline["stages"]
                },
            }
        return pipelines

    async def get_owner_indexes(self, client: httpx.AsyncClient) -> dict[str, dict[str, dict]]:
        """Owners indexed two ways: {"by_id": ..., "by_user_id": ...}.

        Both are needed because HubSpot uses two different id spaces for people.
        A record's *owner* (hubspot_owner_id, e.g. on a deal or task assignee)
        keys off owner.id, but a task's *creator* (hs_created_by_user_id) keys
        off owner.userId — verified live, where creator ids matched nothing in
        the by_id index. Not every owner has a userId, so by_user_id is smaller.

        Two calls are required either way — the owners endpoint defaults to
        active-only and there's no single query that returns both active and
        deactivated owners. Skipping the archived call would leave every record
        still attributed to a departed rep resolving to a bare, unlabeled id.
        """
        by_id: dict[str, dict] = {}
        by_user_id: dict[str, dict] = {}
        for params in ({"limit": 100}, {"limit": 100, "archived": "true"}):
            data = await self._get(client, "/crm/v3/owners/", params=params)
            for owner in data.get("results", []):
                name = " ".join(filter(None, [owner.get("firstName"), owner.get("lastName")])).strip() or None
                entry = {"name": name, "email": owner.get("email")}
                by_id[str(owner["id"])] = entry
                if owner.get("userId") is not None:
                    by_user_id[str(owner["userId"])] = entry
        return {"by_id": by_id, "by_user_id": by_user_id}

    async def get_owners(self, client: httpx.AsyncClient) -> dict[str, dict]:
        """{owner_id: {"name": ..., "email": ...}} — the by_id half of get_owner_indexes."""
        return (await self.get_owner_indexes(client))["by_id"]

    async def _batch_read(
        self, client: httpx.AsyncClient, object_type: str, ids: set[str], properties: list[str]
    ) -> dict[str, dict]:
        results: dict[str, dict] = {}
        for chunk in _chunks(list(ids), _BATCH_SIZE):
            data = await self._post(
                client,
                f"/crm/v3/objects/{object_type}/batch/read",
                {"inputs": [{"id": object_id} for object_id in chunk], "properties": properties},
            )
            results.update({result["id"]: result["properties"] for result in data.get("results", [])})
        return results

    async def _batch_associations(
        self, client: httpx.AsyncClient, from_type: str, to_type: str, from_ids: list[str]
    ) -> dict[str, list[str]]:
        """{from_id: [associated object ids]}. Search endpoints don't support an
        `associations` field (that's list-endpoint-only), so this is a separate
        v4 batch-associations call per object type."""
        results: dict[str, list[str]] = {}
        for chunk in _chunks(from_ids, _BATCH_SIZE):
            data = await self._post(
                client,
                f"/crm/v4/associations/{from_type}/{to_type}/batch/read",
                {"inputs": [{"id": object_id} for object_id in chunk]},
            )
            results.update(
                {
                    result["from"]["id"]: [str(item["toObjectId"]) for item in result.get("to", [])]
                    for result in data.get("results", [])
                }
            )
        return results

    async def _batch_stage_history(self, client: httpx.AsyncClient, deal_ids: list[str]) -> dict[str, list[dict]]:
        """{deal_id: [{"stage_id": ..., "changed_at": ...}, ...]} in chronological
        order. HubSpot's search/list endpoints don't support propertiesWithHistory
        (list-endpoint limitation, same class of issue as `associations`), but
        the batch/read endpoint does — verified live before building this."""
        results: dict[str, list[dict]] = {}
        for chunk in _chunks(deal_ids, _HISTORY_BATCH_SIZE):
            data = await self._post(
                client,
                "/crm/v3/objects/deals/batch/read",
                {"inputs": [{"id": deal_id} for deal_id in chunk], "propertiesWithHistory": ["dealstage"]},
            )
            for result in data.get("results", []):
                history = result.get("propertiesWithHistory", {}).get("dealstage", [])
                # HubSpot returns newest-first; reverse for chronological order.
                results[result["id"]] = [
                    {"stage_id": entry["value"], "changed_at": entry["timestamp"]} for entry in reversed(history)
                ]
        return results

    async def _search_all_deals(self, client: httpx.AsyncClient) -> list[dict]:
        """deals/search caps at 100 results per page. This portal has hundreds of
        non-archived deals, so a single page silently dropped every deal older
        than the 100 most-recently-modified — paginate via the `after` cursor
        to fetch all of them instead."""
        results: list[dict] = []
        after: str | None = None
        while True:
            search_body = {
                "filterGroups": [
                    {"filters": [{"propertyName": "pipeline", "operator": "NEQ", "value": _ARCHIVED_PIPELINE_ID}]}
                ],
                "sorts": [{"propertyName": "hs_lastmodifieddate", "direction": "DESCENDING"}],
                "properties": _DEAL_PROPERTIES,
                "limit": 100,
            }
            if after:
                search_body["after"] = after
            data = await self._post(client, "/crm/v3/objects/deals/search", search_body)
            results.extend(data.get("results", []))
            after = data.get("paging", {}).get("next", {}).get("after")
            if not after:
                return results

    async def get_deals(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_DEALS
        if not settings.hubspot_api_token:
            return []

        async with httpx.AsyncClient(timeout=30) as client:
            # Neither depends on deal_ids, unlike the batch group below — fetch concurrently.
            pipelines, owners_by_id = await asyncio.gather(
                self.get_deal_pipelines(client),
                self.get_owners(client),
            )

            deals_raw = await self._search_all_deals(client)
            deal_ids = [deal["id"] for deal in deals_raw]

            # These three only depend on deal_ids, not on each other — fetch concurrently.
            company_assoc, line_item_assoc, stage_history = await asyncio.gather(
                self._batch_associations(client, "deals", "companies", deal_ids),
                self._batch_associations(client, "deals", "line_items", deal_ids),
                self._batch_stage_history(client, deal_ids),
            )

            company_ids = {cid for ids in company_assoc.values() for cid in ids}
            line_item_ids = {lid for ids in line_item_assoc.values() for lid in ids}

            companies_by_id, line_items_by_id = await asyncio.gather(
                self._batch_read(client, "companies", company_ids, ["name"]),
                self._batch_read(client, "line_items", line_item_ids, ["name", "quantity", "price", "hs_sku"]),
            )

            return [
                _normalize_deal(
                    deal,
                    pipelines,
                    company_assoc.get(deal["id"], []),
                    line_item_assoc.get(deal["id"], []),
                    companies_by_id,
                    line_items_by_id,
                    stage_history.get(deal["id"], []),
                    owners_by_id,
                )
                for deal in deals_raw
            ]

    async def _search_all_tasks(self, client: httpx.AsyncClient, filter_groups: list[dict]) -> list[dict]:
        """Cursor-paginated task search. Same shape as _search_all_deals, but the
        caller supplies the filters so the date/status window is applied
        server-side — this portal has ~1800 tasks and the actionable window is
        ~360, so filtering here rather than in Python is most of the speed."""
        results: list[dict] = []
        after: str | None = None
        while True:
            body = {
                "filterGroups": filter_groups,
                "sorts": [{"propertyName": "hs_timestamp", "direction": "ASCENDING"}],
                "properties": _TASK_PROPERTIES,
                "limit": 100,
            }
            if after:
                body["after"] = after
            data = await self._post(client, "/crm/v3/objects/tasks/search", body)
            results.extend(data.get("results", []))
            after = data.get("paging", {}).get("next", {}).get("after")
            if not after:
                return results

    async def get_tasks(self, *, overdue_since_ms: int | None, due_until_ms: int, completed_since_ms: int) -> list[dict]:
        """Tasks in the reporting window, normalized. Three separate searches
        rather than one — HubSpot filterGroups are OR'd together but each group's
        filters are AND'd, and "open and overdue" vs "completed recently" need
        different property filters entirely.

        overdue_since_ms=None means "no lower bound" (the show-everything view).
        """
        if settings.use_mock_data:
            return _MOCK_TASKS
        if not settings.hubspot_api_token:
            return []

        overdue_due_filter = (
            {"propertyName": "hs_timestamp", "operator": "LT", "value": str(due_until_ms)}
            if overdue_since_ms is None
            else {
                "propertyName": "hs_timestamp",
                "operator": "BETWEEN",
                "value": str(overdue_since_ms),
                "highValue": str(due_until_ms),
            }
        )
        filter_groups = [
            # Open tasks inside the due-date window (covers overdue + upcoming).
            {"filters": [{"propertyName": "hs_task_status", "operator": "IN", "values": _OPEN_TASK_STATUSES}, overdue_due_filter]},
            # Open tasks with no due date at all — they'd be invisible otherwise.
            {
                "filters": [
                    {"propertyName": "hs_task_status", "operator": "IN", "values": _OPEN_TASK_STATUSES},
                    {"propertyName": "hs_timestamp", "operator": "NOT_HAS_PROPERTY"},
                ]
            },
            # Recently completed.
            {
                "filters": [
                    {"propertyName": "hs_task_status", "operator": "EQ", "value": "COMPLETED"},
                    {"propertyName": "hs_task_completion_date", "operator": "GTE", "value": str(completed_since_ms)},
                ]
            },
        ]

        async with httpx.AsyncClient(timeout=45) as client:
            indexes, tasks_raw = await asyncio.gather(
                self.get_owner_indexes(client),
                self._search_all_tasks(client, filter_groups),
            )
            related_by_id = await self._task_associations(client, [task["id"] for task in tasks_raw])
            return [
                _normalize_task(
                    task,
                    indexes["by_id"],
                    indexes["by_user_id"],
                    related_by_id.get(task["id"]),
                )
                for task in tasks_raw
            ]

    async def _task_associations(self, client: httpx.AsyncClient, task_ids: list[str]) -> dict[str, dict]:
        """Company / contact / deal names keyed by HubSpot task id.

        Tasks/search can't return associations, so this is three v4 batch reads
        plus three object batch-reads — same pattern as deals. First named
        association of each type is enough for the meeting row.
        """
        if not task_ids:
            return {}

        contact_assoc, company_assoc, deal_assoc = await asyncio.gather(
            self._batch_associations(client, "tasks", "contacts", task_ids),
            self._batch_associations(client, "tasks", "companies", task_ids),
            self._batch_associations(client, "tasks", "deals", task_ids),
        )

        contact_ids = {cid for ids in contact_assoc.values() for cid in ids}
        company_ids = {cid for ids in company_assoc.values() for cid in ids}
        deal_ids = {did for ids in deal_assoc.values() for did in ids}

        contacts, companies, deals = await asyncio.gather(
            self._batch_read(client, "contacts", contact_ids, ["firstname", "lastname", "email", "company"]),
            self._batch_read(client, "companies", company_ids, ["name"]),
            self._batch_read(client, "deals", deal_ids, ["dealname", "amount", "deal_currency_code"]),
        )

        return {
            task_id: _task_related(
                task_id,
                contact_assoc,
                company_assoc,
                deal_assoc,
                contacts,
                companies,
                deals,
            )
            for task_id in task_ids
        }

    async def count_open_tasks_before(self, cutoff_ms: int) -> int:
        """How many open tasks are due *before* the window starts — the ones the
        default view leaves out. Surfaced as a count so the omission is visible
        rather than silent."""
        if settings.use_mock_data or not settings.hubspot_api_token:
            return 0
        body = {
            "filterGroups": [
                {
                    "filters": [
                        {"propertyName": "hs_task_status", "operator": "IN", "values": _OPEN_TASK_STATUSES},
                        {"propertyName": "hs_timestamp", "operator": "LT", "value": str(cutoff_ms)},
                    ]
                }
            ],
            "limit": 1,
            "properties": ["hs_task_subject"],
        }
        async with httpx.AsyncClient(timeout=30) as client:
            data = await self._post(client, "/crm/v3/objects/tasks/search", body)
            return int(data.get("total") or 0)

    async def get_conference_contacts(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_CONFERENCE_CONTACTS
        if not settings.hubspot_api_token:
            return []

        async with httpx.AsyncClient(timeout=30) as client:
            search_body = {
                "filterGroups": [{"filters": [{"propertyName": "conference_name", "operator": "HAS_PROPERTY"}]}],
                "sorts": [{"propertyName": "createdate", "direction": "DESCENDING"}],
                "properties": _CONTACT_PROPERTIES,
                "limit": 100,
            }
            data = await self._post(client, "/crm/v3/objects/contacts/search", search_body)
            return [_normalize_conference_contact(row) for row in data.get("results", [])]


def _person(person_id: str | None, index: dict[str, dict]) -> dict | None:
    """Resolve a person id against an owner index, keeping the raw id when it
    doesn't resolve. A deleted or non-owner user is a real, permanent case here
    (verified live), and showing the bare id is more honest than a blank."""
    if not person_id:
        return None
    resolved = index.get(str(person_id)) or {}
    return {"id": str(person_id), "name": resolved.get("name"), "email": resolved.get("email")}


def _contact_name(props: dict) -> str | None:
    name = " ".join(filter(None, [props.get("firstname"), props.get("lastname")])).strip()
    return name or props.get("email") or None


def _task_related(
    task_id: str,
    contact_assoc: dict[str, list[str]],
    company_assoc: dict[str, list[str]],
    deal_assoc: dict[str, list[str]],
    contacts: dict[str, dict],
    companies: dict[str, dict],
    deals: dict[str, dict],
) -> dict:
    contact = None
    contact_company = None
    for contact_id in contact_assoc.get(task_id, []):
        props = contacts.get(contact_id)
        if not props:
            continue
        if props.get("company") and not contact_company:
            contact_company = props["company"]
        name = _contact_name(props)
        if name and contact is None:
            contact = {"id": contact_id, "name": name}

    company = None
    for company_id in company_assoc.get(task_id, []):
        props = companies.get(company_id)
        if props and props.get("name"):
            company = {"id": company_id, "name": props["name"]}
            break
    if company is None and contact_company:
        company = {"id": None, "name": contact_company}

    deal = None
    for deal_id in deal_assoc.get(task_id, []):
        props = deals.get(deal_id)
        if not props or not props.get("dealname"):
            continue
        amount = props.get("amount")
        deal = {
            "id": deal_id,
            "name": props["dealname"],
            "amount": float(amount) if amount not in (None, "") else None,
            "currency": props.get("deal_currency_code") or "USD",
        }
        break

    return {"company": company, "contact": contact, "deal": deal}


def _normalize_task(
    task: dict,
    owners_by_id: dict[str, dict],
    owners_by_user_id: dict[str, dict],
    related: dict | None = None,
) -> dict:
    props = task.get("properties", {})
    raw_status = (props.get("hs_task_status") or "").upper()
    status = _TASK_STATUS_MAP.get(raw_status, "not_started")
    related = related or {}

    return {
        "task_id": f"hubspot:{task.get('id')}",
        "source": "hubspot",
        "name": props.get("hs_task_subject") or None,
        "description": _strip_html(props.get("hs_task_body")),
        "status": status,
        # is_done is the field the UI branches on; DEFERRED is open, not done.
        "is_done": status == "completed",
        "due_date": props.get("hs_timestamp") or None,
        "completed_date": props.get("hs_task_completion_date") or None,
        # Assignee keys off owner.id; creator keys off owner.userId — different
        # HubSpot id spaces, hence the two indexes.
        "created_by": _person(props.get("hs_created_by_user_id"), owners_by_user_id),
        "assigned_to": [p for p in [_person(props.get("hubspot_owner_id"), owners_by_id)] if p],
        "priority": props.get("hs_task_priority") or None,
        "company": related.get("company"),
        "contact": related.get("contact"),
        "deal": related.get("deal"),
    }


def _normalize_conference_contact(row: dict) -> dict:
    props = row.get("properties", {})
    name = " ".join(filter(None, [props.get("firstname"), props.get("lastname")])).strip() or None
    return {
        "contact_id": row.get("id"),
        "name": name,
        "company": props.get("company"),
        "conference": props.get("conference_name"),
        "source": props.get("contact_source"),
        "create_date": props.get("createdate"),
    }


def _normalize_deal(
    deal: dict,
    pipelines: dict[str, dict],
    company_ids: list[str],
    line_item_ids: list[str],
    companies_by_id: dict[str, dict],
    line_items_by_id: dict[str, dict],
    stage_history_raw: list[dict] | None = None,
    owners_by_id: dict[str, dict] | None = None,
) -> dict:
    props = deal.get("properties", {})
    pipeline_info = pipelines.get(props.get("pipeline"), {})
    stage_info = pipeline_info.get("stages", {}).get(props.get("dealstage"), {})

    stage_history = [
        {
            "stage": pipeline_info.get("stages", {}).get(event["stage_id"], {}).get("label", event["stage_id"]),
            "stage_order": pipeline_info.get("stages", {}).get(event["stage_id"], {}).get("order", 0),
            "changed_at": event["changed_at"],
        }
        for event in (stage_history_raw or [])
    ]

    company_name = None
    for company_id in company_ids:
        company = companies_by_id.get(company_id)
        if company and company.get("name"):
            company_name = company["name"]
            break

    owner_id = props.get("hubspot_owner_id")
    owner = None
    if owner_id:
        resolved = (owners_by_id or {}).get(owner_id) or {}
        # Preserve the id even if it didn't resolve (e.g. a since-deleted owner
        # not covered by either the active or archived owners call) so the
        # frontend can still group it distinctly from a deal with no owner at all.
        owner = {"id": owner_id, "name": resolved.get("name"), "email": resolved.get("email")}

    items = []
    for item_id in line_item_ids:
        line_item = line_items_by_id.get(item_id)
        if not line_item:
            continue
        items.append(
            {
                "sku": line_item.get("hs_sku"),
                "name": line_item.get("name"),
                "quantity": line_item.get("quantity"),
                "price": line_item.get("price"),
            }
        )

    amount = props.get("amount")
    return {
        "deal_id": deal.get("id"),
        "name": props.get("dealname"),
        "company": company_name,
        "pipeline": pipeline_info.get("label", props.get("pipeline") or "Unknown"),
        "stage": stage_info.get("label", props.get("dealstage") or "Unknown"),
        # Different pipelines have entirely different stage sets (unlike Fishbowl's
        # single status enum), so column order can't be hardcoded on the frontend —
        # it has to come from HubSpot's own displayOrder for this deal's stage.
        "stage_order": stage_info.get("order", 0),
        "is_closed": stage_info.get("is_closed", False),
        "is_won": stage_info.get("is_won", False),
        "amount": float(amount) if amount not in (None, "") else None,
        # HubSpot's own portal home currency is USD (confirmed via account-info),
        # unlike Fishbowl where the home currency is CAD — don't cross the wires.
        "currency": props.get("deal_currency_code") or "USD",
        "close_date": props.get("closedate") or None,
        "create_date": props.get("createdate"),
        "owner": owner,
        "items": items,
        "stage_history": stage_history,
    }


hubspot_client = HubspotClient()
