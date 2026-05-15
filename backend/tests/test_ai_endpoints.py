"""
FAMMY AI Backend - End-to-end tests for the 4 AI endpoints.

Covers:
- Health & root info
- /api/ai/suggest-task (Italian titles, schema validation, edge cases)
- /api/ai/weekly-summary (Italian summary + highlights array)
- /api/ai/chat (single-turn + multi-turn context continuity, history)
- /api/ai/gift-ideas (>=3 items, non-empty fields)
- Error handling for malformed inputs
"""
import os
import re
import uuid
import pytest
import requests
from dotenv import dotenv_values

# Load from frontend/.env (Vite project doesn't export REACT_APP_BACKEND_URL into the shell)
_FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or _FRONTEND_ENV.get("REACT_APP_BACKEND_URL")
    or _FRONTEND_ENV.get("VITE_BACKEND_URL")
).rstrip("/")
# AI calls hit a real LLM, allow generous timeout
TIMEOUT = 90


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Basic health / info ----------
class TestHealth:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/health", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert data["mongo"] is True
        assert "time" in data

    def test_root_info(self, api):
        r = api.get(f"{BASE_URL}/api/", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert data["service"] == "fammy-ai"
        # Model identifier must include claude-sonnet-4-5-20250929
        assert "claude-sonnet-4-5-20250929" in data["model"]
        assert data["model"].startswith("anthropic/")


# ---------- Suggest task ----------
ALLOWED = {"care", "home", "health", "admin", "spese", "other"}
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class TestSuggestTask:
    @pytest.mark.parametrize("title,expected_categories", [
        ("Pagare bolletta luce", {"spese", "admin"}),
        ("Comprare il latte", {"home"}),
        ("Visita dentista", {"health"}),
    ])
    def test_suggest_task_categories(self, api, title, expected_categories):
        r = api.post(
            f"{BASE_URL}/api/ai/suggest-task",
            json={"title": title, "lang": "it"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Schema
        assert "category" in data and "suggested_due_date" in data and "reasoning" in data
        assert data["category"] in ALLOWED
        # Due date: either None or ISO yyyy-mm-dd
        due = data["suggested_due_date"]
        assert due is None or (isinstance(due, str) and ISO_RE.match(due)), f"bad due: {due!r}"
        assert isinstance(data["reasoning"], str) and data["reasoning"].strip()
        # Soft category check (LLM should usually land in expected set)
        assert data["category"] in expected_categories, (
            f"Title '{title}' classified as {data['category']}, expected one of {expected_categories}"
        )

    def test_suggest_task_missing_title(self, api):
        # Missing required field -> FastAPI returns 422
        r = api.post(f"{BASE_URL}/api/ai/suggest-task", json={}, timeout=TIMEOUT)
        assert r.status_code == 422, r.text

    def test_suggest_task_empty_title(self, api):
        # Empty string is technically valid for the model; must not crash (no 500)
        r = api.post(
            f"{BASE_URL}/api/ai/suggest-task",
            json={"title": "", "lang": "it"},
            timeout=TIMEOUT,
        )
        assert r.status_code in (200, 400, 422), r.text
        if r.status_code == 200:
            data = r.json()
            assert data["category"] in ALLOWED


# ---------- Weekly summary ----------
def _looks_italian(text: str) -> bool:
    """Heuristic: text contains at least one Italian-ish marker."""
    if not text:
        return False
    t = text.lower()
    markers = [
        " la ", " il ", " della ", " del ", " che ", " per ", " con ",
        "famiglia", "settimana", "questa", "complet", "prossim", "spes",
        " e ", " un ", " una ",
    ]
    return any(m in f" {t} " for m in markers)


class TestWeeklySummary:
    def test_weekly_summary_italian(self, api):
        payload = {
            "family_name": "TEST_Rossi",
            "completed_tasks": [
                "Spesa settimanale", "Lavatrice", "Pulizia cucina",
                "Compiti dei bambini", "Visita medica nonna",
            ],
            "pending_tasks": ["Pagare bolletta gas", "Prenotare ristorante"],
            "upcoming_events": ["Compleanno Luca - 2026-05-20", "Cena di famiglia - 2026-05-18"],
            "total_expenses": 312.50,
            "upcoming_birthdays": ["Luca (5 anni) - 2026-05-20"],
            "lang": "it",
        }
        r = api.post(f"{BASE_URL}/api/ai/weekly-summary", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "summary" in data and "highlights" in data
        summary = data["summary"]
        assert isinstance(summary, str) and len(summary.strip()) > 20, f"summary too short: {summary!r}"
        assert _looks_italian(summary), f"summary doesn't look Italian: {summary!r}"
        assert isinstance(data["highlights"], list)
        # Should produce at least 1 highlight
        assert len(data["highlights"]) >= 1

    def test_weekly_summary_minimal(self, api):
        # No data at all -> still must not crash
        r = api.post(
            f"{BASE_URL}/api/ai/weekly-summary",
            json={"family_name": "TEST_Empty", "lang": "it"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("summary"), str)
        assert isinstance(data.get("highlights"), list)


# ---------- Chat (multi-turn + history) ----------
class TestChat:
    def test_chat_single_message(self, api):
        user_id = f"TEST_user_{uuid.uuid4().hex[:6]}"
        r = api.post(
            f"{BASE_URL}/api/ai/chat",
            json={
                "message": "Ciao FAMMY! Come stai?",
                "user_id": user_id,
                "lang": "it",
            },
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data and "session_id" in data
        assert isinstance(data["reply"], str) and data["reply"].strip()
        assert isinstance(data["session_id"], str) and data["session_id"].strip()

    def test_chat_multi_turn_context(self, api):
        """Send 2 messages with same session_id; second response should remember first."""
        user_id = f"TEST_user_{uuid.uuid4().hex[:6]}"
        session_id = f"TEST_session_{uuid.uuid4().hex[:8]}"

        # Turn 1: introduce a unique fact
        r1 = api.post(
            f"{BASE_URL}/api/ai/chat",
            json={
                "message": "Mi chiamo Federico e mio figlio si chiama Tommaso, ha 6 anni.",
                "user_id": user_id,
                "session_id": session_id,
                "lang": "it",
            },
            timeout=TIMEOUT,
        )
        assert r1.status_code == 200, r1.text
        data1 = r1.json()
        assert data1["session_id"] == session_id
        assert data1["reply"].strip()

        # Turn 2: ask about it
        r2 = api.post(
            f"{BASE_URL}/api/ai/chat",
            json={
                "message": "Come si chiama mio figlio e quanti anni ha?",
                "user_id": user_id,
                "session_id": session_id,
                "lang": "it",
            },
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200, r2.text
        data2 = r2.json()
        assert data2["session_id"] == session_id
        reply2 = data2["reply"].lower()
        # The assistant should mention Tommaso (case-insensitive); age 6 is a strong signal too.
        assert "tommaso" in reply2, (
            f"Multi-turn context NOT preserved. Reply did not mention 'Tommaso': {data2['reply']!r}"
        )

    def test_chat_history(self, api):
        """After 2 turns, history endpoint must return 4 messages (2 user + 2 assistant)."""
        user_id = f"TEST_user_{uuid.uuid4().hex[:6]}"
        session_id = f"TEST_hist_{uuid.uuid4().hex[:8]}"

        for msg in ["Primo messaggio di test", "Secondo messaggio di test"]:
            r = api.post(
                f"{BASE_URL}/api/ai/chat",
                json={"message": msg, "user_id": user_id,
                      "session_id": session_id, "lang": "it"},
                timeout=TIMEOUT,
            )
            assert r.status_code == 200, r.text

        h = api.get(f"{BASE_URL}/api/ai/chat/history/{session_id}", timeout=TIMEOUT)
        assert h.status_code == 200, h.text
        msgs = h.json().get("messages", [])
        assert len(msgs) == 4, f"expected 4 messages, got {len(msgs)}: {msgs}"
        roles = [m["role"] for m in msgs]
        assert roles == ["user", "assistant", "user", "assistant"], f"bad order: {roles}"
        # Persisted content matches
        assert msgs[0]["content"] == "Primo messaggio di test"
        assert msgs[2]["content"] == "Secondo messaggio di test"
        # No mongo _id leak
        for m in msgs:
            assert "_id" not in m


# ---------- Gift ideas ----------
class TestGiftIdeas:
    def test_gift_ideas_basic(self, api):
        r = api.post(
            f"{BASE_URL}/api/ai/gift-ideas",
            json={
                "member_name": "Nonna Maria",
                "member_role": "nonna",
                "age": 72,
                "interests": "giardinaggio, cucina, lettura",
                "budget_min": 20,
                "budget_max": 60,
                "lang": "it",
            },
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ideas" in data and isinstance(data["ideas"], list)
        assert len(data["ideas"]) >= 3, f"expected >=3 ideas, got {len(data['ideas'])}"
        for idea in data["ideas"]:
            assert idea.get("title"), f"empty title: {idea}"
            assert idea.get("description"), f"empty description: {idea}"
            assert idea.get("price_range"), f"empty price_range: {idea}"

    def test_gift_ideas_missing_name(self, api):
        r = api.post(f"{BASE_URL}/api/ai/gift-ideas", json={}, timeout=TIMEOUT)
        # Pydantic requires member_name -> 422
        assert r.status_code == 422, r.text
