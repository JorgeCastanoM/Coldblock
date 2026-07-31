import asyncio

import polars as pl

from api.fishbowl import fishbowl_client
from api.hubspot import hubspot_client
from core.config import settings
from services.bom_requirements import all_requirements, requirements_by_sku

# Maps a BOM spreadsheet sheet name to the product section shown on the dashboard.
_SHEET_TO_PRODUCT = {
    "CBS Lid": "CBS Lid",
    "CBM Lid": "CBM Lid",
    "CBL Lid": "CBL Lid",
    "CBDC-2CH-G3": "Mini Controller",
    "CBLMS Heater": "Heater",
    "Stands": "Test Tube Stands",
    "Tubes": "Test Tubes",
    "Extras": "Extras",
}

_PRODUCT_ORDER = [
    "CBS Lid",
    "Plastic CBS Lid",
    "CBM Lid",
    "CBL Lid",
    "Mini Controller",
    "Heater",
    "Test Tube Stands",
    "Test Tubes",
    "Extras",
    "Other",
]

# Finished-good Fishbowl SKU for each assemble-able product section.
FINISHED_SKU_BY_PRODUCT = {
    "CBS Lid": "L3CBS001",
    "CBM Lid": "L3CBM001",
    "CBL Lid": "L3CBL001",
    "Mini Controller": "C3MNC001",
    "Heater": "H3LMS001",
}
_FINISHED_SKU_BY_PRODUCT = FINISHED_SKU_BY_PRODUCT
FINISHED_SKUS = frozenset(FINISHED_SKU_BY_PRODUCT.values())

# Fallback for live Fishbowl parts that have no BOM entry yet. Product sections
# that have an explicit manufacturing list (lids, Mini Controller, etc.) are
# BOM-only — prefix matching must not inflate them with unrelated inventory.
_PREFIX_TO_PRODUCTS = [
    ("H3", ["Heater"]),
    ("S3", ["Test Tube Stands"]),
    ("T3", ["Extras"]),
    ("U3", ["Test Tubes"]),
]


def _product_for_requirement(req: dict) -> str | None:
    # The CBS Lid sheet holds two products: metal/coated and plastic. Route them
    # to separate dashboard sections; ignore the coated/plastic label in the UI.
    if req["sheet"] == "CBS Lid" and req.get("variant") == "plastic":
        return "Plastic CBS Lid"
    return _SHEET_TO_PRODUCT.get(req["sheet"])


def _products_for(record: dict) -> list[str]:
    names = []
    for req in record.get("bom_requirements", []):
        product = _product_for_requirement(req)
        if product and product not in names:
            names.append(product)
    if names:
        return names
    sku = record.get("sku") or ""
    for prefix, products in _PREFIX_TO_PRODUCTS:
        if sku.startswith(prefix):
            return products
    return ["Other"]


def _last_cost_by_sku(purchase_orders: list[dict]) -> dict[str, dict]:
    """Most recent unit cost paid per part, from real PO line items.

    Skips Void POs — a voided order's stated price was never actually paid.
    Fishbowl's date strings are ISO 8601, which sort correctly as plain
    strings, so no datetime parsing is needed to find the most recent one.
    """
    latest: dict[str, dict] = {}
    for po in purchase_orders:
        if po.get("status") == "Void":
            continue
        effective_date = po.get("date_issued") or po.get("date_created") or ""
        for item in po.get("items", []):
            sku = item.get("sku")
            unit_cost = item.get("unit_cost")
            if not sku or unit_cost is None:
                continue
            current = latest.get(sku)
            if current is None or effective_date > current["date"]:
                latest[sku] = {
                    "unit_cost": unit_cost,
                    "currency": po.get("currency") or "CAD",
                    "date": effective_date,
                    "po_number": po.get("po_number"),
                }
    return latest


def _attach_cost_info(part: dict, last_cost_by_sku: dict[str, dict]) -> None:
    cost_info = last_cost_by_sku.get(part["sku"])
    if not cost_info:
        part["last_unit_cost"] = None
        part["last_currency"] = None
        part["last_purchase_date"] = None
        part["estimated_cost"] = None
        return

    part["last_unit_cost"] = cost_info["unit_cost"]
    part["last_currency"] = cost_info["currency"]
    part["last_purchase_date"] = cost_info["date"] or None

    req_per_unit = part["requirements"][0]["req_per_unit"] if part["requirements"] else None
    try:
        req = float(req_per_unit) if req_per_unit is not None else None
    except (TypeError, ValueError):
        req = None
    part["estimated_cost"] = cost_info["unit_cost"] * req if req is not None else None


def _empty_part(sku: str, description: str | None) -> dict:
    return {
        "sku": sku,
        "description": description,
        "qty_on_hand": 0,
        "qty_demanded": 0,
        "net_available": 0,
        "requirements": [],
    }


