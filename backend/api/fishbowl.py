import re

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

# Fishbowl has no list endpoint for sales orders; read them via data-query.
_SALES_ORDERS_QUERY = (
    "SELECT so.num AS so_number, so.statusId AS status_id, customer.name AS customer, "
    "so.dateCreated AS date_created, so.dateIssued AS date_issued, so.totalPrice AS total "
    "FROM so LEFT JOIN customer ON customer.id = so.customerId "
    "WHERE so.statusId NOT IN (85, 95) "
    "ORDER BY so.dateCreated DESC"
)

_SALES_ORDER_ITEMS_QUERY = (
    "SELECT so.num AS so_number, soitem.soLineItem AS line_number, "
    "soitem.productNum AS sku, soitem.description AS description, "
    "soitem.qtyOrdered AS qty_ordered, soitem.qtyFulfilled AS qty_fulfilled, "
    "soitem.qtyPicked AS qty_picked, soitem.qtyToFulfill AS qty_to_fulfill, "
    "soitem.unitPrice AS unit_price, soitem.totalPrice AS line_total, "
    "soitem.statusId AS item_status_id "
    "FROM soitem INNER JOIN so ON so.id = soitem.soId "
    "WHERE so.statusId NOT IN (85, 95) "
    "ORDER BY so.num, soitem.soLineItem"
)

_SO_STATUS_NAMES = {
    10: "Estimate",
    20: "Issued",
    25: "In Progress",
    30: "Picked",
    40: "Partial",
    50: "Picked Short",
    60: "Fulfilled",
    70: "Closed Short",
    80: "Void",
    85: "Cancelled",
    95: "Historical",
}

_SO_ITEM_STATUS_NAMES = {
    10: "Entered",
    14: "Pending",
    20: "Picked",
    30: "Partial",
    40: "Fulfilled",
    50: "Closed Short",
    60: "Void",
}

_MOCK_SALES_ORDERS = [
    {
        "so_number": "SO-9001",
        "status": "Issued",
        "customer": "Acme Corp",
        "date_created": "2026-07-10",
        "date_issued": "2026-07-12",
        "total": 15000.0,
        "items": [
            {
                "line_number": 1,
                "sku": "CBS-LID",
                "description": "CBS Lid Assembly",
                "qty_ordered": 2,
                "qty_fulfilled": 0,
                "qty_picked": 0,
                "qty_to_fulfill": 2,
                "unit_price": 5000.0,
                "line_total": 10000.0,
                "status": "Entered",
            },
            {
                "line_number": 2,
                "sku": "CB-VALVE-100",
                "description": "Valve 100",
                "qty_ordered": 10,
                "qty_fulfilled": 0,
                "qty_picked": 4,
                "qty_to_fulfill": 10,
                "unit_price": 500.0,
                "line_total": 5000.0,
                "status": "Picked",
            },
        ],
    },
    {
        "so_number": "SO-9002",
        "status": "In Progress",
        "customer": "North Lab",
        "date_created": "2026-07-15",
        "date_issued": "2026-07-16",
        "total": 8200.5,
        "items": [
            {
                "line_number": 1,
                "sku": "CBM-LID",
                "description": "CBM Lid Assembly",
                "qty_ordered": 1,
                "qty_fulfilled": 1,
                "qty_picked": 1,
                "qty_to_fulfill": 1,
                "unit_price": 8200.5,
                "line_total": 8200.5,
                "status": "Fulfilled",
            },
        ],
    },
]


# po/poitem status names come from Fishbowl's own postatus lookup table (joined
# directly in SQL below) rather than a hardcoded map, since it's an actual table.
# Fishbowl's exchange rate for non-home currencies is stuck at 1.0 in this
# instance (never actually configured), so poitem.unitCost for a USD PO is a raw
# USD amount with no real conversion applied. Rather than silently mislabeling
# that as CAD, every price carries its real source currency code from here on.
_PURCHASE_ORDERS_QUERY = (
    "SELECT po.num AS po_number, po.statusId AS status_id, postatus.name AS status_name, "
    "vendor.name AS vendor, po.dateCreated AS date_created, po.dateIssued AS date_issued, "
    "currency.code AS currency, COALESCE(item_totals.total, 0) AS total "
    "FROM po "
    "LEFT JOIN vendor ON vendor.id = po.vendorId "
    "LEFT JOIN postatus ON postatus.id = po.statusId "
    "LEFT JOIN currency ON currency.id = po.currencyId "
    "LEFT JOIN (SELECT poId, SUM(totalCost) AS total FROM poitem GROUP BY poId) AS item_totals "
    "ON item_totals.poId = po.id "
    "WHERE po.statusId != 95 "
    "ORDER BY po.dateCreated DESC"
)

