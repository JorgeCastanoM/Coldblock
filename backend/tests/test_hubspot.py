from api.hubspot import _normalize_conference_contact, _normalize_deal


_PIPELINES = {
    "82088336": {
        "label": "Active Sales Pipeline",
        "stages": {
            "154790192": {
                "label": "Confirmed Interest - expect PO wi 60 days",
                "is_closed": False,
                "is_won": False,
                "order": 5,
            },
            "216815184": {
                "label": "Closed Won - sale, trial, subscription",
                "is_closed": True,
                "is_won": True,
                "order": 7,
            },
            "154790194": {"label": "Closed lost", "is_closed": True, "is_won": False, "order": 8},
        },
    },
}


def test_normalize_deal_resolves_pipeline_and_stage_labels():
    deal = {
        "id": "123",
        "properties": {
            "dealname": "Acme Corp",
            "amount": "15000",
            "deal_currency_code": None,
            "dealstage": "154790192",
            "pipeline": "82088336",
            "closedate": "",
            "createdate": "2026-07-01T00:00:00.000Z",
        },
    }
    companies_by_id = {"c1": {"name": "Acme Corp Inc."}}
    line_items_by_id = {"li1": {"hs_sku": "CB-VALVE-100", "name": "Valve", "quantity": "10", "price": "50"}}

    result = _normalize_deal(deal, _PIPELINES, ["c1"], ["li1"], companies_by_id, line_items_by_id)

    assert result["pipeline"] == "Active Sales Pipeline"
    assert result["stage"] == "Confirmed Interest - expect PO wi 60 days"
    assert result["is_closed"] is False
    assert result["company"] == "Acme Corp Inc."
    assert result["amount"] == 15000.0
    # HubSpot's portal home currency is USD (confirmed via account-info), unlike
    # Fishbowl where it's CAD — a null deal_currency_code must default to USD.
    assert result["currency"] == "USD"
    assert result["items"] == [{"sku": "CB-VALVE-100", "name": "Valve", "quantity": "10", "price": "50"}]


def test_normalize_deal_closed_won_stage_flagged():
    deal = {"id": "124", "properties": {"dealstage": "216815184", "pipeline": "82088336"}}
    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {})
    assert result["is_closed"] is True
    assert result["is_won"] is True
    assert result["amount"] is None


def test_normalize_deal_closed_lost_stage_is_not_won():
    # isClosed alone doesn't distinguish won from lost — a lost deal is also
    # "closed" but must not count as revenue.
    deal = {"id": "127", "properties": {"dealstage": "154790194", "pipeline": "82088336"}}
    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {})
    assert result["is_closed"] is True
    assert result["is_won"] is False


def test_normalize_deal_falls_back_to_raw_ids_for_unknown_pipeline():
    deal = {"id": "125", "properties": {"dealstage": "999", "pipeline": "888"}}
    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {})
    assert result["pipeline"] == "888"
    assert result["stage"] == "999"


def test_normalize_deal_skips_company_with_no_name_and_uses_next():
    deal = {"id": "126", "properties": {"dealstage": "999", "pipeline": "888"}}
    companies_by_id = {"c1": {"name": None}, "c2": {"name": "Real Co"}}
    result = _normalize_deal(deal, _PIPELINES, ["c1", "c2"], [], companies_by_id, {})
    assert result["company"] == "Real Co"


def test_normalize_deal_resolves_stage_history_labels_in_chronological_order():
    # _batch_stage_history already reverses HubSpot's newest-first order before
    # this point, so _normalize_deal must preserve the given order, not re-sort.
    deal = {"id": "128", "properties": {"dealstage": "216815184", "pipeline": "82088336"}}
    stage_history_raw = [
        {"stage_id": "154790192", "changed_at": "2026-06-20T00:00:00Z"},
        {"stage_id": "216815184", "changed_at": "2026-07-01T00:00:00Z"},
    ]

    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {}, stage_history_raw)

    assert result["stage_history"] == [
        {"stage": "Confirmed Interest - expect PO wi 60 days", "stage_order": 5, "changed_at": "2026-06-20T00:00:00Z"},
        {"stage": "Closed Won - sale, trial, subscription", "stage_order": 7, "changed_at": "2026-07-01T00:00:00Z"},
    ]


def test_normalize_deal_stage_history_falls_back_to_raw_id_for_unknown_stage():
    deal = {"id": "129", "properties": {"dealstage": "154790192", "pipeline": "82088336"}}
    stage_history_raw = [{"stage_id": "999", "changed_at": "2026-01-01T00:00:00Z"}]

    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {}, stage_history_raw)

    assert result["stage_history"] == [{"stage": "999", "stage_order": 0, "changed_at": "2026-01-01T00:00:00Z"}]


def test_normalize_deal_defaults_to_empty_stage_history():
    deal = {"id": "130", "properties": {"dealstage": "154790192", "pipeline": "82088336"}}
    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {})
    assert result["stage_history"] == []


def test_normalize_deal_resolves_owner():
    deal = {
        "id": "131",
        "properties": {"dealstage": "154790192", "pipeline": "82088336", "hubspot_owner_id": "555"},
    }
    owners_by_id = {"555": {"name": "Sierra Quon", "email": "squon@coldblock.ca"}}

    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {}, None, owners_by_id)

    assert result["owner"] == {"id": "555", "name": "Sierra Quon", "email": "squon@coldblock.ca"}


def test_normalize_deal_with_no_owner_id_is_unassigned():
    deal = {"id": "132", "properties": {"dealstage": "154790192", "pipeline": "82088336"}}
    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {}, None, {"555": {"name": "Sierra Quon"}})
    assert result["owner"] is None


def test_normalize_deal_owner_id_not_resolved_keeps_id():
    # A departed owner not covered by either the active or archived owners
    # call must still be distinguishable from a deal with no owner at all.
    deal = {
        "id": "133",
        "properties": {"dealstage": "154790192", "pipeline": "82088336", "hubspot_owner_id": "999"},
    }
    result = _normalize_deal(deal, _PIPELINES, [], [], {}, {}, None, {})
    assert result["owner"] == {"id": "999", "name": None, "email": None}


def test_normalize_conference_contact_joins_first_and_last_name():
    row = {
        "id": "c1",
        "properties": {
            "firstname": "Jane",
            "lastname": "Prospect",
            "company": "Example Labs",
            "conference_name": "Analytica Germany 2026",
            "contact_source": "CONFERENCE",
            "createdate": "2026-06-15T00:00:00Z",
        },
    }
    result = _normalize_conference_contact(row)
    assert result == {
        "contact_id": "c1",
        "name": "Jane Prospect",
        "company": "Example Labs",
        "conference": "Analytica Germany 2026",
        "source": "CONFERENCE",
        "create_date": "2026-06-15T00:00:00Z",
    }


def test_normalize_conference_contact_handles_missing_name_parts():
    row = {"id": "c2", "properties": {"firstname": None, "lastname": None}}
    result = _normalize_conference_contact(row)
    assert result["name"] is None
