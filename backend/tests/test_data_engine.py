import pytest

from services.data_engine import build_dashboard_snapshot


@pytest.mark.asyncio
async def test_build_dashboard_snapshot_merges_inventory_and_demand():
    snapshot = await build_dashboard_snapshot()

    assert "inventory" in snapshot
    assert "manufacture_orders" in snapshot
    assert "deals" in snapshot

    valve_100 = next(row for row in snapshot["inventory"] if row["sku"] == "CB-VALVE-100")
    assert valve_100["qty_demanded"] == 10
    assert valve_100["net_available"] == 32
