import polars as pl

from api.fishbowl import fishbowl_client
from api.hubspot import hubspot_client
from services.bom_requirements import requirements_by_sku

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
    "CBM Lid",
    "CBL Lid",
    "Mini Controller",
    "Heater",
    "Test Tube Stands",
    "Test Tubes",
    "Extras",
    "Other",
]

# Fallback for live Fishbowl parts that have no BOM entry yet: the part-number
# prefix encodes the sub-assembly (L3CBG = hardware shared by all three lids).
_PREFIX_TO_PRODUCTS = [
    ("L3CBS", ["CBS Lid"]),
    ("L3CBM", ["CBM Lid"]),
    ("L3CBL", ["CBL Lid"]),
    ("L3CBG", ["CBS Lid", "CBM Lid", "CBL Lid"]),
    ("C2", ["Mini Controller"]),
    ("C3", ["Mini Controller"]),
    ("H3", ["Heater"]),
    ("S3", ["Test Tube Stands"]),
    ("T3", ["Extras"]),
    ("U3", ["Test Tubes"]),
]


def _products_for(record: dict) -> list[str]:
    names = []
    for req in record.get("bom_requirements", []):
        product = _SHEET_TO_PRODUCT.get(req["sheet"])
        if product and product not in names:
            names.append(product)
    if names:
        return names
    sku = record.get("sku") or ""
    for prefix, products in _PREFIX_TO_PRODUCTS:
        if sku.startswith(prefix):
            return products
    return ["Other"]


def _group_by_product(inventory_records: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = {name: [] for name in _PRODUCT_ORDER}
    for record in inventory_records:
        for product in _products_for(record):
            grouped[product].append(
                {
                    "sku": record.get("sku"),
                    "description": record.get("description"),
                    "qty_on_hand": record.get("qty_on_hand"),
                    "qty_demanded": record.get("qty_demanded"),
                    "net_available": record.get("net_available"),
                    "requirements": [
                        {"variant": req["variant"], "req_per_unit": req["req_per_unit"]}
                        for req in record.get("bom_requirements", [])
                        if _SHEET_TO_PRODUCT.get(req["sheet"]) == product
                    ],
                }
            )
    return [{"name": name, "parts": grouped[name]} for name in _PRODUCT_ORDER if grouped[name]]


async def build_dashboard_snapshot() -> dict:
    inventory, manufacture_orders, deals, line_items = await _fetch_all()

    inventory_df = pl.DataFrame(inventory)

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

    return {
        "inventory": inventory_records,
        "products": _group_by_product(inventory_records),
        "manufacture_orders": manufacture_orders,
        "deals": deals,
    }


async def _fetch_all() -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    try:
        inventory = await fishbowl_client.get_inventory()
        manufacture_orders = await fishbowl_client.get_manufacture_orders()
    finally:
        await fishbowl_client.logout()

    deals = await hubspot_client.get_deals()
    line_items = await hubspot_client.get_line_items()
    return inventory, manufacture_orders, deals, line_items
