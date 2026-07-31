from unittest.mock import AsyncMock, patch

import pytest

from core.config import settings
from services.data_engine import (
    _attach_cost_info,
    _group_by_product,
    _last_cost_by_sku,
    _line_items_from_deals,
    _products_for,
    build_dashboard_snapshot,
)


@pytest.mark.asyncio
async def test_build_dashboard_snapshot_merges_inventory_and_demand():
    snapshot = await build_dashboard_snapshot()

    assert "inventory" in snapshot
    assert "manufacture_orders" in snapshot
    assert "sales_orders" in snapshot
    assert "purchase_orders" in snapshot
    assert "deals" in snapshot
    assert "conference_contacts" in snapshot

    valve_100 = next(row for row in snapshot["inventory"] if row["sku"] == "CB-VALVE-100")
    assert valve_100["qty_demanded"] == 10
    assert valve_100["net_available"] == 32


@pytest.mark.asyncio
async def test_snapshot_groups_parts_by_product():
    snapshot = await build_dashboard_snapshot()

    assert "products" in snapshot
    # Every BOM sheet contributes its own product section (populated from the BOM
    # reference data regardless of live inventory), plus Other for unmatched SKUs.
    names = {group["name"] for group in snapshot["products"]}
    assert "Other" in names
    assert "CBS Lid" in names

    other = next(group for group in snapshot["products"] if group["name"] == "Other")
    # Mock SKUs (CB-VALVE-*) match no BOM sheet or prefix, so they land in Other.
    assert {"CB-VALVE-100", "CB-VALVE-200"}.issubset({part["sku"] for part in other["parts"]})


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
    # Products with an explicit BOM list are BOM-only; unmatched SKUs go to Other.
    assert _products_for({"sku": "L3CBG003", "bom_requirements": []}) == ["Other"]
    assert _products_for({"sku": "C3MNC099", "bom_requirements": []}) == ["Other"]
    assert _products_for({"sku": "H3ABC001", "bom_requirements": []}) == ["Heater"]
    assert _products_for({"sku": "ZZZ", "bom_requirements": []}) == ["Other"]


@pytest.mark.asyncio
async def test_dashboard_summary_opens_exactly_one_fishbowl_session():
    """A dashboard load must log into Fishbowl once, not once per data type —
    that's the whole point of folding sales/purchase orders into the same fetch
    cycle as inventory/manufacture orders (see _fetch_all)."""
    with (
        patch("services.data_engine.fishbowl_client.get_inventory", new=AsyncMock(return_value=[])),
        patch("services.data_engine.fishbowl_client.get_manufacture_orders", new=AsyncMock(return_value=[])),
        patch("services.data_engine.fishbowl_client.get_sales_orders", new=AsyncMock(return_value=[])),
        patch("services.data_engine.fishbowl_client.get_purchase_orders", new=AsyncMock(return_value=[])),
        patch("services.data_engine.fishbowl_client.logout", new=AsyncMock(return_value=None)) as logout_mock,
    ):
        snapshot = await build_dashboard_snapshot()

    assert snapshot["sales_orders"] == []
    assert snapshot["purchase_orders"] == []
    logout_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_dashboard_summary_skips_fishbowl_when_disabled():
    """A public deployment has no Tailscale route to Fishbowl — with the flag off,
    Fishbowl-derived fields must come back empty instead of hanging/erroring, and
    Fishbowl must never even be called."""
    with (
        patch.object(settings, "enable_fishbowl", False),
        patch("services.data_engine.fishbowl_client.get_inventory", new=AsyncMock()) as get_inventory_mock,
        patch("services.data_engine.fishbowl_client.logout", new=AsyncMock()) as logout_mock,
    ):
        snapshot = await build_dashboard_snapshot()

    assert snapshot["inventory"] == []
    assert snapshot["manufacture_orders"] == []
    assert snapshot["sales_orders"] == []
    assert snapshot["purchase_orders"] == []
    assert "deals" in snapshot
    get_inventory_mock.assert_not_awaited()
    logout_mock.assert_not_awaited()


