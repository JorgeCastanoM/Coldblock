import pytest

from services.data_engine import _products_for, build_dashboard_snapshot


@pytest.mark.asyncio
async def test_build_dashboard_snapshot_merges_inventory_and_demand():
    snapshot = await build_dashboard_snapshot()

    assert "inventory" in snapshot
    assert "manufacture_orders" in snapshot
    assert "deals" in snapshot

    valve_100 = next(row for row in snapshot["inventory"] if row["sku"] == "CB-VALVE-100")
    assert valve_100["qty_demanded"] == 10
    assert valve_100["net_available"] == 32


@pytest.mark.asyncio
async def test_snapshot_groups_parts_by_product():
    snapshot = await build_dashboard_snapshot()

    assert "products" in snapshot
    names = [group["name"] for group in snapshot["products"]]
    # Mock SKUs (CB-VALVE-*) match no BOM sheet or prefix, so they land in Other.
    assert names == ["Other"]
    other = snapshot["products"][0]
    assert {part["sku"] for part in other["parts"]} == {"CB-VALVE-100", "CB-VALVE-200"}


def test_products_for_uses_bom_sheet_over_prefix():
    record = {
        "sku": "A3HSE002",
        "bom_requirements": [
            {"sheet": "CBL Lid", "variant": "coated", "req_per_unit": 1},
            {"sheet": "CBM Lid", "variant": "coated", "req_per_unit": 1},
        ],
    }
    assert _products_for(record) == ["CBL Lid", "CBM Lid"]


def test_products_for_falls_back_to_sku_prefix():
    assert _products_for({"sku": "L3CBG003", "bom_requirements": []}) == ["CBS Lid", "CBM Lid", "CBL Lid"]
    assert _products_for({"sku": "C3MNC099", "bom_requirements": []}) == ["Mini Controller"]
    assert _products_for({"sku": "ZZZ", "bom_requirements": []}) == ["Other"]
