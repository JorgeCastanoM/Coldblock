from api.fishbowl import _normalize_purchase_order, _normalize_purchase_order_item


def test_normalize_purchase_order_reads_joined_status_name():
    # PO status text comes from a live join against Fishbowl's postatus table
    # (unlike sales orders, which use a hardcoded status map), so normalization
    # just passes status_name through rather than looking up an id.
    row = {
        "po_number": "PO-1",
        "status_name": "Issued",
        "vendor": "McMaster-Carr",
        "date_created": "2026-07-01",
        "date_issued": "2026-07-02",
        "currency": "USD",
        "total": 250.0,
    }
    order = _normalize_purchase_order(row)
    assert order == {
        "po_number": "PO-1",
        "status": "Issued",
        "vendor": "McMaster-Carr",
        "date_created": "2026-07-01",
        "date_issued": "2026-07-02",
        "currency": "USD",
        "total": 250.0,
        "items": [],
    }


def test_normalize_purchase_order_falls_back_to_unknown_status():
    order = _normalize_purchase_order({"po_number": "PO-2", "status_name": None})
    assert order["status"] == "Unknown"


def test_normalize_purchase_order_defaults_missing_currency_to_home_currency():
    # Fishbowl's home currency here is CAD (confirmed via the currency table's
    # homeCurrency flag) — a null currency join should fall back to it, not USD.
    order = _normalize_purchase_order({"po_number": "PO-3", "currency": None})
    assert order["currency"] == "CAD"


def test_normalize_purchase_order_item_computes_qty_ordered():
    # poitem has no qtyOrdered column in Fishbowl's schema (unlike soitem), so
    # qty_ordered is approximated as qty_fulfilled + qty_to_fulfill.
    item = _normalize_purchase_order_item(
        {
            "line_number": 1,
            "sku": "H3LMS001",
            "description": "Heater Core Half",
            "qty_fulfilled": 5,
            "qty_picked": 5,
            "qty_to_fulfill": 15,
            "unit_cost": 210.0,
            "line_total": 4200.0,
            "item_status_name": "Partial",
        }
    )
    assert item["qty_ordered"] == 20
    assert item["status"] == "Partial"
    assert item["qty_to_fulfill"] == 15
