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
from datetime import datetime, timezone
from typing import List, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException
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

    system_message = (
        f"You are FAMMY, a warm and helpful family-organization assistant. "
        f"Answer in {lang_name(req.lang)}. Be conversational, friendly, concise, "
        f"and use light emoji when natural. You help with tasks, meal planning, "
        f"birthdays, shared expenses, weekly planning, kids' activities, "
        f"and general home organization. Never invent data: if asked about "
        f"specific tasks or events you don't see in the context, ask the user.\n\n"
        f"=== Family context ===\n{family_ctx}"
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


# Mount router
app.include_router(api)


@app.get("/")
async def root_root():
    return {"service": "fammy-ai", "ok": True}
