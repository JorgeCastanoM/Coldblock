import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.config import settings

_MOCK_DEALS = [
    {"id": "DEAL-1", "dealname": "Acme Corp Q3 Order", "amount": "15000", "dealstage": "closedwon"},
]

_MOCK_LINE_ITEMS = [
    {"id": "LI-1", "sku": "CB-VALVE-100", "quantity": 10, "deal_id": "DEAL-1"},
    {"id": "LI-2", "sku": "CB-VALVE-200", "quantity": 8, "deal_id": "DEAL-1"},
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

    async def get_deals(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_DEALS
        if not settings.hubspot_api_token:
            return []
        async with httpx.AsyncClient(timeout=10) as client:
            data = await self._get(client, "/crm/v3/objects/deals", params={"limit": 100})
            return data.get("results", [])

    async def get_line_items(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_LINE_ITEMS
        if not settings.hubspot_api_token:
            return []
        async with httpx.AsyncClient(timeout=10) as client:
            data = await self._get(client, "/crm/v3/objects/line_items", params={"limit": 100})
            return data.get("results", [])


hubspot_client = HubspotClient()
