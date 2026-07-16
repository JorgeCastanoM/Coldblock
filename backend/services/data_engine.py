import polars as pl

from api.fishbowl import fishbowl_client
from api.hubspot import hubspot_client


async def build_dashboard_snapshot() -> dict:
    inventory, manufacture_orders, deals, line_items = await _fetch_all()

    inventory_df = pl.DataFrame(inventory)
    line_items_df = pl.DataFrame(line_items)

    demand_df = line_items_df.group_by("sku").agg(pl.col("quantity").sum().alias("qty_demanded"))

    merged = (
        inventory_df.join(demand_df, on="sku", how="left")
        .with_columns(pl.col("qty_demanded").fill_null(0))
        .with_columns((pl.col("qty_on_hand") - pl.col("qty_demanded")).alias("net_available"))
    )

    return {
        "inventory": merged.to_dicts(),
        "manufacture_orders": manufacture_orders,
        "deals": deals,
    }


async def _fetch_all() -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    inventory = await fishbowl_client.get_inventory()
    manufacture_orders = await fishbowl_client.get_manufacture_orders()
    deals = await hubspot_client.get_deals()
    line_items = await hubspot_client.get_line_items()
    return inventory, manufacture_orders, deals, line_items
