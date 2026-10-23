from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
import secrets
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Response
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from starlette.responses import StreamingResponse

from .auth import get_current_user
from ..database import safety_case_events_collection, safety_evidence_collection, safety_reports_collection
from ..services.cyber_safety_service import analyze_scam_text
from ..services.safety_access import is_safety_moderator


router = APIRouter(prefix="/api/cyber-safety", tags=["Cyber Safety"])
MAX_EVIDENCE_BYTES = 8 * 1024 * 1024
MAX_EVIDENCE_FILES = 5
MAX_EVIDENCE_FILES_PER_USER = 20
MAX_EVIDENCE_BYTES_PER_USER = 40 * 1024 * 1024
EVIDENCE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


class AnalyzeScamRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    money_lost: bool = False
    credentials_shared: bool = False


class SignalResponse(BaseModel):
    code: str
    title: str
    explanation: str
    matched_terms: list[str]


class OfficialLinkResponse(BaseModel):
    label: str
    url: str


class AnalyzeScamResponse(BaseModel):
    risk_level: str
    risk_label: str
    category: str
    signals: list[SignalResponse]
    signal_count: int
    guidance: list[str]
    official_links: list[OfficialLinkResponse]
    assessment_note: str


class CreateSafetyReportRequest(BaseModel):
    category: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=2000)
    incident_date: str | None = Field(default=None, max_length=40)
    state_or_ut: str | None = Field(default=None, max_length=80)
    consent: bool = False


class AppealRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


class ReviewCaseRequest(BaseModel):
    status: Literal["under_review", "resolved", "closed"]
    note: str | None = Field(default=None, max_length=1000)


async def require_safety_moderator(current_user: dict = Depends(get_current_user)):
    if not is_safety_moderator(current_user):
        raise HTTPException(status_code=403, detail="Safety moderator access is not enabled for this account")
    return current_user


def _case_id(document: dict) -> str:
    return document.get("case_id", f"CS-{str(document['_id'])[-8:].upper()}")


def _serialize_case(document: dict, include_private: bool = False) -> dict:
    response = {
        "id": str(document["_id"]),
        "case_id": _case_id(document),
        "category": document.get("category", "Other"),
        "status": document.get("status", "open"),
        "created_at": document.get("created_at"),
        "updated_at": document.get("updated_at"),
        "evidence_count": document.get("evidence_count", 0),
    }
    if include_private:
        response.update({
            "summary": document.get("summary", ""),
            "incident_date": document.get("incident_date"),
            "state_or_ut": document.get("state_or_ut"),
            "reporter_username": document.get("reporter_username", "User"),
            "events": document.get("events", []),
        })
    return response


def _detect_evidence_type(content: bytes) -> tuple[str, str] | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp", ".webp"
    if content.startswith(b"%PDF-"):
        return "application/pdf", ".pdf"
    return None


async def _record_case_event(
    case: dict,
    actor: dict,
    actor_role: str,
    action: str,
    note: str = "",
):
    await safety_case_events_collection.insert_one({
        "case_id": case["_id"],
        "actor_id": str(actor["_id"]),
        "actor_role": actor_role,
        "action": action,
        "note": note,
        "created_at": datetime.now(timezone.utc),
        "expires_at": case["expires_at"],
    })