def test_last_cost_by_sku_picks_most_recent_and_skips_void():
    purchase_orders = [
        {
            "po_number": "PO-1",
            "status": "Fulfilled",
            "date_issued": "2026-01-01",
            "items": [{"sku": "L3CBG004", "unit_cost": 1.00}],
        },
        {
            "po_number": "PO-2",
            "status": "Fulfilled",
            "date_issued": "2026-06-01",
            "items": [{"sku": "L3CBG004", "unit_cost": 1.25}],
        },
        {
            # Later date, but voided — the stated price was never actually paid.
            "po_number": "PO-3",
            "status": "Void",
            "date_issued": "2026-09-01",
            "items": [{"sku": "L3CBG004", "unit_cost": 99.00}],
        },
    ]
    latest = _last_cost_by_sku(purchase_orders)
    assert latest["L3CBG004"]["unit_cost"] == 1.25
    assert latest["L3CBG004"]["po_number"] == "PO-2"


def test_last_cost_by_sku_defaults_missing_currency_to_cad():
    purchase_orders = [{"po_number": "PO-1", "date_issued": "2026-01-01", "items": [{"sku": "X", "unit_cost": 1}]}]
    assert _last_cost_by_sku(purchase_orders)["X"]["currency"] == "CAD"


def test_attach_cost_info_multiplies_by_req_per_unit():
    part = {"sku": "L3CBG004", "requirements": [{"req_per_unit": 14}]}
    _attach_cost_info(
        part,
        {"L3CBG004": {"unit_cost": 1.25, "currency": "USD", "date": "2026-06-01", "po_number": "PO-2"}},
    )
    assert part["last_unit_cost"] == 1.25
    assert part["last_currency"] == "USD"
    assert part["estimated_cost"] == 17.5


def test_attach_cost_info_handles_missing_purchase_history():
    part = {"sku": "NEVER-BOUGHT", "requirements": [{"req_per_unit": 2}]}
    _attach_cost_info(part, {})
    assert part["last_unit_cost"] is None
    assert part["last_currency"] is None
    assert part["estimated_cost"] is None


def test_line_items_from_deals_excludes_closed_deals():
    # A closed-won or closed-lost deal isn't outstanding demand anymore.
    deals = [
        {"deal_id": "1", "is_closed": False, "items": [{"sku": "A", "quantity": "5"}]},
        {"deal_id": "2", "is_closed": True, "items": [{"sku": "B", "quantity": "9"}]},
    ]
    line_items = _line_items_from_deals(deals)
    assert line_items == [{"sku": "A", "quantity": 5.0, "deal_id": "1"}]


def test_line_items_from_deals_skips_items_with_no_sku():
    deals = [{"deal_id": "1", "is_closed": False, "items": [{"sku": None, "quantity": "5"}]}]
    assert _line_items_from_deals(deals) == []


def test_group_by_product_splits_build_cost_by_currency():
    # A section mixing a CAD-sourced part with USD-sourced hardware must not
    # blend the two into one number — that would silently add CAD to USD as if
    # they were the same unit, which they aren't without a real exchange rate.
    inventory_records = [
        {"sku": "A3HSE002", "description": "Red Hose", "qty_on_hand": 10, "qty_demanded": 0, "net_available": 10, "bom_requirements": []},
    ]
    last_cost_by_sku = {
        "A3HSE002": {"unit_cost": 5.0, "currency": "CAD", "date": "2026-01-01", "po_number": "PO-1"},
        "L3CBG004": {"unit_cost": 1.0, "currency": "USD", "date": "2026-01-01", "po_number": "PO-2"},
    }
    sections = _group_by_product(inventory_records, last_cost_by_sku)
    cbs = next(s for s in sections if s["name"] == "CBS Lid")
    by_currency = cbs["estimated_build_cost_by_currency"]
    assert by_currency.get("CAD") is not None
    assert by_currency.get("USD") is not None
    assert by_currency["CAD"] != by_currency.get("USD")
