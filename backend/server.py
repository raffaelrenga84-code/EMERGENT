"""
FAMMY Backend - AI Features API

Exposes 4 AI endpoints powered by Claude Sonnet 4.5 via emergentintegrations:
  POST /api/ai/chat              -> Multi-turn family assistant chat
  POST /api/ai/weekly-summary    -> Generate a friendly weekly recap
  POST /api/ai/suggest-task      -> Smart category + due date for a new task
  POST /api/ai/gift-ideas        -> Birthday gift suggestions for a member

Auth: app uses Supabase on the frontend; backend endpoints are stateless and
identify users only by `user_id` they send (used for chat session continuity).
"""
import os
import json
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

from emergentintegrations.llm.chat import LlmChat, UserMessage

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]

PROVIDER = "anthropic"
MODEL = "claude-sonnet-4-5-20250929"

# Supabase (per ICS feed): opzionale — se non configurato, /api/calendar/* ritorna 503
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# ---------- App ----------
app = FastAPI(title="FAMMY AI Backend", version="0.1.0")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]


# ---------- Helpers ----------
def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_chat(session_id: str, system_message: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model(PROVIDER, MODEL)


def lang_name(code: str) -> str:
    return {
        "it": "Italian",
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
    }.get(code or "it", "Italian")


def extract_json(text: str) -> Optional[dict]:
    """Best-effort JSON extraction from a model reply (Claude sometimes wraps it)."""
    if not text:
        return None
    # try direct
    try:
        return json.loads(text)
    except Exception:
        pass
    # fenced ```json ... ```
    m = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    # first {...} block
    m = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    return None


# ---------- Models ----------
class ChatRequest(BaseModel):
    message: str
    user_id: str
    family_context: Optional[dict] = None  # {members, today_tasks, upcoming_events, ...}
    lang: str = "it"
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


class WeeklySummaryRequest(BaseModel):
    family_name: str
    completed_tasks: List[str] = Field(default_factory=list)
    pending_tasks: List[str] = Field(default_factory=list)
    upcoming_events: List[str] = Field(default_factory=list)  # "title - date"
    total_expenses: Optional[float] = None
    upcoming_birthdays: List[str] = Field(default_factory=list)
    lang: str = "it"


class WeeklySummaryResponse(BaseModel):
    summary: str
    highlights: List[str]


class SuggestTaskRequest(BaseModel):
    title: str
    today: Optional[str] = None  # ISO date YYYY-MM-DD, optional
    lang: str = "it"


class SuggestTaskResponse(BaseModel):
    category: str  # care|home|health|admin|spese|other
    suggested_due_date: Optional[str] = None  # ISO YYYY-MM-DD or None
    reasoning: str


class GiftIdeasRequest(BaseModel):
    member_name: str
    member_role: Optional[str] = None  # mamma|papà|nonna|nonno|fratello|sorella|altro
    age: Optional[int] = None
    interests: Optional[str] = None  # free text
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    lang: str = "it"


class GiftIdea(BaseModel):
    title: str
    description: str
    price_range: str


class GiftIdeasResponse(BaseModel):
    ideas: List[GiftIdea]


# ---------- Routes ----------
@api.get("/")
async def root():
    return {"status": "ok", "service": "fammy-ai", "model": f"{PROVIDER}/{MODEL}"}


@api.get("/health")
async def health():
    try:
        await db.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False
    return {"status": "ok", "mongo": mongo_ok, "time": utcnow_iso()}


# ----- 1. AI Family Assistant Chat (multi-turn) -----
@api.post("/ai/chat", response_model=ChatResponse)
async def ai_chat(req: ChatRequest):
    session_id = req.session_id or f"chat-{req.user_id}-{uuid.uuid4().hex[:8]}"

    # Build a context-aware system message
    ctx_parts = []
    if req.family_context:
        fc = req.family_context
        if fc.get("family_name"):
            ctx_parts.append(f"Family name: {fc['family_name']}")
        if fc.get("members"):
            members = ", ".join(fc["members"]) if isinstance(fc["members"], list) else str(fc["members"])
            ctx_parts.append(f"Members: {members}")
        if fc.get("today_tasks"):
            tt = fc["today_tasks"]
            tasks = "; ".join(tt) if isinstance(tt, list) else str(tt)
            ctx_parts.append(f"Today's open tasks: {tasks}")
        if fc.get("upcoming_events"):
            ev = fc["upcoming_events"]
            events = "; ".join(ev) if isinstance(ev, list) else str(ev)
            ctx_parts.append(f"Upcoming events: {events}")

    family_ctx = "\n".join(ctx_parts) if ctx_parts else "No family context provided yet."
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    system_message = (
        f"You are FAMMY, a warm and helpful family-organization assistant. "
        f"Answer in {lang_name(req.lang)}. Be conversational, friendly, concise, "
        f"and use light emoji when natural. You help with tasks, meal planning, "
        f"birthdays, shared expenses, weekly planning, kids' activities, "
        f"and general home organization. Never invent data: if asked about "
        f"specific tasks or events you don't see in the context, ask the user.\n\n"
        f"Today's date is {today_str} (UTC). Use this when interpreting "
        f"relative dates such as \"oggi\", \"domani\", \"venerdì\", \"prossima settimana\".\n\n"
        f"=== Family context ===\n{family_ctx}\n\n"
        f"=== TOOL CALLING ===\n"
        f"When (and ONLY when) the user clearly asks you to CREATE/ADD a new "
        f"task (\"incarico\", \"to-do\", \"chore\") or a new event (\"evento\", "
        f"\"appointment\", \"appuntamento\"), append a single JSON action line at "
        f"the very end of your reply, on its own line, in EXACTLY this format:\n"
        f"  [[ACTION:create_task|{{\"title\":\"...\",\"category\":\"care|home|health|admin|spese|other\",\"due_date\":\"YYYY-MM-DD or null\"}}]]\n"
        f"  [[ACTION:create_event|{{\"title\":\"...\",\"starts_at\":\"YYYY-MM-DDTHH:MM or null\",\"location\":\"... or null\"}}]]\n"
        f"Category guide:\n"
        f"  • care  : caring for kids/elderly/pets\n"
        f"  • home  : groceries, cleaning, repairs, household errands (e.g. buying bread)\n"
        f"  • health: doctor, medication, fitness\n"
        f"  • admin : paperwork, school forms, banking\n"
        f"  • spese : BILLS to pay (bolletta, rata) — NOT groceries\n"
        f"  • other : everything else\n"
        f"Rules:\n"
        f"  • Use double quotes inside the JSON. Use null (not \"null\") when missing.\n"
        f"  • Date math: today + 1 day = tomorrow, using {today_str} as today.\n"
        f"  • Tasks have due_date (date). Events have starts_at (date + optional time, default 19:00).\n"
        f"  • If the user just asks a question (no creation intent), DO NOT emit any ACTION block.\n"
        f"  • Your conversational reply (before the ACTION line) should still be friendly and confirm what you're about to add."
    )

    try:
        # Replay last 10 user turns of this session for true multi-turn behaviour.
        # We fetch the *latest* user messages (sort desc, then reverse to chronological order).
        history_desc = await db.chat_messages.find(
            {"session_id": session_id, "role": "user"}, {"_id": 0}
        ).sort("created_at", -1).to_list(10)
        history = list(reversed(history_desc))

        chat = new_chat(session_id, system_message)
        # Replay prior user turns so model has context (LlmChat is stateless per instance).
        for h in history:
            await chat.send_message(UserMessage(text=h["content"]))

        reply = await chat.send_message(UserMessage(text=req.message))

        # Persist both turns
        now = utcnow_iso()
        await db.chat_messages.insert_many([
            {"session_id": session_id, "user_id": req.user_id, "role": "user",
             "content": req.message, "created_at": now},
            {"session_id": session_id, "user_id": req.user_id, "role": "assistant",
             "content": reply, "created_at": utcnow_iso()},
        ])
        return ChatResponse(reply=reply, session_id=session_id)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI chat error: {e}")


@api.get("/ai/chat/history/{session_id}")
async def ai_chat_history(session_id: str):
    msgs = await db.chat_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return {"messages": msgs}


# ----- 2. Weekly Summary -----
@api.post("/ai/weekly-summary", response_model=WeeklySummaryResponse)
async def ai_weekly_summary(req: WeeklySummaryRequest):
    session_id = f"weekly-{uuid.uuid4().hex[:10]}"
    system_message = (
        f"You are FAMMY, a warm family-organization assistant. "
        f"Generate a friendly weekly recap for a family. "
        f"Respond ONLY with valid JSON in this exact shape: "
        f'{{"summary": "<2-3 sentence celebratory paragraph in {lang_name(req.lang)}>", '
        f'"highlights": ["<bullet 1>", "<bullet 2>", "<bullet 3>"]}}'
        f" Keep tone warm, encouraging, with light emoji."
    )

    payload = {
        "family_name": req.family_name,
        "completed_tasks_count": len(req.completed_tasks),
        "completed_tasks": req.completed_tasks[:15],
        "pending_tasks_count": len(req.pending_tasks),
        "pending_tasks": req.pending_tasks[:10],
        "upcoming_events": req.upcoming_events[:10],
        "total_expenses": req.total_expenses,
        "upcoming_birthdays": req.upcoming_birthdays[:5],
    }

    try:
        chat = new_chat(session_id, system_message)
        reply = await chat.send_message(
            UserMessage(text="Genera il riepilogo per questi dati:\n" + json.dumps(payload, ensure_ascii=False))
        )
        parsed = extract_json(reply) or {}
        summary = (parsed.get("summary") or reply or "").strip()
        highlights = parsed.get("highlights") or []
        if not isinstance(highlights, list):
            highlights = [str(highlights)]
        return WeeklySummaryResponse(summary=summary, highlights=highlights[:5])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weekly summary error: {e}")


# ----- 3. Smart Task Suggestion -----
ALLOWED_CATEGORIES = {"care", "home", "health", "admin", "spese", "other"}


@api.post("/ai/suggest-task", response_model=SuggestTaskResponse)
async def ai_suggest_task(req: SuggestTaskRequest):
    session_id = f"suggest-{uuid.uuid4().hex[:10]}"
    today = req.today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    system_message = (
        "You are FAMMY's smart task classifier. "
        "Given a family task title, classify it into one category and suggest a due date.\n"
        "Categories:\n"
        " - care  : caring for people/pets (children, elderly, animals)\n"
        " - home  : household errands, groceries, cleaning, repairs\n"
        " - health: medical, doctor visits, medications, fitness\n"
        " - admin : paperwork, school forms, banking, taxes, appointments\n"
        " - spese : payments and bills (pagare, bolletta, rata, abbonamento)\n"
        " - other : anything that doesn't fit\n\n"
        f"Today is {today}. Suggested due date must be ISO YYYY-MM-DD format "
        "(today, tomorrow, next weekend, end of month, or null if not time-sensitive).\n"
        "Respond ONLY with valid JSON: "
        '{"category":"<one of care|home|health|admin|spese|other>", '
        '"suggested_due_date":"YYYY-MM-DD or null", '
        f'"reasoning":"<one short sentence in {lang_name(req.lang)}>"}}'
    )

    try:
        chat = new_chat(session_id, system_message)
        reply = await chat.send_message(UserMessage(text=f"Task: {req.title}"))
        parsed = extract_json(reply) or {}
        cat = (parsed.get("category") or "other").lower()
        if cat not in ALLOWED_CATEGORIES:
            cat = "other"
        due = parsed.get("suggested_due_date")
        if due in ("null", "", None):
            due = None
        return SuggestTaskResponse(
            category=cat,
            suggested_due_date=due,
            reasoning=parsed.get("reasoning") or "",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Suggest task error: {e}")


# ----- 4. Gift Ideas -----
@api.post("/ai/gift-ideas", response_model=GiftIdeasResponse)
async def ai_gift_ideas(req: GiftIdeasRequest):
    session_id = f"gift-{uuid.uuid4().hex[:10]}"
    budget = ""
    if req.budget_min is not None or req.budget_max is not None:
        lo = req.budget_min if req.budget_min is not None else 0
        hi = req.budget_max if req.budget_max is not None else 9999
        budget = f"Budget range: {lo}-{hi} EUR. "

    system_message = (
        f"You are FAMMY's gift advisor. Suggest 5 thoughtful, realistic birthday gift "
        f"ideas for a family member, in {lang_name(req.lang)}. {budget}"
        "Each idea should fit the person's role, age, and interests. "
        "Avoid clichés; aim for warm, personal suggestions. "
        "Respond ONLY with valid JSON: "
        '{"ideas":[{"title":"...", "description":"...", "price_range":"e.g. 20-40€"}, ...]}'
    )

    user_payload = {
        "name": req.member_name,
        "role": req.member_role,
        "age": req.age,
        "interests": req.interests,
    }

    try:
        chat = new_chat(session_id, system_message)
        reply = await chat.send_message(
            UserMessage(text=f"Membro famiglia:\n{json.dumps(user_payload, ensure_ascii=False)}")
        )
        parsed = extract_json(reply) or {}
        raw_ideas = parsed.get("ideas") or []
        ideas: List[GiftIdea] = []
        for it in raw_ideas[:5]:
            if not isinstance(it, dict):
                continue
            ideas.append(GiftIdea(
                title=str(it.get("title") or "").strip() or "Regalo",
                description=str(it.get("description") or "").strip(),
                price_range=str(it.get("price_range") or "").strip() or "—",
            ))
        if not ideas:
            raise HTTPException(status_code=502, detail="No ideas returned")
        return GiftIdeasResponse(ideas=ideas)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gift ideas error: {e}")


# =========================================================================
# CALENDAR ICS FEED — endpoint pubblico per Apple Calendar / Google Calendar
# =========================================================================
# L'utente genera un token segreto dal Profilo (via RPC `rotate_calendar_token`),
# poi incolla il link `/api/calendar/{token}.ics` nel suo calendar client.
# Sincronizzazione automatica ogni ~1 ora (lato client).
#
# Sicurezza: il token è un random 48-hex-chars stored in `calendar_tokens`.
# Se rubato → l'utente lo ruota dal Profilo.

def _ics_escape(text: str) -> str:
    """RFC 5545: escape commas, semicolons, backslashes, newlines."""
    if not text:
        return ""
    return (str(text)
            .replace("\\", "\\\\")
            .replace(",", "\\,")
            .replace(";", "\\;")
            .replace("\n", "\\n")
            .replace("\r", ""))


def _ics_dtstamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _ics_dt(iso_str: str) -> str:
    """Parse ISO timestamp → ICS UTC format."""
    try:
        if iso_str.endswith("Z"):
            iso_str = iso_str[:-1] + "+00:00"
        d = datetime.fromisoformat(iso_str)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        d = d.astimezone(timezone.utc)
        return d.strftime("%Y%m%dT%H%M%SZ")
    except Exception:
        return _ics_dtstamp()


def _ics_date(date_str: str) -> str:
    """YYYY-MM-DD → YYYYMMDD."""
    if not date_str:
        return ""
    return str(date_str).replace("-", "")[:8]


async def _supabase_get(client: httpx.AsyncClient, path: str, params: dict) -> list:
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    r = await client.get(f"{SUPABASE_URL}/rest/v1{path}", headers=headers, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


@api.get("/calendar/{token}.ics")
async def calendar_ics(token: str):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="ICS feed not configured on server")
    # Token validation: solo hex per evitare injection
    if not re.fullmatch(r"[a-f0-9]{16,128}", token):
        raise HTTPException(status_code=400, detail="invalid token format")

    async with httpx.AsyncClient() as client:
        # 1) Lookup user_id dal token
        rows = await _supabase_get(client, "/calendar_tokens", {
            "select": "user_id",
            "token": f"eq.{token}",
            "revoked_at": "is.null",
            "limit": "1",
        })
        if not rows:
            raise HTTPException(status_code=404, detail="token not found or revoked")
        user_id = rows[0]["user_id"]

        # 2) Trova le famiglie dell'utente (via members)
        member_rows = await _supabase_get(client, "/members", {
            "select": "id,family_id",
            "user_id": f"eq.{user_id}",
        })
        family_ids = list({m["family_id"] for m in member_rows})
        if not family_ids:
            return Response(content=_build_empty_ics(), media_type="text/calendar")

        family_filter = "(" + ",".join(family_ids) + ")"

        # 3) Eventi prossimi 12 mesi
        since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        events = await _supabase_get(client, "/events", {
            "select": "id,family_id,title,starts_at,ends_at,location,notes,recurring_days,recurring_until",
            "family_id": f"in.{family_filter}",
            "starts_at": f"gte.{since}",
        })

        # 4) Task con due_date
        tasks = await _supabase_get(client, "/tasks", {
            "select": "id,family_id,title,due_date,due_time,status,note",
            "family_id": f"in.{family_filter}",
            "due_date": "not.is.null",
            "status": "neq.done",
        })

    # Genera ICS
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//FAMMY//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:FAMMY",
        "X-WR-TIMEZONE:UTC",
    ]
    now_stamp = _ics_dtstamp()

    for ev in events:
        if not ev.get("starts_at"):
            continue
        dtstart = _ics_dt(ev["starts_at"])
        dtend = _ics_dt(ev["ends_at"]) if ev.get("ends_at") else dtstart
        lines += [
            "BEGIN:VEVENT",
            f"UID:event-{ev['id']}@fammy",
            f"DTSTAMP:{now_stamp}",
            f"DTSTART:{dtstart}",
            f"DTEND:{dtend}",
            f"SUMMARY:{_ics_escape(ev.get('title') or 'Evento')}",
        ]
        if ev.get("location"):
            lines.append(f"LOCATION:{_ics_escape(ev['location'])}")
        if ev.get("notes"):
            lines.append(f"DESCRIPTION:{_ics_escape(ev['notes'])}")
        # Recurring (semplice: BYDAY settimanale)
        rd = ev.get("recurring_days") or []
        if rd:
            byday = []
            mapping = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
            for d in rd:
                if 0 <= d < 7:
                    byday.append(mapping[d])
            if byday:
                rrule = f"RRULE:FREQ=WEEKLY;BYDAY={','.join(byday)}"
                if ev.get("recurring_until"):
                    rrule += f";UNTIL={_ics_date(ev['recurring_until'])}T235959Z"
                lines.append(rrule)
        lines.append("END:VEVENT")

    for tk in tasks:
        if not tk.get("due_date"):
            continue
        # I task vanno come VEVENT all-day per visibilità nei calendari
        dt_date = _ics_date(tk["due_date"])
        lines += [
            "BEGIN:VEVENT",
            f"UID:task-{tk['id']}@fammy",
            f"DTSTAMP:{now_stamp}",
            f"DTSTART;VALUE=DATE:{dt_date}",
            f"SUMMARY:{_ics_escape('📌 ' + (tk.get('title') or 'Incarico'))}",
        ]
        if tk.get("note"):
            lines.append(f"DESCRIPTION:{_ics_escape(tk['note'])}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    body = "\r\n".join(lines) + "\r\n"
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=300"},
    )


def _build_empty_ics() -> str:
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//FAMMY//EN\r\n"
            "X-WR-CALNAME:FAMMY\r\nEND:VCALENDAR\r\n")


# Mount router
app.include_router(api)


@app.get("/")
async def root_root():
    return {"service": "fammy-ai", "ok": True}
