"""Build the individual task-report PDFs, and send them only with --send.

Run from anywhere; the script loads backend/.env itself.

    python scripts/weekly_task_report.py --only jcastano@coldblock.ca --out tmp/weekly-reports

Without --send it writes the PDFs and stops. Nothing is mailed.
"""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
# Settings read .env from the working directory, and `backend` has to be on
# the path before those imports. Both have to happen before importing the app.
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from api.graph import graph_client  # noqa: E402
from core.config import settings  # noqa: E402
from services.tasks import build_tasks_report  # noqa: E402
from services.weekly_report import (  # noqa: E402
    load_recipients,
    match_recipients,
    report_tasks,
    select_recipients,
    source_errors,
)

RENDER_SCRIPT = REPO / "frontend" / "scripts" / "renderTaskReportPdfs.mjs"


def _only_from_env() -> list[str]:
    raw = os.environ.get("WEEKLY_REPORT_ONLY", "")
    return [part.strip() for part in raw.split(",") if part.strip()]


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Monday task-report PDFs. Does not send mail unless --send.")
    parser.add_argument("--only", action="append", default=[], help="Recipient email to include. Repeatable. Default: the whole list.")
    parser.add_argument("--out", type=Path, default=BACKEND / "tmp" / "weekly-reports", help="Directory for the PDFs.")
    parser.add_argument("--send", action="store_true", help="Mail each PDF. Off unless this flag is passed.")
    return parser.parse_args(argv)


async def _send(manifest: list[dict]) -> None:
    sender = settings.mail_from.strip()
    if not sender:
        raise SystemExit("MAIL_FROM is empty. Refusing to send.")
    for item in manifest:
        pdf_path = Path(item["file"])
        name = item["name"]
        subject = f"ColdBlock task report — {name}"
        body = (
            f"{name},\n\n"
            "Your ColdBlock task report is attached. It covers the last 7 days "
            "from HubSpot and Planner, with automated reminders left out.\n"
        )
        await graph_client.send_pdf(
            sender=sender,
            to=item["email"],
            subject=subject,
            body=body,
            filename=pdf_path.name,
            pdf=pdf_path.read_bytes(),
        )
        print(f"sent {item['email']} {pdf_path.name}")


async def run(argv: list[str]) -> int:
    args = _parse_args(argv)
    only = args.only or _only_from_env()
    send = args.send or os.environ.get("WEEKLY_REPORT_SEND", "").lower() == "true"

    report = await build_tasks_report("actionable")
    errors = source_errors(report.get("sources") or {})
    if errors:
        print("Not building PDFs. A source failed:", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        return 1

    chosen, unknown = select_recipients(load_recipients(), only)
    if unknown:
        print("These addresses are not on the recipient list:", file=sys.stderr)
        for email in unknown:
            print(f"  {email}", file=sys.stderr)
        return 1
    if not chosen:
        print("The recipient list is empty.", file=sys.stderr)
        return 1

    matched, missing = match_recipients(chosen, report_tasks(report))
    if missing:
        print("No current tasks for these recipients, so nothing was sent:", file=sys.stderr)
        for email in missing:
            print(f"  {email}", file=sys.stderr)
        return 1

    node = shutil.which("node")
    if node is None:
        print("node is not on PATH, so the PDF cannot be rendered.", file=sys.stderr)
        return 1
    if not RENDER_SCRIPT.is_file():
        print(f"Missing renderer: {RENDER_SCRIPT}", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now().astimezone().isoformat()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        report_path = tmp_path / "report.json"
        request_path = tmp_path / "recipients.json"
        report_path.write_text(json.dumps(report), encoding="utf-8")
        request_path.write_text(
            json.dumps({"generatedAt": generated_at, "recipients": matched}),
            encoding="utf-8",
        )
        completed = subprocess.run(
            [node, str(RENDER_SCRIPT), "--report", str(report_path), "--recipients", str(request_path), "--out", str(args.out)],
            check=False,
        )
    if completed.returncode != 0:
        print("PDF rendering failed. No mail was sent.", file=sys.stderr)
        return completed.returncode

    manifest_path = args.out / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for item in manifest:
        counts = item.get("counts") or {}
        print(
            f"pdf {item['email']} {item['file']} "
            f"done={counts.get('done', 0)} overdue={counts.get('overdue', 0)} "
            f"due={counts.get('due_next_week', 0)} "
            f"older_overdue={item.get('olderOverdue', 0)} no_due_date={item.get('noDueDate', 0)}"
        )

    if not send:
        print("Mail is off. No email was sent.")
        return 0

    await _send(manifest)
    return 0


def main() -> None:
    sys.exit(asyncio.run(run(sys.argv[1:])))


if __name__ == "__main__":
    main()