_PURCHASE_ORDER_ITEMS_QUERY = (
    "SELECT po.num AS po_number, poitem.poLineItem AS line_number, "
    "poitem.partNum AS sku, poitem.description AS description, "
    "poitem.qtyFulfilled AS qty_fulfilled, poitem.qtyPicked AS qty_picked, "
    "poitem.qtyToFulfill AS qty_to_fulfill, poitem.unitCost AS unit_cost, "
    "poitem.totalCost AS line_total, poitem.statusId AS item_status_id, "
    "itemstatus.name AS item_status_name "
    "FROM poitem "
    "INNER JOIN po ON po.id = poitem.poId "
    "LEFT JOIN postatus AS itemstatus ON itemstatus.id = poitem.statusId "
    "WHERE po.statusId != 95 "
    "ORDER BY po.num, poitem.poLineItem"
)

# On-hand serials live in serial/serialnum. Shipped/consumed serials are removed
# from those tables, so history comes from inventory-log tracking instead.
_SERIALS_ON_HAND_QUERY_TEMPLATE = (
    "SELECT DISTINCT serialnum.serialNum AS serial_number, "
    "location.name AS location, "
    "COALESCE(tag.qty, 0) AS qty, "
    "CASE WHEN serial.committedFlag = 1 THEN 1 ELSE 0 END AS committed "
    "FROM serialnum "
    "INNER JOIN serial ON serial.id = serialnum.serialId "
    "INNER JOIN tag ON tag.id = serial.tagId "
    "INNER JOIN part ON part.id = tag.partId "
    "LEFT JOIN location ON location.id = tag.locationId "
    "INNER JOIN parttracking ON parttracking.id = serialnum.partTrackingId "
    "WHERE part.num = '{sku}' "
    "AND (parttracking.name = 'Serial Number' OR parttracking.typeId = 40) "
    "ORDER BY serialnum.serialNum"
)

_SERIALS_HISTORY_QUERY_TEMPLATE = (
    "SELECT DISTINCT tiinventorylogsn.serialNum AS serial_number "
    "FROM tiinventorylogsn "
    "INNER JOIN tiinventorylog ON tiinventorylog.id = tiinventorylogsn.tiInventoryLogId "
    "INNER JOIN inventorylog ON inventorylog.id = tiinventorylog.inventoryLogId "
    "INNER JOIN part ON part.id = inventorylog.partId "
    "INNER JOIN parttracking ON parttracking.id = tiinventorylogsn.partTrackingId "
    "WHERE part.num = '{sku}' "
    "AND (parttracking.name = 'Serial Number' OR parttracking.typeId = 40) "
    "ORDER BY tiinventorylogsn.serialNum"
)

_MOCK_SERIALS_BY_SKU = {
    "L3CBS001": [
        {"serial_number": "CBS-1001", "location": "Main Floor", "qty": 1, "committed": False},
        {"serial_number": "CBS-1002", "location": "Main Floor", "qty": 1, "committed": False},
        {"serial_number": "CBS-1003", "location": "Shipping", "qty": 1, "committed": True},
        {"serial_number": "CBS-0990", "location": None, "qty": 0, "committed": False},
    ],
    "L3CBM001": [
        {"serial_number": "CBM-2001", "location": "Main Floor", "qty": 1, "committed": False},
        {"serial_number": "CBM-1988", "location": None, "qty": 0, "committed": False},
    ],
    "L3CBL001": [
        {"serial_number": "CBL-3001", "location": "Main Floor", "qty": 1, "committed": False},
        {"serial_number": "CBL-3002", "location": "Main Floor", "qty": 1, "committed": False},
    ],
    "C3MNC001": [
        {"serial_number": "MNC-4001", "location": "Main Floor", "qty": 1, "committed": False},
    ],
    "H3LMS001": [
        {"serial_number": "HTR-5001", "location": "Main Floor", "qty": 1, "committed": False},
        {"serial_number": "HTR-5002", "location": "QC Hold", "qty": 1, "committed": False},
    ],
}