def _group_by_product(inventory_records: list[dict], last_cost_by_sku: dict[str, dict]) -> list[dict]:
    """Build each product section from its BOM list, then overlay Fishbowl qty.

    This keeps CBS Lid / Plastic CBS Lid exact to the manufacturing lists instead
    of dumping every L3CBG* inventory row into CBS Lid via prefix matching.
    """
    inventory_by_sku = {record["sku"]: record for record in inventory_records}
    grouped: dict[str, dict[str, dict]] = {name: {} for name in _PRODUCT_ORDER}

    for req in all_requirements():
        sku = req.get("fb_part_number")
        if not sku:
            continue
        product = _product_for_requirement(req)
        if not product:
            continue

        parts = grouped[product]
        if sku not in parts:
            inv = inventory_by_sku.get(sku)
            if inv:
                parts[sku] = {
                    "sku": sku,
                    "description": inv.get("description") or req.get("description"),
                    "qty_on_hand": inv.get("qty_on_hand"),
                    "qty_demanded": inv.get("qty_demanded"),
                    "net_available": inv.get("net_available"),
                    "requirements": [],
                }
            else:
                parts[sku] = _empty_part(sku, req.get("description"))

        # One qty per product — no coated/plastic labels exposed to the UI.
        if not parts[sku]["requirements"]:
            parts[sku]["requirements"].append({"req_per_unit": req["req_per_unit"]})

    # Inventory SKUs with no BOM entry still land somewhere via prefix / Other.
    for record in inventory_records:
        if record.get("bom_requirements"):
            continue
        for product in _products_for(record):
            if record["sku"] in grouped[product]:
                continue
            grouped[product][record["sku"]] = {
                "sku": record.get("sku"),
                "description": record.get("description"),
                "qty_on_hand": record.get("qty_on_hand"),
                "qty_demanded": record.get("qty_demanded"),
                "net_available": record.get("net_available"),
                "requirements": [],
            }

    sections = []
    for name in _PRODUCT_ORDER:
        parts = list(grouped[name].values())
        if not parts:
            continue
        for part in parts:
            _attach_cost_info(part, last_cost_by_sku)
        priced = [part for part in parts if part["estimated_cost"] is not None]

        # Summed per currency, not blended into one number — a section can mix
        # CAD-sourced parts with USD-sourced hardware (e.g. McMaster), and those
        # are not the same unit without a real exchange rate (see _last_cost_by_sku).
        build_cost_by_currency: dict[str, float] = {}
        for part in priced:
            currency = part["last_currency"] or "CAD"
            build_cost_by_currency[currency] = build_cost_by_currency.get(currency, 0) + part["estimated_cost"]

        finished_sku = _FINISHED_SKU_BY_PRODUCT.get(name)
        finished_inv = inventory_by_sku.get(finished_sku) if finished_sku else None
        finished_qty = finished_inv.get("qty_on_hand") if finished_inv else (0 if finished_sku else None)

        sections.append(
            {
                "name": name,
                "parts": parts,
                "finished_sku": finished_sku,
                "finished_qty_on_hand": finished_qty,
                "estimated_build_cost_by_currency": build_cost_by_currency,
                "priced_part_count": len(priced),
                "total_part_count": len(parts),
            }
        )
    return sections


async def build_dashboard_snapshot() -> dict:
    inventory, manufacture_orders, sales_orders, purchase_orders, deals, conference_contacts, line_items = (
        await _fetch_all()
    )

    if inventory:
        inventory_df = pl.DataFrame(inventory)
    else:
        inventory_df = pl.DataFrame(schema={"sku": pl.Utf8, "description": pl.Utf8, "qty_on_hand": pl.Int64})

    if line_items:
        line_items_df = pl.DataFrame(line_items)
        demand_df = line_items_df.group_by("sku").agg(pl.col("quantity").sum().alias("qty_demanded"))
    else:
        demand_df = pl.DataFrame(schema={"sku": pl.Utf8, "qty_demanded": pl.Int64})

    merged = (
        inventory_df.join(demand_df, on="sku", how="left")
        .with_columns(pl.col("qty_demanded").fill_null(0))
        .with_columns((pl.col("qty_on_hand") - pl.col("qty_demanded")).alias("net_available"))
    )

    bom_index = requirements_by_sku()
    inventory_records = merged.to_dicts()
    for record in inventory_records:
        record["bom_requirements"] = bom_index.get(record["sku"], [])

    last_cost_by_sku = _last_cost_by_sku(purchase_orders)

    return {
        "inventory": inventory_records,
        "products": _group_by_product(inventory_records, last_cost_by_sku),
        "manufacture_orders": manufacture_orders,
        "sales_orders": sales_orders,
        "purchase_orders": purchase_orders,
        "deals": deals,
        "conference_contacts": conference_contacts,
    }


def _line_items_from_deals(deals: list[dict]) -> list[dict]:
    """Demand signal for the parts merge: SKU quantities from open deals only —
    a closed-lost or closed-won deal isn't outstanding demand anymore."""
    line_items = []
    for deal in deals:
        if deal.get("is_closed"):
            continue
        for item in deal.get("items", []):
            sku = item.get("sku")
            if not sku:
                continue
            try:
                quantity = float(item.get("quantity") or 0)
            except (TypeError, ValueError):
                continue
            line_items.append({"sku": sku, "quantity": quantity, "deal_id": deal.get("deal_id")})
    return line_items


async def _fetch_all() -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict], list[dict], list[dict]]:
    if settings.enable_fishbowl:
        # One Fishbowl login covers every Fishbowl read below (get_inventory's login
        # call caches the token; the later calls reuse it), then one logout releases the seat.
        try:
            inventory = await fishbowl_client.get_inventory()
            manufacture_orders = await fishbowl_client.get_manufacture_orders()
            sales_orders = await fishbowl_client.get_sales_orders()
            purchase_orders = await fishbowl_client.get_purchase_orders()
        finally:
            await fishbowl_client.logout()
    else:
        inventory, manufacture_orders, sales_orders, purchase_orders = [], [], [], []

    # HubSpot has no Fishbowl-style seat limit, so these two independent reads
    # run concurrently rather than one-after-the-other.
    deals, conference_contacts = await asyncio.gather(
        hubspot_client.get_deals(), hubspot_client.get_conference_contacts()
    )
    line_items = _line_items_from_deals(deals)
    return inventory, manufacture_orders, sales_orders, purchase_orders, deals, conference_contacts, line_items
