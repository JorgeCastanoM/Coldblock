from services.tasks import _assign_person_keys
from services.weekly_report import (
    load_recipients,
    match_recipients,
    select_recipients,
    source_errors,
)

_CONFIRMED = [
    "akapoor@coldblock.ca",
    "craig.west@coldblock.ca",
    "dcobb@coldblock.ca",
    "hlielmanis@coldblock.ca",
    "jgonis@coldblock.ca",
    "jcastano@coldblock.ca",
    "kmoffatt@coldblock.ca",
    "kpereverzev@coldblock.ca",
    "ladoig@coldblock.ca",
    "mpalomba@coldblock.ca",
    "nchapman@coldblock.ca",
    "qstevens@coldblock.ca",
    "slevine@coldblock.ca",
    "steve@rapid-sci.co.za",
]


def test_recipient_file_is_the_confirmed_fourteen():
    assert [entry["email"] for entry in load_recipients()] == _CONFIRMED


def test_select_recipients_keeps_only_the_requested_address():
    recipients = load_recipients()
    chosen, missing = select_recipients(recipients, ["JCastano@coldblock.ca"])
    assert missing == []
    assert [entry["email"] for entry in chosen] == ["jcastano@coldblock.ca"]


def test_select_recipients_rejects_an_address_that_is_not_on_the_list():
    chosen, missing = select_recipients(load_recipients(), ["nobody@coldblock.ca"])
    assert chosen == []
    assert missing == ["nobody@coldblock.ca"]


def test_match_sends_to_the_list_address_when_the_person_has_another_email():
    tasks = [
        {"assigned_to": [{"id": "1", "name": "Stephen Varty", "email": "svarty@coldblock.ca"}]},
        {"assigned_to": [{"id": "2", "name": "Stephen Varty", "email": "steve@rapid-sci.co.za"}]},
    ]
    _assign_person_keys(tasks)
    matched, missing = match_recipients(
        [{"name": "Stephen Varty", "email": "steve@rapid-sci.co.za"}],
        tasks,
    )
    assert missing == []
    assert matched == [
        {
            "name": "Stephen Varty",
            "email": "steve@rapid-sci.co.za",
            "key": tasks[0]["assigned_to"][0]["key"],
        }
    ]


def test_match_reports_a_recipient_with_no_tasks():
    matched, missing = match_recipients([{"name": "Akash Kapoor", "email": "akapoor@coldblock.ca"}], [])
    assert matched == []
    assert missing == ["akapoor@coldblock.ca"]


def test_source_errors_block_a_partial_report():
    assert source_errors({"hubspot": {"ok": True}, "planner": {"ok": False, "reason": "disabled"}}) == [
        "planner: disabled"
    ]
    assert source_errors({"hubspot": {"ok": True}, "planner": {"ok": True}}) == []