_MOCK_PURCHASE_ORDERS = [
    {
        "po_number": "PO-501",
        "status": "Issued",
        "vendor": "Profile Products",
        "date_created": "2026-07-08",
        "date_issued": "2026-07-09",
        "currency": "CAD",
        "total": 4200.0,
        "items": [
            {
                "line_number": 1,
                "sku": "H3LMS001",
                "description": "Heater Core Half",
                "qty_ordered": 20,
                "qty_fulfilled": 0,
                "qty_picked": 0,
                "qty_to_fulfill": 20,
                "unit_cost": 210.0,
                "line_total": 4200.0,
                "status": "Issued",
            },
        ],
    },
    {
        "po_number": "PO-498",
        "status": "Fulfilled",
        "vendor": "McMaster-Carr",
        "date_created": "2026-06-20",
        "date_issued": "2026-06-21",
        "currency": "USD",
        "total": 512.5,
        "items": [
            {
                "line_number": 1,
                "sku": "L3CBG004",
                "description": "SS Hex Drive Flat Head Screw",
                "qty_ordered": 500,
                "qty_fulfilled": 500,
                "qty_picked": 500,
                "qty_to_fulfill": 0,
                "unit_cost": 1.025,
                "line_total": 512.5,
                "status": "Fulfilled",
            },
        ],
    },
]


def _as_int(value) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


# Fishbowl emits offsets like "-04" (hour only). Browsers require "-04:00",
# so `new Date(...)` returns Invalid Date and year bucketing silently fails.
# Requires a real "THH:MM:SS" time component before the offset — a bare date
# like "2026-07-01" ends in "-01" too and must not be mistaken for one.
_SHORT_TZ_OFFSET = re.compile(r"T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2})$")


