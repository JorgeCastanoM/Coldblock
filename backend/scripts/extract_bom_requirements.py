"""Rebuild data/bom_requirements.json from a ColdBlock manufacturing-list spreadsheet.

Run this whenever the spreadsheet is updated with a new BOM revision:

    python scripts/extract_bom_requirements.py "path/to/MANUFACTURING LIST.xlsx"

The CBL/CBM/CBS Lid sheets each contain multiple stacked tables (an unlabeled
"coated/metal" table first, then superseded revisions, then the current
"...Plastic...ACTIVE" table). Only the first table and the last active-titled
table are kept as the two current variants; anything in between is a
superseded predecessor and is dropped. See project notes for how this was
verified against the sheet's own ACTIVE/inactive title rows.
"""

import json
import os
import sys

import pandas as pd

if len(sys.argv) != 2:
    print("Usage: python extract_bom_requirements.py <path-to-manufacturing-list.xlsx>")
    sys.exit(1)

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "bom_requirements.json")

LID_SHEETS = {"CBL Lid", "CBM Lid", "CBS Lid"}
COLS = ("FB Part #", "FB Description", "Custom Parts", "SKU", "Req'd/unit")

NON_PART_LABELS = {
    "Fasteners & Sundry",
    "Fasteners & Hardware",
    "Fasteners",
    "* need 2 if no light shield, otherwise need 5",
    "** only if light shield is needed",
}


def clean(value):
    if pd.isna(value):
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return str(value).strip()


def clean_qty(value):
    text = clean(value)
    if text is None:
        return None
    try:
        return int(text)
    except ValueError:
        return text


def find_segments(df):
    """Return list of (header_idx, data_start, data_end_exclusive, title_or_None) per sheet."""
    header_idxs = [idx for idx, row in df.iterrows() if row.astype(str).str.strip().eq("FB Part #").any()]
    segments = []
    for i, h in enumerate(header_idxs):
        end = header_idxs[i + 1] if i + 1 < len(header_idxs) else len(df)
        # A genuine title row has text only in col 0 with the rest of the row blank.
        # Search the gap immediately above this header; stop as soon as real data appears.
        title = None
        search_start = header_idxs[i - 1] if i > 0 else 0
        for back_idx in range(h - 1, search_start, -1):
            row = df.iloc[back_idx]
            rest_blank = row.iloc[1:].isna().all()
            cell = row.iloc[0]
            if not pd.isna(cell) and str(cell).strip():
                if rest_blank:
                    title = str(cell).strip()
                break
            if not rest_blank:
                break
        segments.append((h, h + 1, end, title))
    return segments


def col_map_for_header(df, header_idx):
    header = df.iloc[header_idx].astype(str).str.strip()
    return {label: col_idx for col_idx, label in header.items() if label in COLS}


def extract_sheet_rows(df, header_idx, start, end, col_map):
    rows = []
    for i in range(start, end):
        row = df.iloc[i]
        description = row.get(col_map.get("FB Description", -1))
        custom_code = row.get(col_map.get("Custom Parts", -1))
        if (pd.isna(description) or str(description).strip() == "") and (
            pd.isna(custom_code) or str(custom_code).strip() == ""
        ):
            continue
        if str(row.get(col_map.get("FB Part #", -1))).strip() == "FB Part #":
            continue  # stray repeated header line
        custom_code_clean = clean(custom_code)
        if custom_code_clean in NON_PART_LABELS:
            continue  # section label or footnote, not a real BOM line
        description_clean = clean(description) or custom_code_clean
        rows.append(
            {
                "fb_part_number": clean(row.get(col_map.get("FB Part #", -1))),
                "description": description_clean,
                "custom_code": custom_code_clean,
                "vendor_sku": clean(row.get(col_map.get("SKU", -1))) if "SKU" in col_map else None,
                "req_per_unit": clean_qty(row.get(col_map.get("Req'd/unit", -1)))
                if "Req'd/unit" in col_map
                else None,
            }
        )
    return rows


def detect_size(description, custom_code, fb_part_number):
    for text in (description, custom_code, fb_part_number):
        if not text:
            continue
        for size in ("CBL", "CBM", "CBS"):
            if text.strip().upper().startswith(size):
                return [size]
    if custom_code and custom_code.upper().startswith("CBLMS"):
        return ["CBL", "CBM", "CBS"]
    return ["CBL", "CBM", "CBS"]


def classify_lid_segments(segments):
    """segment 0 = coated (forced active/default). An untitled segment is a genuine
    trailing continuation only if it's the sheet's last segment and the previous one
    was active; any other untitled non-first segment is a superseded predecessor."""
    classifications = []
    current_variant, current_active = "coated", True
    for seg_i, (header_idx, _start, _end, title) in enumerate(segments):
        is_last = seg_i == len(segments) - 1
        if seg_i == 0:
            variant, active = "coated", True
        elif title and "inactive" in title.lower():
            variant, active = ("plastic" if "plastic" in title.lower() else "coated"), False
        elif title and "active" in title.lower():
            variant, active = ("plastic" if "plastic" in title.lower() else "coated"), True
        elif title is None and is_last and current_active:
            variant, active = current_variant, current_active
        elif title is None:
            variant, active = current_variant, False
        else:
            variant, active = current_variant, False
        current_variant, current_active = variant, active
        classifications.append((seg_i, header_idx, title, variant, active))
    return classifications


def main() -> None:
    xl = pd.ExcelFile(SRC)
    all_records = []
    report_lines = []

    for sheet_name in xl.sheet_names:
        df = xl.parse(sheet_name, header=None)
        segments = find_segments(df)

        if sheet_name not in LID_SHEETS:
            header_idx, start, end, _ = segments[0]
            col_map = col_map_for_header(df, header_idx)
            rows = extract_sheet_rows(df, header_idx, start, end, col_map)
            for r in rows:
                r["sheet"] = sheet_name
                r["variant"] = None
                r["sizes"] = detect_size(r["description"], r["custom_code"], r["fb_part_number"])
                all_records.append(r)
            report_lines.append(f"{sheet_name}: 1 segment (standard), {len(rows)} rows kept")
            continue

        segment_rows = []
        for header_idx, start, end, _title in segments:
            col_map = col_map_for_header(df, header_idx)
            segment_rows.append(extract_sheet_rows(df, header_idx, start, end, col_map))

        classifications = classify_lid_segments(segments)

        kept_groups = {}
        for seg_i, header_idx, title, variant, active in classifications:
            report_lines.append(
                f"{sheet_name} segment {seg_i} (header row {header_idx}): title={title!r} "
                f"-> variant={variant} active={active}"
            )
            if not active:
                continue
            seen = kept_groups.setdefault(variant, set())
            for r in segment_rows[seg_i]:
                dedup_key = (r["fb_part_number"], r["custom_code"])
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)
                r["sheet"] = sheet_name
                r["variant"] = variant
                r["sizes"] = detect_size(r["description"], r["custom_code"], r["fb_part_number"])
                all_records.append(r)

    print("\n".join(report_lines))
    print(f"\nExtracted {len(all_records)} BOM requirement rows across {len(xl.sheet_names)} sheets")
    with_fb_part = sum(1 for r in all_records if r["fb_part_number"])
    print(f"  {with_fb_part} have a Fishbowl part number, {len(all_records) - with_fb_part} don't yet")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(all_records, f, indent=2)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