async def _get_authorized_case(report_id: str, current_user: dict) -> dict:
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=400, detail="Invalid case reference")
    case = await safety_reports_collection.find_one({"_id": ObjectId(report_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or expired")
    reporter_access = case.get("reporter_id") == str(current_user["_id"])
    if not reporter_access and not is_safety_moderator(current_user):
        raise HTTPException(status_code=404, detail="Case not found or expired")
    return case


def _serialize_event(event: dict, show_moderator_notes: bool) -> dict:
    result = {
        "action": event.get("action", "updated"),
        "actor_role": event.get("actor_role", "moderator"),
        "created_at": event.get("created_at"),
    }
    if show_moderator_notes or result["actor_role"] == "reporter":
        result["note"] = event.get("note", "")
    return result


async def _case_history(case: dict, current_user: dict) -> list[dict]:
    cursor = safety_case_events_collection.find({"case_id": case["_id"]}).sort("created_at", -1).limit(200)
    events = await cursor.to_list(length=200)
    events.reverse()
    if not events:
        events = case.get("events", [])
    for event in events:
        if not event.get("actor_role"):
            event["actor_role"] = "reporter" if event.get("actor_id") == case.get("reporter_id") else "moderator"
    return [_serialize_event(event, is_safety_moderator(current_user)) for event in events]


@router.post("/analyze", response_model=AnalyzeScamResponse)
async def analyze_suspicious_message(
    request: AnalyzeScamRequest,
    current_user: dict = Depends(get_current_user),
):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Paste a message before scanning")
    return analyze_scam_text(
        text,
        money_lost=request.money_lost,
        credentials_shared=request.credentials_shared,
    )


@router.post("/reports", status_code=201)
async def create_safety_report(
    request: CreateSafetyReportRequest,
    current_user: dict = Depends(get_current_user),
):
    if not request.consent:
        raise HTTPException(status_code=400, detail="Consent is required before sending a report to the Pehra safety team")
    summary = request.summary.strip()
    if not summary:
        raise HTTPException(status_code=400, detail="Add a short factual summary")

    reporter_id = str(current_user["_id"])
    open_count = await safety_reports_collection.count_documents({
        "reporter_id": reporter_id,
        "status": {"$in": ["open", "under_review", "appeal_requested"]},
    })
    if open_count >= 10:
        raise HTTPException(status_code=429, detail="You have reached the open report limit. Check your case status first.")

    now = datetime.now(timezone.utc)
    document = {
        "reporter_id": reporter_id,
        "reporter_username": current_user.get("username", "User"),
        "case_id": f"CS-{secrets.token_hex(8).upper()}",
        "category": request.category.strip(),
        "summary": summary,
        "incident_date": request.incident_date.strip() if request.incident_date else None,
        "state_or_ut": request.state_or_ut.strip() if request.state_or_ut else None,
        "status": "open",
        "events": [],
        "evidence_count": 0,
        "created_at": now,
        "updated_at": now,
        "consent_at": now,
        "consent_version": "safety-report-v1",
        "expires_at": now + timedelta(days=30),
    }
    result = await safety_reports_collection.insert_one(document)
    document["_id"] = result.inserted_id
    await _record_case_event(document, current_user, "reporter", "report_submitted")
    return _serialize_case(document)


@router.get("/reports/mine")
async def get_my_safety_reports(current_user: dict = Depends(get_current_user)):
    cursor = safety_reports_collection.find(
        {"reporter_id": str(current_user["_id"])},
        {"case_id": 1, "category": 1, "status": 1, "created_at": 1, "updated_at": 1, "evidence_count": 1},
    ).sort("created_at", -1).limit(50)
    reports = await cursor.to_list(length=50)
    return [_serialize_case(report) for report in reports]


@router.get("/reports/queue")
async def get_safety_report_queue(
    current_user: dict = Depends(require_safety_moderator),
):
    cursor = safety_reports_collection.find({
        "status": {"$in": ["open", "under_review", "appeal_requested"]},
    }).sort("created_at", 1).limit(100)
    reports = await cursor.to_list(length=100)
    for report in reports:
        report["events"] = await _case_history(report, current_user)
    return [_serialize_case(report, include_private=True) for report in reports]


@router.get("/reports/{report_id}/history")
async def get_safety_report_history(
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    case = await _get_authorized_case(report_id, current_user)
    return await _case_history(case, current_user)


@router.get("/reports/{report_id}/evidence")
async def list_safety_report_evidence(
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    case = await _get_authorized_case(report_id, current_user)
    cursor = safety_evidence_collection.find(
        {"report_id": case["_id"]},
        {"slot": 1, "content_type": 1, "size_bytes": 1, "created_at": 1},
    ).sort("slot", 1).limit(MAX_EVIDENCE_FILES)
    items = await cursor.to_list(length=MAX_EVIDENCE_FILES)
    actor_role = "moderator" if is_safety_moderator(current_user) and case.get("reporter_id") != str(current_user["_id"]) else "reporter"
    await _record_case_event(case, current_user, actor_role, "evidence_listed", f"Viewed {len(items)} evidence file(s)")
    return [{
        "id": str(item["_id"]),
        "display_name": f"Evidence {item['slot'] + 1}{EVIDENCE_TYPES.get(item['content_type'], '')}",
        "content_type": item["content_type"],
        "size_bytes": item["size_bytes"],
        "created_at": item["created_at"],
    } for item in items]


@router.post("/reports/{report_id}/evidence", status_code=201)
async def upload_safety_report_evidence(
    report_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    case = await _get_authorized_case(report_id, current_user)
    if case.get("reporter_id") != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only the reporter can add evidence")
    if case.get("status") in {"resolved", "closed"}:
        raise HTTPException(status_code=409, detail="Evidence upload is closed for this case")

    content = await file.read(MAX_EVIDENCE_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Choose a non-empty evidence file")
    if len(content) > MAX_EVIDENCE_BYTES:
        raise HTTPException(status_code=413, detail="Evidence files must be 8 MB or smaller")
    detected_type = _detect_evidence_type(content)
    if not detected_type:
        raise HTTPException(status_code=415, detail="Use a JPEG, PNG, WEBP, or PDF evidence file")
    content_type, extension = detected_type

    user_evidence = await safety_evidence_collection.find(
        {"reporter_id": case["reporter_id"]}, {"size_bytes": 1, "account_slot": 1}
    ).to_list(length=MAX_EVIDENCE_FILES_PER_USER + 1)
    if len(user_evidence) >= MAX_EVIDENCE_FILES_PER_USER:
        raise HTTPException(status_code=429, detail="Your account has reached its 20-file evidence limit")
    if sum(item.get("size_bytes", 0) for item in user_evidence) + len(content) > MAX_EVIDENCE_BYTES_PER_USER:
        raise HTTPException(status_code=429, detail="Your account has reached its 40 MB evidence limit")

    used_slots = await safety_evidence_collection.find(
        {"report_id": case["_id"]}, {"slot": 1}
    ).to_list(length=MAX_EVIDENCE_FILES)
    occupied = {item["slot"] for item in used_slots}
    occupied_account_slots = {item["account_slot"] for item in user_evidence if "account_slot" in item}
    saved_evidence = None
    for slot in range(MAX_EVIDENCE_FILES):
        if slot in occupied:
            continue
        for account_slot in range(MAX_EVIDENCE_FILES_PER_USER):
            if account_slot in occupied_account_slots:
                continue
            evidence = {
                "report_id": case["_id"],
                "reporter_id": case["reporter_id"],
                "slot": slot,
                "account_slot": account_slot,
                "content_type": content_type,
                "size_bytes": len(content),
                "sha256": sha256(content).hexdigest(),
                "content": content,
                "created_at": datetime.now(timezone.utc),
                "expires_at": case["expires_at"],
            }
            try:
                saved_evidence = await safety_evidence_collection.insert_one(evidence)
                break
            except DuplicateKeyError:
                continue
        if saved_evidence:
            break
    if saved_evidence:
        await safety_reports_collection.update_one(
            {"_id": case["_id"]}, {"$inc": {"evidence_count": 1}}
        )
        await _record_case_event(case, current_user, "reporter", "evidence_added", f"Added evidence file {slot + 1}")
        return {
            "id": str(saved_evidence.inserted_id),
            "display_name": f"Evidence {slot + 1}{extension}",
            "content_type": content_type,
            "size_bytes": len(content),
        }
    raise HTTPException(status_code=409, detail="A case holds up to five evidence files")


@router.get("/reports/{report_id}/evidence/{evidence_id}")
async def download_safety_report_evidence(
    report_id: str,
    evidence_id: str,
    current_user: dict = Depends(get_current_user),
):
    case = await _get_authorized_case(report_id, current_user)
    if not ObjectId.is_valid(evidence_id):
        raise HTTPException(status_code=400, detail="Invalid evidence reference")
    evidence = await safety_evidence_collection.find_one({
        "_id": ObjectId(evidence_id),
        "report_id": case["_id"],
    })
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found or expired")
    actor_role = "moderator" if is_safety_moderator(current_user) and case.get("reporter_id") != str(current_user["_id"]) else "reporter"
    await _record_case_event(case, current_user, actor_role, "evidence_accessed", f"Downloaded evidence {evidence['slot'] + 1}")
    extension = EVIDENCE_TYPES.get(evidence["content_type"], ".bin")
    return StreamingResponse(
        BytesIO(bytes(evidence["content"])),
        media_type=evidence["content_type"],
        headers={
            "Content-Disposition": f'attachment; filename="evidence-{evidence["slot"] + 1}{extension}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
            "Content-Security-Policy": "sandbox",
        },
    )


@router.delete("/reports/{report_id}/evidence/{evidence_id}", status_code=204)
async def delete_safety_report_evidence(
    report_id: str,
    evidence_id: str,
    current_user: dict = Depends(get_current_user),
):
    case = await _get_authorized_case(report_id, current_user)
    if case.get("reporter_id") != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only the reporter can remove evidence")
    if not ObjectId.is_valid(evidence_id):
        raise HTTPException(status_code=400, detail="Invalid evidence reference")
    evidence = await safety_evidence_collection.find_one_and_delete({
        "_id": ObjectId(evidence_id),
        "report_id": case["_id"],
    })
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found or expired")
    await safety_reports_collection.update_one(
        {"_id": case["_id"]}, {"$inc": {"evidence_count": -1}}
    )
    await _record_case_event(case, current_user, "reporter", "evidence_removed", f"Removed evidence file {evidence['slot'] + 1}")
    return Response(status_code=204)


@router.patch("/reports/{report_id}")
async def review_safety_report(
    report_id: str,
    request: ReviewCaseRequest,
    current_user: dict = Depends(require_safety_moderator),
):
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=400, detail="Invalid case reference")
    case_object_id = ObjectId(report_id)
    now = datetime.now(timezone.utc)
    result = await safety_reports_collection.update_one(
        {"_id": case_object_id},
        {"$set": {"status": request.status, "updated_at": now}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Case not found or expired")
    report = await safety_reports_collection.find_one({"_id": case_object_id})
    await _record_case_event(report, current_user, "moderator", request.status, (request.note or "").strip())
    report["events"] = await _case_history(report, current_user)
    return _serialize_case(report, include_private=True)


@router.post("/reports/{report_id}/appeal")
async def appeal_safety_report(
    report_id: str,
    request: AppealRequest,
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=400, detail="Invalid case reference")
    case_object_id = ObjectId(report_id)
    reporter_id = str(current_user["_id"])
    report = await safety_reports_collection.find_one({
        "_id": case_object_id,
        "reporter_id": reporter_id,
    })
    if not report:
        raise HTTPException(status_code=404, detail="Case not found or expired")
    if report.get("status") not in {"resolved", "closed"}:
        raise HTTPException(status_code=409, detail="A review request is available after a case is resolved")

    now = datetime.now(timezone.utc)
    result = await safety_reports_collection.update_one(
        {
            "_id": case_object_id,
            "reporter_id": reporter_id,
            "status": {"$in": ["resolved", "closed"]},
        },
        {"$set": {"status": "appeal_requested", "updated_at": now}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=409, detail="This case status changed. Refresh your report list.")
    report = await safety_reports_collection.find_one({"_id": case_object_id})
    await _record_case_event(report, current_user, "reporter", "appeal_requested", request.note.strip())
    return _serialize_case(report)
