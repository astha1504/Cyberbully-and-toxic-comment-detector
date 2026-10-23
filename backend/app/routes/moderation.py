import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from ..config import settings
from ..services.moderation_service import check_toxicity
from ..services.image_ocr import extract_text_from_image_data
from ..routes.auth import get_current_user

router = APIRouter(prefix="/api/moderation", tags=["Moderation"])
logger = logging.getLogger(__name__)


def _provider_error_code(response: httpx.Response) -> Optional[str]:
    """Extract a short provider error code without logging its raw response body."""
    try:
        payload = response.json()
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    error = payload.get("error")
    if not isinstance(error, dict):
        return None
    code = error.get("code") or error.get("type")
    return str(code)[:80] if code else None


class CheckTextRequest(BaseModel):
    text: str


class CheckTextResponse(BaseModel):
    isToxic: bool
    score: float
    highlightedWords: List[str]
    severity: str
    verified: bool
    categoryScores: dict[str, int]
    categoryScoreSource: str


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

    return {
        "isToxic": result["is_toxic"],
        "score": result["score"],
        "highlightedWords": result.get("highlighted_words", []),
        "severity": _severity_from_score(result["score"]),
        "verified": result.get("source") not in {"fallback", "error"},
        "categoryScores": result.get("category_scores", {}),
        "categoryScoreSource": result.get("category_score_source", "phrase_match"),
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

    api_key = getattr(settings, "GROQ_API_KEY", None)
    if not api_key or not api_key.strip():
        logger.error("Rewrite request unavailable: GROQ_API_KEY is not configured")
        raise HTTPException(
            status_code=503,
            detail="AI rewriting is not configured. Set GROQ_API_KEY in backend/.env and restart the backend.",
        )

    from ..services.moderation_service import TOXIC_KEYWORDS

    text_lower = request.text.lower()
    masked_words = {}
    sanitized = request.text

    for kw in TOXIC_KEYWORDS:
        if kw in text_lower:
            placeholder = f"[{kw}]"
            masked_words[kw] = placeholder
            sanitized = sanitized.replace(kw, placeholder)

    prompt = (
        "You are a content-moderation assistant.\n"
        "A message was flagged as toxic. Rewrite it into a polite, respectful, constructive alternative.\n"
        f"Original message: \"{sanitized}\"\n"
        f"Desired tone: {request.tone}\n"
        "Return only the rewritten message. Do not include analysis, a heading, or an explanation."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": settings.GROQ_REWRITE_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_completion_tokens": 512,
    }
    if settings.GROQ_REWRITE_MODEL.startswith("openai/gpt-oss-"):
        payload.update({"reasoning_effort": "low", "reasoning_format": "hidden"})

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {api_key}"}
            )
    except httpx.TimeoutException as exc:
        logger.warning("Rewrite provider timed out (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=504,
            detail="The rewrite service took too long to respond. Please try again shortly.",
        ) from exc
    except httpx.RequestError as exc:
        logger.warning("Could not reach rewrite provider (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="Could not reach the rewrite service. Please try again shortly.",
        ) from exc

    if resp.status_code != 200:
        provider_code = _provider_error_code(resp) or "unknown"
        logger.warning(
            "Rewrite provider returned HTTP %s (code=%s)",
            resp.status_code,
            provider_code,
        )
        if resp.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="The rewrite service is busy. Please wait a moment and try again.",
            )
        if resp.status_code in {401, 403}:
            raise HTTPException(
                status_code=503,
                detail="The rewrite service credentials were rejected. Ask the administrator to check the backend configuration.",
            )
        if resp.status_code == 404:
            raise HTTPException(
                status_code=502,
                detail="The configured rewrite model was not found. Check GROQ_REWRITE_MODEL in backend/.env and restart the backend.",
            )
        raise HTTPException(
            status_code=502,
            detail="The rewrite service could not complete this request. Please try again shortly.",
        )

    try:
        data = resp.json()
    except ValueError as exc:
        logger.warning("Rewrite provider returned non-JSON completion (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="The rewrite service returned an unreadable response. Please try again.",
        ) from exc

    choices = data.get("choices") if isinstance(data, dict) else None
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        logger.warning("Rewrite provider completion was missing a valid choice")
        raise HTTPException(
            status_code=502,
            detail="The rewrite service returned an invalid response. Please try again.",
        )

    first_choice = choices[0]
    message = first_choice.get("message")
    if not isinstance(message, dict):
        logger.warning("Rewrite provider completion was missing a message")
        raise HTTPException(
            status_code=502,
            detail="The rewrite service returned an invalid response. Please try again.",
        )

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        finish_reason = first_choice.get("finish_reason")
        if finish_reason not in {"stop", "length", "tool_calls", "content_filter"}:
            finish_reason = "unknown"
        logger.warning("Rewrite provider completion contained no text (finish_reason=%s)", finish_reason)
        if finish_reason == "length":
            detail = "The rewrite model ran out of response tokens. Please try again or edit your message manually."
        elif finish_reason == "content_filter":
            detail = "The rewrite model could not provide a rewrite. Please edit your message manually."
        else:
            detail = "The rewrite model returned no text. Please try again or edit your message manually."
        raise HTTPException(
            status_code=502,
            detail=detail,
        )

    return {"suggestion": content.strip()}


