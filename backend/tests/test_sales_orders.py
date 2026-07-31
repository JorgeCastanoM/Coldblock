from api.fishbowl import _normalize_sales_order, _normalize_sales_order_item


def test_normalize_sales_order_maps_status():
    row = {
        "so_number": "SO-1",
        "status_id": 20,
        "customer": "Acme",
        "date_created": "2026-07-01",
        "date_issued": "2026-07-02",
        "total": 100.0,
    }
    order = _normalize_sales_order(row)
    assert order == {
        "so_number": "SO-1",
        "status": "Issued",
        "customer": "Acme",
        "date_created": "2026-07-01",
        "date_issued": "2026-07-02",
        "total": 100.0,
        "items": [],
    }


def test_normalize_sales_order_item_maps_fulfillment():
    item = _normalize_sales_order_item(
        {
            "line_number": 1,
            "sku": "CBS-LID",
            "description": "CBS Lid",
            "qty_ordered": 2,
            "qty_fulfilled": 1,
            "qty_picked": 2,
            "qty_to_fulfill": 2,
            "unit_price": 100,
            "line_total": 200,
            "item_status_id": 30,
        }
    )
    assert item["sku"] == "CBS-LID"
    assert item["status"] == "Partial"
    assert item["qty_fulfilled"] == 1
