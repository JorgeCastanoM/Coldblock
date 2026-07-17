from services.bom_requirements import requirements_by_sku


def test_known_part_has_requirement():
    index = requirements_by_sku()
    matches = index.get("C3MNC002")
    assert matches
    assert matches[0]["description"] == "Odroid N2+ 2GB"
    assert matches[0]["req_per_unit"] == 1


def test_unknown_part_has_no_requirement():
    index = requirements_by_sku()
    assert index.get("NOT-A-REAL-SKU") is None
