import httpx

from core.config import settings

_MOCK_INVENTORY = [
    {"part_id": 1001, "sku": "CB-VALVE-100", "description": "Valve 100", "active": True, "qty_on_hand": 42},
    {"part_id": 1002, "sku": "CB-VALVE-200", "description": "Valve 200", "active": True, "qty_on_hand": 5},
]

# The REST /api/parts endpoint has no stock quantities and caps at 100 rows/page, so
# inventory comes from the read-only data-query endpoint against qtyinventorytotals.
_INVENTORY_QUERY = (
    "SELECT part.id AS part_id, part.num AS sku, part.description AS description, "
    "part.activeflag AS active, COALESCE(qty.qtyonhand, 0) AS qty_on_hand "
    "FROM part LEFT JOIN qtyinventorytotals qty ON qty.partid = part.id "
    "ORDER BY part.num"
)

_MOCK_MANUFACTURE_ORDERS = [
    {
        "mo_number": "MO-5001",
        "bom_number": "BOM-100",
        "so_number": "SO-9001",
        "date_scheduled": "2026-07-20",
        "status": "In Progress",
        "location_group": "Main Floor",
    },
]


class FishbowlClient:
    def __init__(self) -> None:
        self._base_url = settings.fishbowl_base_url
        self._token: str | None = None

    async def _login(self, client: httpx.AsyncClient) -> str:
        if self._token:
            return self._token
        response = await client.post(
            f"{self._base_url}/api/login",
            json={
                "appName": settings.fishbowl_app_name,
                "appId": settings.fishbowl_app_id,
                "appDescription": settings.fishbowl_app_description,
                "appKey": settings.fishbowl_app_key,
                "username": settings.fishbowl_username,
                "password": settings.fishbowl_password,
            },
        )
        response.raise_for_status()
        self._token = response.json()["token"]
        return self._token

    async def logout(self) -> None:
        if not self._token:
            return
        token, self._token = self._token, None
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                response = await client.post(
                    f"{self._base_url}/api/logout",
                    headers={"Authorization": f"Bearer {token}"},
                )
                response.raise_for_status()
            except httpx.HTTPError:
                pass

    async def get_inventory(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_INVENTORY
        async with httpx.AsyncClient(timeout=30) as client:
            token = await self._login(client)
            response = await client.get(
                f"{self._base_url}/api/data-query",
                headers={"Authorization": f"Bearer {token}"},
                params={"query": _INVENTORY_QUERY},
            )
            response.raise_for_status()
            return response.json()

    async def get_manufacture_orders(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_MANUFACTURE_ORDERS
        async with httpx.AsyncClient(timeout=10) as client:
            token = await self._login(client)
            response = await client.get(
                f"{self._base_url}/api/manufacture-orders",
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            orders = response.json()["results"]
            return [
                {
                    "mo_number": order["number"],
                    "bom_number": order.get("bomNumber"),
                    "so_number": order.get("soNumber"),
                    "date_scheduled": order.get("dateScheduled"),
                    "status": order.get("status"),
                    "location_group": order.get("locationGroup"),
                }
                for order in orders
            ]


fishbowl_client = FishbowlClient()
