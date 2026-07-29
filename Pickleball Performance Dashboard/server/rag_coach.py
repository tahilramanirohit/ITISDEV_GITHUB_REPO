import os
import json
import chromadb
from chromadb.utils import embedding_functions
import anthropic
from pydantic import BaseModel
from typing import List, Optional

# Load API key securely on the backend
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# ── IN-MEMORY VECTOR STORE & STRATEGY DATABASE ─────────────────────────────
chroma_client = chromadb.Client()
default_ef = embedding_functions.DefaultEmbeddingFunction()
# ChromaDB acts as our vector store for the MVP (replacing pgvector for local testing)
collection = chroma_client.create_collection(name="pickleball_rules_and_strategy", embedding_function=default_ef)

# Strategy Document Library
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

# Insert documents into Chroma Vector Store for fast semantic retrieval
collection.add(
    documents=[doc["content"] for doc in KB_DOCS],
    metadatas=[{"title": doc["title"]} for doc in KB_DOCS],
    ids=[doc["id"] for doc in KB_DOCS]
)

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

class RAGRecommendation(BaseModel):
    priority: str
    title: str
    body: str

class RAGResponse(BaseModel):
    summary: str
    recommendations: List[RAGRecommendation]
    retrievedDocs: List[str]
    confidence: float

# ── RAG LOGIC FUNCTION ──────────────────────────────────────────────────
def generate_coach_response(payload: RAGRequest) -> RAGResponse:
    # 1. RETRIEVAL: Query Vector DB based on player's focus area
    search_query = f"Pickleball strategy for {payload.playerGoals.focusArea}, dinks, and volleys"
    results = collection.query(
        query_texts=[search_query],
        n_results=3
    )
    
    retrieved_texts = results['documents'][0] if results['documents'] else []
    retrieved_titles = [meta['title'] for meta in results['metadatas'][0]] if results['metadatas'] else []
    context_str = "\n\n".join([f"### {title}\n{text}" for title, text in zip(retrieved_titles, retrieved_texts)])

    # 2. GENERATION: Build RAG prompt with context & Player Baseline Data
    system_prompt = (
        "You are PicklePro's AI coaching engine. You generate personalized, data-driven "
        "pickleball post-game analysis for players using retrieved coaching knowledge. "
        "Be specific, encouraging, and reference exact stats. Use second-person voice."
    )
    
    user_prompt = f"""
Player: Alex Garcia | Session: July 8, 2026
Stats: Dink Rate {payload.metrics.avgDinkRate}% (target {payload.playerGoals.dinkTarget}%) | Kitchen Time {payload.metrics.kitchenTime}% (target {payload.playerGoals.kitchenTarget}%) | Volley Rate {payload.metrics.volleyRate}% (target {payload.playerGoals.volleyTarget}%) | Rally Fatigue Threshold 18 shots

Retrieved coaching knowledge:
{context_str}

TASK 1: Write a spoken audio coaching summary (90-110 seconds at 0.92 speech rate).
Structure: greeting -> descriptive performance -> positioning analysis -> diagnostic finding -> predictive outlook -> 3 specific recommendations -> closing.
Plain prose only — no markdown, headers, or bullet characters. Conversational tone.

TASK 2: Return exactly 3 prescriptive action recommendations.

Format your ENTIRE response as a valid JSON object matching this schema exactly:
{{
  "summary": "The plain prose text here...",
  "recommendations": [
    {{ "priority": "HIGH" or "MED" or "LOW", "title": "Short title", "body": "2-3 sentences" }}
  ]
}}
"""

    if not ANTHROPIC_API_KEY:
        raise ValueError("Backend ANTHROPIC_API_KEY is missing. RAG generation aborted.")

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1500,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )
        
        response_text = response.content[0].text.strip()
        
        # Extract JSON block securely
        json_start = response_text.find('{')
        json_end = response_text.rfind('}') + 1
        json_str = response_text[json_start:json_end]
        data = json.loads(json_str)
        
        recs = [RAGRecommendation(**rec) for rec in data.get("recommendations", [])]
        return RAGResponse(
            summary=data.get("summary", ""),
            recommendations=recs,
            retrievedDocs=retrieved_titles,
            confidence=0.92
        )
            
    except Exception as e:
        print(f"RAG Generation Error: {e}")
        raise