class CheckImageRequest(BaseModel):
    image_data: str


class CheckImageResponse(BaseModel):
    detectedText: str
    isToxic: bool
    score: float
    highlightedWords: List[str]
    categoryScores: dict[str, int]
    verified: bool


@router.post("/check-image", response_model=CheckImageResponse)
async def check_image(request: CheckImageRequest, current_user: dict = Depends(get_current_user)):
    try:
        detected_text = await extract_text_from_image_data(request.image_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result = await check_toxicity(detected_text) if detected_text else {
        "is_toxic": False,
        "score": 0.0,
        "source": "ocr_no_text",
        "highlighted_words": [],
        "category_scores": {"insult": 0, "harassment": 0, "threat": 0},
    }
    return {
        "detectedText": detected_text,
        "isToxic": result["is_toxic"],
        "score": result["score"],
        "highlightedWords": result.get("highlighted_words", []),
        "categoryScores": result.get("category_scores", {}),
        "verified": result.get("source") not in {"fallback", "error"},
    }


class CheckAudioResponse(BaseModel):
    transcription: str
    isToxic: bool
    score: float
    highlightedWords: List[str]
    categoryScores: dict[str, int]
    verified: bool


@router.post("/check-audio", response_model=CheckAudioResponse)
async def check_audio(
    audio: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    supported_types = {
        "audio/flac", "audio/mpeg", "audio/mp4", "audio/mp4a-latm",
        "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm",
        "video/mp4", "video/webm",
    }
    mime_type = (audio.content_type or "").split(";", 1)[0].lower()
    if mime_type not in supported_types | {"audio/x-m4a", "audio/m4a"}:
        raise HTTPException(status_code=400, detail="Upload an MP3, MP4, M4A, OGG, WAV, FLAC, or WEBM file")

    max_audio_bytes = 20 * 1024 * 1024
    audio_bytes = await audio.read(max_audio_bytes + 1)
    if not audio_bytes or len(audio_bytes) > max_audio_bytes:
        raise HTTPException(status_code=413, detail="Audio must be between 1 byte and 20 MB")

    api_key = getattr(settings, "GROQ_API_KEY", None)
    if not api_key:
        raise HTTPException(status_code=503, detail="Voice moderation requires GROQ_API_KEY to be configured")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                data={"model": "whisper-large-v3-turbo", "response_format": "json"},
                files={"file": (audio.filename or "voice.webm", audio_bytes, mime_type)},
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Audio transcription service is unavailable") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Audio transcription failed")
    try:
        transcription = response.json().get("text", "").strip()
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=502, detail="Audio transcription returned an invalid response") from exc

    result = await check_toxicity(transcription) if transcription else {
        "is_toxic": False,
        "score": 0.0,
        "source": "empty_transcription",
        "highlighted_words": [],
        "category_scores": {"insult": 0, "harassment": 0, "threat": 0},
    }
    return {
        "transcription": transcription,
        "isToxic": result["is_toxic"],
        "score": result["score"],
        "highlightedWords": result.get("highlighted_words", []),
        "categoryScores": result.get("category_scores", {}),
        "verified": result.get("source") not in {"fallback", "error"},
    }
