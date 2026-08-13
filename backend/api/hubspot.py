import asyncio

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

    async def get_owners(self, client: httpx.AsyncClient) -> dict[str, dict]:
        """{owner_id: {"name": ..., "email": ...}}. Two calls are required — the
        owners endpoint defaults to active-only and there's no single query that
        returns both active and deactivated owners. Skipping the archived call
        would leave every deal still attributed to a departed rep resolving to
        a bare, unlabeled id."""
        owners: dict[str, dict] = {}
        for params in ({"limit": 100}, {"limit": 100, "archived": "true"}):
            data = await self._get(client, "/crm/v3/owners/", params=params)
            for owner in data.get("results", []):
                name = " ".join(filter(None, [owner.get("firstName"), owner.get("lastName")])).strip() or None
                owners[str(owner["id"])] = {"name": name, "email": owner.get("email")}
        return owners

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
        self, client: httpx.AsyncClient, to_type: str, deal_ids: list[str]
    ) -> dict[str, list[str]]:
        """{deal_id: [associated object ids]}. The deals/search endpoint doesn't
        support an `associations` field (that's list-endpoint-only), so this is
        a separate v4 batch-associations call per object type."""
        results: dict[str, list[str]] = {}
        for chunk in _chunks(deal_ids, _BATCH_SIZE):
            data = await self._post(
                client,
                f"/crm/v4/associations/deals/{to_type}/batch/read",
                {"inputs": [{"id": deal_id} for deal_id in chunk]},
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
                self._batch_associations(client, "companies", deal_ids),
                self._batch_associations(client, "line_items", deal_ids),
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
