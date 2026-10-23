import unittest
from contextlib import ExitStack
from datetime import timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.routes import cyber_safety as safety_routes
from app.services import safety_access
from tests.fakes import FakeDatabase


class CyberSafetyApiTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        database = FakeDatabase()
        self.reports = database["safety_reports"]
        self.evidence = database["safety_evidence"]
        self.events = database["safety_case_events"]
        self.reporter = {
            "_id": ObjectId("65a000000000000000000011"),
            "username": "reporter",
            "email": "reporter@example.com",
        }
        self.moderator = {
            "_id": ObjectId("65a000000000000000000012"),
            "username": "moderator",
            "email": "moderator@example.com",
        }
        self.stranger = {
            "_id": ObjectId("65a000000000000000000013"),
            "username": "stranger",
            "email": "stranger@example.com",
        }
        self.current_user = self.reporter
        self.stack.enter_context(patch.object(safety_routes, "safety_reports_collection", self.reports))
        self.stack.enter_context(patch.object(safety_routes, "safety_evidence_collection", self.evidence))
        self.stack.enter_context(patch.object(safety_routes, "safety_case_events_collection", self.events))
        self.stack.enter_context(patch.object(
            safety_access.settings,
            "SAFETY_MODERATOR_EMAILS",
            "moderator@example.com",
        ))
        app.dependency_overrides[safety_routes.get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.stack.close()

    def create_report(self, summary="A suspicious text arrived"):
        return self.client.post("/api/cyber-safety/reports", json={
            "category": "Fraud message",
            "summary": summary,
            "incident_date": "2026-10-20",
            "state_or_ut": "Uttar Pradesh",
            "consent": True,
        })

    def test_analyze_returns_explainable_signals_and_indian_guidance(self):
        response = self.client.post("/api/cyber-safety/analyze", json={
            "text": "URGENT e-Challan overdue. Install this APK: https://fake.example/app.apk",
            "money_lost": True,
        })

        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        signal_codes = {signal["code"] for signal in result["signals"]}
        self.assertIn("e_challan_theme", signal_codes)
        self.assertIn("malicious_install", signal_codes)
        self.assertEqual(result["signal_count"], len(result["signals"]))
        self.assertIn("not a probability", result["assessment_note"])
        links = {item["url"] for item in result["official_links"]}
        self.assertIn("https://echallan.parivahan.gov.in/", links)
        self.assertIn("https://www.cert-in.org.in/s2cMainServlet?CACODE=CICA-2026-3492&pageid=PUBADV01", links)
        self.assertIn("https://sancharsaathi.gov.in/sfc/", links)
        self.assertIn("tel:1930", links)
        self.assertNotIn("URGENT e-Challan overdue. Install this APK: https://fake.example/app.apk", response.text)
        self.assertEqual(len(self.reports.documents), 0)

    def test_reports_require_consent_and_keep_summary_private_from_reporter_list(self):
        denied = self.client.post("/api/cyber-safety/reports", json={
            "category": "Fraud message",
            "summary": "Private case details",
            "consent": False,
        })
        self.assertEqual(denied.status_code, 400)

        created = self.create_report("Private case details")
        self.assertEqual(created.status_code, 201, created.text)
        case = created.json()
        self.assertTrue(case["case_id"].startswith("CS-"))
        self.assertEqual(case["status"], "open")
        self.assertNotIn("summary", case)
        saved = self.reports.documents[0]
        self.assertEqual(saved["summary"], "Private case details")
        self.assertEqual(saved["consent_version"], "safety-report-v1")
        self.assertEqual(saved["expires_at"].tzinfo, timezone.utc)

        mine = self.client.get("/api/cyber-safety/reports/mine")
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.json()), 1)
        self.assertNotIn("summary", mine.json()[0])
        self.assertEqual(len(self.events.documents), 1)

        self.current_user = self.stranger
        self.assertEqual(self.client.get("/api/cyber-safety/reports/mine").json(), [])
        self.assertEqual(self.client.get(f"/api/cyber-safety/reports/{case['id']}/history").status_code, 404)

    def test_moderator_queue_review_history_and_reporter_appeal(self):
        created = self.create_report()
        self.assertEqual(created.status_code, 201, created.text)
        case = created.json()

        denied_queue = self.client.get("/api/cyber-safety/reports/queue")
        self.assertEqual(denied_queue.status_code, 403)

        self.current_user = self.moderator
        queue = self.client.get("/api/cyber-safety/reports/queue")
        self.assertEqual(queue.status_code, 200, queue.text)
        self.assertEqual(queue.json()[0]["summary"], "A suspicious text arrived")
        self.assertEqual(queue.json()[0]["reporter_username"], "reporter")

        reviewed = self.client.patch(f"/api/cyber-safety/reports/{case['id']}", json={
            "status": "under_review",
            "note": "Checking the sender details",
        })
        self.assertEqual(reviewed.status_code, 200, reviewed.text)
        self.assertEqual(reviewed.json()["status"], "under_review")
        self.assertEqual(reviewed.json()["events"][-1]["note"], "Checking the sender details")

        resolved = self.client.patch(f"/api/cyber-safety/reports/{case['id']}", json={
            "status": "resolved",
            "note": "Review complete",
        })
        self.assertEqual(resolved.status_code, 200, resolved.text)

        self.current_user = self.reporter
        history = self.client.get(f"/api/cyber-safety/reports/{case['id']}/history")
        self.assertEqual(history.status_code, 200)
        moderator_events = [item for item in history.json() if item["actor_role"] == "moderator"]
        self.assertTrue(moderator_events)
        self.assertTrue(all("note" not in item for item in moderator_events))

        appeal = self.client.post(f"/api/cyber-safety/reports/{case['id']}/appeal", json={
            "note": "Please review the outcome",
        })
        self.assertEqual(appeal.status_code, 200, appeal.text)
        self.assertEqual(appeal.json()["status"], "appeal_requested")

    def test_appeal_is_unavailable_before_resolution_and_moderator_status_is_protected(self):
        created = self.create_report()
        case_id = created.json()["id"]

        early_appeal = self.client.post(f"/api/cyber-safety/reports/{case_id}/appeal", json={
            "note": "Please review",
        })
        self.assertEqual(early_appeal.status_code, 409)
        self.assertEqual(self.client.patch(f"/api/cyber-safety/reports/{case_id}", json={"status": "closed"}).status_code, 403)

    def test_evidence_upload_access_download_and_reporter_removal(self):
        created = self.create_report()
        self.assertEqual(created.status_code, 201, created.text)
        case = created.json()
        case_id = case["id"]
        image_bytes = b"\x89PNG\r\n\x1a\n" + b"safe demo evidence"

        uploaded = self.client.post(
            f"/api/cyber-safety/reports/{case_id}/evidence",
            files={"file": ("screenshot.bin", image_bytes, "application/octet-stream")},
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        evidence = uploaded.json()
        self.assertEqual(evidence["content_type"], "image/png")
        self.assertEqual(self.reports.documents[0]["evidence_count"], 1)

        listed = self.client.get(f"/api/cyber-safety/reports/{case_id}/evidence")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["display_name"], "Evidence 1.png")
        self.assertNotIn("content", listed.json()[0])
        self.assertNotIn("sha256", listed.json()[0])

        downloaded = self.client.get(
            f"/api/cyber-safety/reports/{case_id}/evidence/{evidence['id']}"
        )
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded.content, image_bytes)
        self.assertEqual(downloaded.headers["cache-control"], "private, no-store")
        self.assertEqual(downloaded.headers["x-content-type-options"], "nosniff")

        self.current_user = self.stranger
        self.assertEqual(self.client.get(f"/api/cyber-safety/reports/{case_id}/evidence").status_code, 404)
        self.assertEqual(self.client.delete(
            f"/api/cyber-safety/reports/{case_id}/evidence/{evidence['id']}"
        ).status_code, 404)

        self.current_user = self.reporter
        deleted = self.client.delete(
            f"/api/cyber-safety/reports/{case_id}/evidence/{evidence['id']}"
        )
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.reports.documents[0]["evidence_count"], 0)
        self.assertEqual(len(self.evidence.documents), 0)

    def test_evidence_rejects_unknown_file_types_and_upload_after_case_closure(self):
        created = self.create_report()
        case = created.json()
        invalid = self.client.post(
            f"/api/cyber-safety/reports/{case['id']}/evidence",
            files={"file": ("script.svg", b"<svg></svg>", "image/svg+xml")},
        )
        self.assertEqual(invalid.status_code, 415)

        self.current_user = self.moderator
        closed = self.client.patch(f"/api/cyber-safety/reports/{case['id']}", json={"status": "closed"})
        self.assertEqual(closed.status_code, 200, closed.text)

        self.current_user = self.reporter
        uploaded = self.client.post(
            f"/api/cyber-safety/reports/{case['id']}/evidence",
            files={"file": ("proof.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        )
        self.assertEqual(uploaded.status_code, 409)

    def test_report_history_records_evidence_access_and_invalid_ids_are_rejected(self):
        created = self.create_report()
        case_id = created.json()["id"]
        self.assertEqual(self.client.get("/api/cyber-safety/reports/not-an-id/history").status_code, 400)
        self.assertEqual(self.client.get("/api/cyber-safety/reports/not-an-id/evidence").status_code, 400)
        self.assertEqual(self.client.get(f"/api/cyber-safety/reports/{case_id}/evidence/not-an-id").status_code, 400)

        self.assertEqual(self.client.post(f"/api/cyber-safety/reports/{case_id}/appeal", json={"note": "x"}).status_code, 409)
        timeline = self.client.get(f"/api/cyber-safety/reports/{case_id}/history")
        self.assertEqual(timeline.status_code, 200)
        self.assertEqual(timeline.json()[0]["action"], "report_submitted")


if __name__ == "__main__":
    unittest.main()