def _coerce_fishbowl_date(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        from datetime import datetime, timezone

        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
    text = str(value).strip()
    if text.isdigit():
        return _coerce_fishbowl_date(int(text))
    if _SHORT_TZ_OFFSET.search(text):
        text = f"{text}:00"
    return text


def _normalize_sales_order_item(row: dict) -> dict:
    status_id = _as_int(row.get("item_status_id"))
    return {
        "line_number": row.get("line_number"),
        "sku": row.get("sku"),
        "description": row.get("description"),
        "qty_ordered": row.get("qty_ordered"),
        "qty_fulfilled": row.get("qty_fulfilled"),
        "qty_picked": row.get("qty_picked"),
        "qty_to_fulfill": row.get("qty_to_fulfill"),
        "unit_price": row.get("unit_price"),
        "line_total": row.get("line_total"),
        "status": _SO_ITEM_STATUS_NAMES.get(
            status_id, str(status_id) if status_id is not None else "Unknown"
        ),
    }


def _normalize_sales_order(row: dict, items: list[dict] | None = None) -> dict:
    status_id = _as_int(row.get("status_id"))
    return {
        "so_number": row.get("so_number"),
        "status": _SO_STATUS_NAMES.get(status_id, str(status_id) if status_id is not None else "Unknown"),
        "customer": row.get("customer"),
        "date_created": _coerce_fishbowl_date(row.get("date_created")),
        "date_issued": _coerce_fishbowl_date(row.get("date_issued")),
        "total": row.get("total"),
        "items": items or [],
    }


def _normalize_purchase_order_item(row: dict) -> dict:
    qty_fulfilled = row.get("qty_fulfilled")
    qty_to_fulfill = row.get("qty_to_fulfill")
    try:
        ordered = (float(qty_to_fulfill or 0) + float(qty_fulfilled or 0)) or None
    except (TypeError, ValueError):
        ordered = qty_to_fulfill
    return {
        "line_number": row.get("line_number"),
        "sku": row.get("sku"),
        "description": row.get("description"),
        "qty_ordered": ordered,
        "qty_fulfilled": qty_fulfilled,
        "qty_picked": row.get("qty_picked"),
        "qty_to_fulfill": qty_to_fulfill,
        "unit_cost": row.get("unit_cost"),
        "line_total": row.get("line_total"),
        "status": row.get("item_status_name") or "Unknown",
    }


def _normalize_purchase_order(row: dict, items: list[dict] | None = None) -> dict:
    return {
        "po_number": row.get("po_number"),
        "status": row.get("status_name") or "Unknown",
        "vendor": row.get("vendor"),
        "date_created": _coerce_fishbowl_date(row.get("date_created")),
        "date_issued": _coerce_fishbowl_date(row.get("date_issued")),
        "currency": row.get("currency") or "CAD",
        "total": row.get("total"),
        "items": items or [],
    }


def _rows_from_query(payload) -> list:
    if isinstance(payload, dict):
        return payload.get("results", payload.get("data", []))
    return payload


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
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError:
            self._token = None
            raise
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

    async def get_sales_orders(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_SALES_ORDERS
        async with httpx.AsyncClient(timeout=60) as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}

            orders_response = await client.get(
                f"{self._base_url}/api/data-query",
                headers=headers,
                params={"query": _SALES_ORDERS_QUERY},
            )
            orders_response.raise_for_status()

            items_response = await client.get(
                f"{self._base_url}/api/data-query",
                headers=headers,
                params={"query": _SALES_ORDER_ITEMS_QUERY},
            )
            items_response.raise_for_status()

            items_by_so: dict[str, list[dict]] = {}
            for row in _rows_from_query(items_response.json()):
                so_number = row.get("so_number")
                if not so_number:
                    continue
                items_by_so.setdefault(so_number, []).append(_normalize_sales_order_item(row))

            return [
                _normalize_sales_order(row, items_by_so.get(row.get("so_number"), []))
                for row in _rows_from_query(orders_response.json())
            ]

    async def get_purchase_orders(self) -> list[dict]:
        if settings.use_mock_data:
            return _MOCK_PURCHASE_ORDERS
        async with httpx.AsyncClient(timeout=60) as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}

            orders_response = await client.get(
                f"{self._base_url}/api/data-query",
                headers=headers,
                params={"query": _PURCHASE_ORDERS_QUERY},
            )
            orders_response.raise_for_status()

            items_response = await client.get(
                f"{self._base_url}/api/data-query",
                headers=headers,
                params={"query": _PURCHASE_ORDER_ITEMS_QUERY},
            )
            items_response.raise_for_status()

            items_by_po: dict[str, list[dict]] = {}
            for row in _rows_from_query(items_response.json()):
                po_number = row.get("po_number")
                if not po_number:
                    continue
                items_by_po.setdefault(po_number, []).append(_normalize_purchase_order_item(row))

            return [
                _normalize_purchase_order(row, items_by_po.get(row.get("po_number"), []))
                for row in _rows_from_query(orders_response.json())
            ]

    async def get_serial_numbers(self, sku: str) -> list[dict]:
        if settings.use_mock_data:
            return list(_MOCK_SERIALS_BY_SKU.get(sku, []))

        safe_sku = sku.replace("'", "''")
        on_hand_query = _SERIALS_ON_HAND_QUERY_TEMPLATE.format(sku=safe_sku)
        history_query = _SERIALS_HISTORY_QUERY_TEMPLATE.format(sku=safe_sku)

        async with httpx.AsyncClient(timeout=60) as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}

            on_hand_response = await client.get(
                f"{self._base_url}/api/data-query",
                headers=headers,
                params={"query": on_hand_query},
            )
            on_hand_response.raise_for_status()

            history_response = await client.get(
                f"{self._base_url}/api/data-query",
                headers=headers,
                params={"query": history_query},
            )
            history_response.raise_for_status()

        by_serial: dict[str, dict] = {}
        for row in _rows_from_query(history_response.json()):
            serial = row.get("serial_number")
            if not serial:
                continue
            by_serial[serial] = {
                "serial_number": serial,
                "location": None,
                "qty": 0,
                "committed": False,
            }

        for row in _rows_from_query(on_hand_response.json()):
            serial = row.get("serial_number")
            if not serial:
                continue
            by_serial[serial] = {
                "serial_number": serial,
                "location": row.get("location"),
                "qty": row.get("qty") if row.get("qty") is not None else 0,
                "committed": bool(_as_int(row.get("committed")) or 0),
            }

        return sorted(by_serial.values(), key=lambda item: str(item["serial_number"]))


fishbowl_client = FishbowlClient()
