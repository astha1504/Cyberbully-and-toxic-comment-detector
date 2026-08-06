import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from ..config import settings
from ..services.moderation_service import check_toxicity, TOXIC_KEYWORDS
from ..routes.auth import get_current_user

router = APIRouter(prefix="/api/moderation", tags=["Moderation"])


class CheckTextRequest(BaseModel):
    text: str


class CheckTextResponse(BaseModel):
    isToxic: bool
    score: float
    highlightedWords: List[str]
    severity: str


def _severity_from_score(score: float) -> str:
    if score >= 0.8:
        return "High"
    if score >= 0.5:
        return "Medium"
    return "Low"


@router.post("/check-text", response_model=CheckTextResponse)
async def check_text(request: CheckTextRequest, current_user: dict = Depends(get_current_user)):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    result = await check_toxicity(request.text)

    text_lower = request.text.lower()
    highlighted = [kw for kw in TOXIC_KEYWORDS if kw in text_lower]

    return {
        "isToxic": result["is_toxic"],
        "score": result["score"],
        "highlightedWords": highlighted,
        "severity": _severity_from_score(result["score"]),
    }


class RewriteRequest(BaseModel):
    text: str
    tone: Optional[str] = "polite"


class RewriteResponse(BaseModel):
    suggestion: str


@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite_text(request: RewriteRequest, current_user: dict = Depends(get_current_user)):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    prompt = (
        "You are a helpful assistant that rewrites toxic or offensive messages into polite, respectful, and constructive alternatives.\n"
        f"Original message: \"{request.text}\"\n"
        f"Desired tone: {request.tone}\n"
        "Return ONLY a single rewritten message. Do not add explanations, notes, or extra text."
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        f"?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 128,
        },
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(url, json=payload)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"LLM error: {resp.text}")

    data = resp.json()
    try:
        suggestion = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to parse LLM response: {exc}") from exc

    return {"suggestion": suggestion}


class CheckImageRequest(BaseModel):
    image_url: str


class CheckImageResponse(BaseModel):
    detectedText: str
    isToxic: bool
    score: float


@router.post("/check-image", response_model=CheckImageResponse)
async def check_image(request: CheckImageRequest, current_user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="OCR image moderation not yet implemented")


class CheckAudioRequest(BaseModel):
    audio_url: str


class CheckAudioResponse(BaseModel):
    transcription: str
    isToxic: bool
    score: float


@router.post("/check-audio", response_model=CheckAudioResponse)
async def check_audio(request: CheckAudioRequest, current_user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Audio moderation not yet implemented")
