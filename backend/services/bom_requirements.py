import json
from functools import lru_cache
from pathlib import Path

_DATA_PATH = Path(__file__).parent.parent / "data" / "bom_requirements.json"


@lru_cache(maxsize=1)
def _load() -> list[dict]:
    with open(_DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def all_requirements() -> list[dict]:
    return _load()


@lru_cache(maxsize=1)
def requirements_by_sku() -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    for record in _load():
        sku = record.get("fb_part_number")
        if not sku:
            continue
        index.setdefault(sku, []).append(record)
    return index
