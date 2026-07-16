import httpx

from core.config import settings

_MOCK_INVENTORY = [
    {"part_id": "PN-1001", "sku": "CB-VALVE-100", "qty_on_hand": 42, "location": "Rack A3"},
    {"part_id": "PN-1002", "sku": "CB-VALVE-200", "qty_on_hand": 5, "location": "Rack B1"},
]

_MOCK_MANUFACTURE_ORDERS = [
    {"mo_number": "MO-5001", "part_id": "PN-1001", "qty_ordered": 20, "status": "In Progress"},
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
            json={"username": settings.fishbowl_username, "password": settings.fishbowl_password},
        )
        response.raise_for_status()
        self._token = response.json()["token"]
        return self._token

    async def get_inventory(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_INVENTORY
        async with httpx.AsyncClient(timeout=10) as client:
            token = await self._login(client)
            response = await client.get(
                f"{self._base_url}/api/inventory",
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            return response.json()

    async def get_manufacture_orders(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_MANUFACTURE_ORDERS
        async with httpx.AsyncClient(timeout=10) as client:
            token = await self._login(client)
            response = await client.get(
                f"{self._base_url}/api/mo",
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            return response.json()


fishbowl_client = FishbowlClient()
