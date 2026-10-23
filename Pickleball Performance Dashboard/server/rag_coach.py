"""Experimental RAG coaching prototype (outside increments 1–2).

Only imported by main.py when PICKLEPRO_ENABLE_EXPERIMENTAL_RAG=1. The vector
store and the Claude client are created on first use, so importing this module
does not download the embedding model or require an API key.
"""
import logging
import os
from functools import lru_cache
from typing import List, Literal, Optional

import anthropic
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Override with PICKLEPRO_RAG_MODEL to try another Claude model.
RAG_MODEL = os.getenv("PICKLEPRO_RAG_MODEL", "claude-opus-5-5")

KB_DOCS = [
    {
        "id": "dink-fundamentals",
        "title": "Dink Shot Fundamentals & Improvement Protocol",
        "content": "The dink is pickleball's most strategic shot. A 80%+ dink success rate indicates advanced kitchen control. Key improvement drills: (1) Cross-court dink rally — 10 min/session. (2) Thirds reset practice — simulate mid-rally resets. (3) Moving dink drill — lateral movement while dinking. Players below 75% should prioritize paddle angle consistency. Players between 75-80% should focus on placement variation. Players above 80% should work on speed variation and deceptive angles to keep opponents off-balance."
    },
    {
        "id": "rally-fatigue",
        "title": "Rally Length & Physical Fatigue Management",
        "content": "Research shows unforced error rates increase sharply after 15-20 shots for intermediate players. Fatigue tolerance drills: (1) 30-ball feeding drill — maintain form past shot 20. (2) Live rally tracking — identify personal error threshold and attack before it. (3) Breathing protocol — exhale on contact to manage tension buildup. Interval training 3x5 min high-intensity drills with 2-min rest improves rally endurance. Tactically, recognize your fatigue threshold and transition to attack mode at shot 14-16 to avoid entering your error zone."
    },
    {
        "id": "court-positioning",
        "title": "Court Positioning & Coverage Principles",
        "content": "Optimal court positioning requires 45%+ kitchen time (NVZ line) for advanced play. Transition zone should be minimized — it is the most vulnerable position in pickleball. Common errors: (1) Camping at baseline after a drive — prevents forward pressure. (2) Not recovering to center after wide shots — creates corridor vulnerabilities. Drill: 4-2-4 pattern — 4 dinks, 2 transition steps, 4 more dinks. Heatmap analysis showing right-side bias indicates need for left-side split-step practice. Target: 45% kitchen time, balanced left-right distribution."
    }
]


@lru_cache(maxsize=1)
def _collection():
    # ChromaDB acts as the vector store for this prototype (instead of pgvector).
    import chromadb
    from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

    # Keep the ONNX download in the working directory; on Windows the default
    # user cache folder can be locked (WinError 5).
    embedding = ONNXMiniLM_L6_V2()
    embedding.DOWNLOAD_PATH = os.path.join(os.getcwd(), ".chroma_cache")
    os.makedirs(embedding.DOWNLOAD_PATH, exist_ok=True)

    collection = chromadb.Client().get_or_create_collection(
        name="pickleball_rules_and_strategy", embedding_function=embedding)
    collection.upsert(
        documents=[doc["content"] for doc in KB_DOCS],
        metadatas=[{"title": doc["title"]} for doc in KB_DOCS],
        ids=[doc["id"] for doc in KB_DOCS],
    )
    return collection


@lru_cache(maxsize=1)
def _client() -> anthropic.Anthropic:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise ValueError("Backend ANTHROPIC_API_KEY is missing. RAG generation aborted.")
    return anthropic.Anthropic()


# ── REQUEST / RESPONSE MODELS ──────────────────────────────────────────────
class PlayerGoals(BaseModel):
    dinkTarget: int
    kitchenTarget: int
    volleyTarget: int
    focusArea: str

class Metrics(BaseModel):
    avgDinkRate: float
    unforcedErrors: float
    kitchenTime: float
    volleyRate: float

class RAGRequest(BaseModel):
    playerGoals: PlayerGoals
    metrics: Metrics
    playerName: Optional[str] = None
    sessionDate: Optional[str] = None

class RAGRecommendation(BaseModel):
    priority: Literal["HIGH", "MED", "LOW"]
    title: str
    body: str

class CoachOutput(BaseModel):
    """The part of the response Claude writes; validated by structured outputs."""
    summary: str
    recommendations: List[RAGRecommendation]

class RAGResponse(CoachOutput):
    retrievedDocs: List[str]


# ── RAG LOGIC FUNCTION ──────────────────────────────────────────────────
def generate_coach_response(payload: RAGRequest) -> RAGResponse:
    # 1. RETRIEVAL: query the vector store for the player's focus area.
    results = _collection().query(
        query_texts=[f"Pickleball strategy for {payload.playerGoals.focusArea}, dinks, and volleys"],
        n_results=3,
    )
    retrieved_texts = results["documents"][0] if results["documents"] else []
    retrieved_titles = [meta["title"] for meta in results["metadatas"][0]] if results["metadatas"] else []
    context_str = "\n\n".join(f"### {title}\n{text}" for title, text in zip(retrieved_titles, retrieved_texts))

    # 2. GENERATION: the stats come only from the request; nothing is invented.
    system_prompt = (
        "You are PicklePro's AI coaching engine. You generate personalized, data-driven "
        "pickleball post-game analysis for players using retrieved coaching knowledge. "
        "Be specific and encouraging, reference only the stats you are given, and use second-person voice."
    )
    header = " | ".join(part for part in (
        f"Player: {payload.playerName}" if payload.playerName else "",
        f"Session: {payload.sessionDate}" if payload.sessionDate else "",
    ) if part)
    m, g = payload.metrics, payload.playerGoals
    user_prompt = f"""{header}
Stats: Dink Rate {m.avgDinkRate}% (target {g.dinkTarget}%) | Kitchen Time {m.kitchenTime}% (target {g.kitchenTarget}%) | Volley Rate {m.volleyRate}% (target {g.volleyTarget}%) | Unforced Errors {m.unforcedErrors}

Retrieved coaching knowledge:
{context_str}

summary: a spoken audio coaching summary of 90-110 seconds when read aloud.
Structure: greeting, descriptive performance, positioning analysis, diagnostic finding, predictive outlook, 3 specific recommendations, closing.
Plain conversational prose only, with no markdown, headers or bullet characters.

recommendations: exactly 3 prescriptive actions, each with a short title and a 2-3 sentence body."""

    response = _client().messages.parse(
        model=RAG_MODEL,
        max_tokens=16000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt.strip()}],
        output_format=CoachOutput,
        # If a safety classifier declines, retry server-side on Anthropic's
        # recommended fallback model instead of returning a refusal.
        extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
        extra_body={"fallbacks": "default"},
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("The model declined to generate coaching for this request.")
    if response.parsed_output is None:
        raise RuntimeError(f"No coaching output (stop_reason={response.stop_reason}).")

    out = response.parsed_output
    return RAGResponse(summary=out.summary, recommendations=out.recommendations, retrievedDocs=retrieved_titles)
