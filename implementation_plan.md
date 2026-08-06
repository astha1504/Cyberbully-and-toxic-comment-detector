# Socialite - AI-Powered Cyberbullying Prevention Platform
## Implementation Plan

> **Project Goal**
>
> Transform the existing toxic comment detection social media application into a complete **AI-powered Cyberbullying Prevention and Moderation Platform** capable of preventing, detecting, explaining, and moderating abusive behavior across text, images, and voice.

---

# Current Status

The following features are already implemented:

- User Authentication (JWT)
- Social Media Feed
- Posts & Comments with auto-blur toxicity
- Real-time Chat (WebSocket)
- Toxic Comment Detection (background ML task)
- Toxic Chat Detection (context-aware, relationship-based thresholds)
- Trained ML Toxicity Model (XLM-RoBERTa, quantized, fine-tuned on balanced Hinglish+English dataset)
- Context Service for conversation history
- User Behaviour tracking (`user_behaviour` collection)
- MongoDB Database (Motor async)
- React Frontend (Vite)
- FastAPI + Python Backend

This implementation plan should **build on the existing project** without breaking current functionality.

---

# Overall Architecture

```
                         User
                           │
                           ▼
                  React Frontend
                           │
                           ▼
                   FastAPI Backend
                           │
         ┌─────────────────┼──────────────────┐
         │                 │                  │
         ▼                 ▼                  ▼
   Toxicity Model      Gemini API      Behaviour Service
         │                 │                  │
         └─────────────────┼──────────────────┘
                           ▼
                Context Analysis Layer
                           ▼
                Explainability Layer
                           ▼
               AI Rewrite Suggestion
                           ▼
                User Decision Engine
                           ▼
           Behaviour Tracking & Analytics
                           ▼
                      MongoDB
```

---

# Development Guidelines

## Important Rules

- Do **NOT** remove any existing functionality.
- Keep the existing toxicity model unchanged.
- Follow the current folder structure.
- Keep UI consistent with the existing design.
- Use reusable React components.
- Create reusable backend services.
- Write clean and modular code.
- Add comments where necessary.
- Avoid duplicate logic.

---

# Phase 1 — Real-Time AI Intervention

## Status: ✅ COMPLETED

## Objective

Warn users before they post toxic content.

## Workflow

```
User types message

↓

Every few characters

↓

Send text to toxicity model

↓

Prediction

↓

If Safe
    Continue typing

If Toxic
    Show warning popup
```

## Frontend

Created reusable component: `components/AIInterventionModal.jsx`

### Modal UI

Title: ⚠ Your message may hurt others

Display:
- Toxicity Score
- Severity (High/Medium/Low)
- Highlighted Words

Buttons:
- Edit Message
- Replace with AI Suggestion
- Post Anyway
- Cancel

## Backend

Created endpoint: `POST /api/moderation/check-text`

Response:
```json
{
    "isToxic": true,
    "score": 0.91,
    "highlightedWords": ["idiot"],
    "severity": "High"
}
```

## Integrated Into

- `CreatePost.jsx` — modal opens before sharing
- `Chat.jsx` — modal opens before sending messages

---

# Phase 2 — AI Rewrite Assistant

## Status: ✅ COMPLETED

## Objective

Instead of only warning users, help them rewrite messages politely.

## Workflow

```
Toxic Message

↓

Gemini API

↓

Generate polite alternative

↓

Display suggestion
```

## Example

Input: `You are an idiot.`
Output: `I respectfully disagree with your point of view.`

## Backend endpoint

`POST /api/moderation/rewrite`

Response:
```json
{
    "suggestion": "I respectfully disagree with your point of view."
}
```

## Frontend Component

`components/RewriteSuggestion.jsx` — displayed inside `AIInterventionModal` when toxicity is detected.

Buttons:
- Replace
- Dismiss

## Integration

When `AIInterventionModal` detects toxicity, it automatically fetches a rewrite suggestion from Gemini and displays it below the warning banner.

---

# Phase 3 — Explainable AI

## Status: ✅ COMPLETED

## Objective

Show users why their message was classified as toxic.

## Frontend Components

- `components/ToxicityBadge.jsx` — inline badge for flagged content
- `components/SeverityBadge.jsx` — color-coded severity pill

## Display

- Confidence score
- Severity badge (High/Medium/Low)
- Highlighted toxic words in warning banner
- Flagged words as tags

## Backend

Extended prediction response includes `highlightedWords`, `severity`, and `score`.

---

# Phase 4 — Context-Aware Detection

## Status: ✅ COMPLETED

## Objective

Use previous conversation history during prediction.

## Backend Service

`services/context_service.py`

Functions:
- `get_conversation_context(conversation_id, limit=10)` — fetches last 10 messages
- `build_context_prompt(messages, current_text, current_user_id)` — formats context for model
- `compute_context_score(conversation_id)` — calculates toxicity density and pattern label

## Context Format

```
User A: Hello
User B: Hi
User A [TOXIC]: Nobody likes you
User B: Leave me alone
Current User: You are pathetic
```

## Pattern Detection

- 0–2 toxic messages: standard check
- 3–4 toxic messages: `potential_bullying`
- 5+ toxic messages: `suppression_pattern`

## Integration

Context scoring is used in `check_chat_toxicity()` for relationship-aware thresholds:
- Friends: relaxed threshold 0.6–0.7
- Strangers: strict threshold 0.4–0.5

---

# Phase 5 — Repeat Offender Detection

## Status: ✅ COMPLETED

## Objective

Track abusive users over time.

## Database Collection

`user_behaviour`

### Schema

| Field | Type | Description |
|-------|------|-------------|
| user_id | ObjectId | Reference to user |
| warning_count | int | Number of warnings received |
| toxic_comments | int | Count of toxic comments |
| edited_comments | int | Count of edited comments |
| mute_until | string? | ISO timestamp of mute expiry |
| ban_count | int | Number of bans |
| last_violation | string? | ISO timestamp of last violation |
| toxicity_score | float | Calculated risk score 0.0–1.0 |

## Backend Service

`services/user_behaviour_service.py`

Functions:
- `get_or_create_behaviour(user_id)` — ensures behaviour record exists
- `record_violation(user_id, toxicity_score)` — increments warnings, applies mute/ban escalation
- `record_edit(user_id)` — increments edited comments count
- `calculate_risk_score(user_id)` — computes weighted risk score
- `is_muted(user_id)` — checks mute expiry

## Workflow

```
Toxic Comment
    ↓
record_violation()
    ↓
1st offence → Warning
    ↓
2nd offence → Final warning
    ↓
3rd offence → 24 hour mute
    ↓
5th offence → Ban escalation
```

---

# Phase 6 — User Behaviour Dashboard

## Status: ✅ COMPLETED

## Frontend Page

`pages/UserBehaviour.jsx` + `UserBehaviour.css`

Route: `/behaviour`

### Displays

- Warnings count
- Toxic comments count
- Edited comments count
- Ban count
- Risk score (0.0–1.0)
- Safety rate percentage
- Mute banner with expiry time
- Safety tips

### Navigation

Added `Activity` icon to `Navbar.jsx` linking to `/behaviour`

---

# Phase 7 — OCR Image Toxicity Detection

## Status: ⏳ STUB ONLY

## Objective

Detect toxicity hidden inside images and memes.

## Backend

Endpoint: `POST /api/moderation/check-image`

Current status: Returns `501 Not Implemented`

## Recommended Libraries

- EasyOCR
- Tesseract

## TODO

- Add OCR service
- Extract text from images
- Run toxicity check on extracted text

---

# Phase 8 — Voice Note Toxicity

## Status: ⏳ STUB ONLY

## Objective

Detect abusive speech in voice notes.

## Backend

Endpoint: `POST /api/moderation/check-audio`

Current status: Returns `501 Not Implemented`

## Recommended

- Whisper (OpenAI)

## TODO

- Add speech-to-text service
- Transcribe audio
- Run toxicity check on transcription

---

# Phase 9 — Moderator Dashboard

## Status: ❌ REMOVED

## Original Objective

Provide moderation tools for administrators.

## Decision

Removed as per user request. Community analytics remain accessible via `/analytics`.

## Retained

- Analytics overview
- Toxic comments feed
- Toxicity trend charts
- User behaviour tracking (personal, not admin)

---

# Actual Backend Structure

```
backend/
├── app/
│   ├── main.py                          # FastAPI app, router registration
│   ├── config.py                        # Settings from .env
│   ├── database.py                      # MongoDB collections
│   ├── models/
│   │   ├── user.py                      # User schemas
│   │   ├── social.py                    # Post/Comment schemas
│   │   └── user_behaviour.py            # Behaviour schema
│   ├── routes/
│   │   ├── auth.py                      # Login/register/JWT
│   │   ├── posts.py                     # Posts CRUD + like
│   │   ├── comments.py                  # Comments + background moderation
│   │   ├── chat.py                      # Conversations + messages
│   │   ├── websockets.py                # Real-time WS handler + toxicity
│   │   ├── notifications.py             # Notifications
│   │   ├── analytics.py                 # Overview, trends, user behaviour
│   │   └── moderation.py                # Phase 1-3: check-text, rewrite, stubs
│   ├── services/
│   │   ├── moderation_service.py        # ML inference, keywords, chat toxicity
│   │   ├── websocket_manager.py         # Connection manager
│   │   ├── auth_service.py              # Password hashing, JWT
│   │   ├── context_service.py           # Phase 4: conversation context
│   │   └── user_behaviour_service.py    # Phase 5: warnings, mutes, risk score
│   └── utils/
├── model/                               # Fine-tuned XLM-RoBERTa model
│   ├── config.json                      # Model config + id2label
│   ├── pytorch_model_quantized.bin      # Quantized weights
│   ├── tokenizer.json                   # Vocabulary
│   └── tokenizer_config.json            # Tokenizer config
├── data/
│   └── balanced_toxicity_dataset.csv    # Training data (7,309 samples, Hinglish+English)
├── requirements.txt
└── .env                                 # Includes GEMINI_API_KEY
```

## Actual Frontend Structure

```
frontend/src/
├── components/
│   ├── Layout/
│   │   └── Navbar.jsx                   # Updated with /behaviour link
│   ├── Post/
│   │   ├── PostCard.jsx                 # Auto-blur toxic comments
│   │   └── Post.css
│   ├── AIInterventionModal.jsx          # Phase 1: pre-post toxicity check + rewrite
│   ├── AIInterventionModal.css
│   ├── RewriteSuggestion.jsx            # Phase 2: Gemini rewrite UI
│   ├── RewriteSuggestion.css
│   ├── ToxicityBadge.jsx                # Phase 3: inline badge
│   ├── ToxicityBadge.css
│   ├── SeverityBadge.jsx               # Phase 3: severity pill
│   └── SeverityBadge.css
├── pages/
│   ├── Home.jsx                         # Feed
│   ├── CreatePost.jsx                   # Wired to AIInterventionModal
│   ├── Chat.jsx                         # Wired to AIInterventionModal
│   ├── Analytics.jsx                    # Community analytics
│   ├── UserBehaviour.jsx                # Phase 6: personal behaviour profile
│   ├── UserBehaviour.css
│   ├── Profile.jsx
│   ├── Login.jsx / Register.jsx
│   ├── Explore.jsx / Notifications.jsx
├── context/
│   ├── AuthContext.jsx
│   ├── ThemeContext.jsx
│   └── SocketContext.jsx                # WebSocket adapter
├── services/
│   ├── api.js                           # All API calls including moderation
│   └── socket.js
├── utils/
│   └── constants.js
└── App.jsx                              # Routes: /, /create, /chat, /analytics, /behaviour
```

---

# API Endpoints

## Existing (unchanged)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login, returns JWT |
| GET | `/auth/me` | Current user |
| GET | `/posts/` | Feed |
| POST | `/posts/` | Create post |
| POST | `/posts/{id}/like` | Like post |
| DELETE | `/posts/{id}/like` | Unlike post |
| DELETE | `/posts/{id}` | Delete post |
| POST | `/comments/` | Create comment + background moderation |
| GET | `/comments/post/{post_id}` | Get post comments |
| DELETE | `/comments/{id}` | Delete comment |
| GET | `/chat/conversations` | User conversations |
| GET | `/chat/messages/{conv_id}` | Conversation messages |
| POST | `/chat/conversation` | Create conversation |
| WS | `/ws/notifications` | Real-time notifications + chat moderation |
| GET | `/notifications/` | User notifications |
| PATCH | `/notifications/{id}/read` | Mark read |
| PATCH | `/notifications/read-all` | Mark all read |
| GET | `/analytics/overview` | Community stats |
| GET | `/analytics/toxic-comments` | Recent toxic comments |
| GET | `/analytics/toxicity-trend` | 14-day toxic trend |

## New (this implementation)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/moderation/check-text` | Pre-post toxicity check | ✅ |
| POST | `/api/moderation/rewrite` | Gemini rewrite suggestion | ✅ |
| POST | `/api/moderation/check-image` | Image moderation stub | ⏳ 501 |
| POST | `/api/moderation/check-audio` | Audio moderation stub | ⏳ 501 |
| GET | `/analytics/user-behaviour` | Personal behaviour profile | ✅ |
| POST | `/analytics/record-violation` | Record toxic comment | ✅ |
| POST | `/analytics/record-edit` | Record edited comment | ✅ |

---

# Technology Stack

| Feature | Technology |
|----------|------------|
| Text Toxicity | XLM-RoBERTa (fine-tuned, quantized, Hinglish+English) |
| AI Rewrite | Gemini 2.0 Flash API |
| Context Analysis | Custom Python service |
| Behaviour Tracking | MongoDB + custom service |
| Charts | Recharts |
| Database | MongoDB + Motor (async) |
| Backend | FastAPI + Python |
| Frontend | React + Vite |
| Real-time | Raw WebSockets + JWT |
| Authentication | JWT (python-jose) |

---

# Model Details

## Architecture

- **Base model**: XLM-RoBERTa-base
- **Task**: Binary sequence classification (`non_offensive` vs `toxic`)
- **Weights**: Quantized (`pytorch_model_quantized.bin`, ~816 MB)
- **Tokenizer**: XLMRobertaTokenizer (max 512 tokens)
- **Languages**: Hindi + English (code-mixed Hinglish supported)

## Dataset

- **File**: `backend/data/balanced_toxicity_dataset.csv`
- **Samples**: 7,309
- **Labels**: Binary (`is_toxic`: 0/1)
- **Abuse types**: offense, race, religion, sex, hate, defame, fake
- **Balance**: Balanced dataset

## Fallback

- Keyword pre-filter for explicit slurs
- Graceful degradation if model fails to load

---

# Deliverables

## Completed

- ✅ Existing toxic comment detection
- ✅ Existing toxic chat detection
- ✅ AI intervention before posting (`AIInterventionModal`)
- ✅ AI-generated polite rewrite suggestions (Gemini)
- ✅ Toxic word highlighting + severity badges
- ✅ Explainable toxicity predictions
- ✅ Context-aware moderation using previous messages
- ✅ Repeat offender tracking (`user_behaviour` collection)
- ✅ User behaviour analytics dashboard (`/behaviour`)
- ✅ FastAPI backend with moderation routes
- ✅ Clean, modular, production-ready code

## Not Started / Stubs

- ⏳ OCR-based image toxicity detection (`/api/moderation/check-image` returns 501)
- ⏳ Voice note toxicity detection (`/api/moderation/check-audio` returns 501)

## Removed

- ❌ Moderator dashboard (removed as per user request)
- ❌ Admin-only endpoints (warn-user, mute-user, ban-user, repeat-offenders)

---

# Final Goal

The final product is an **AI-powered Trust & Safety Platform** for social media that proactively prevents cyberbullying through real-time intervention, explainable AI, multimodal content analysis, behavioral monitoring, and intelligent moderation workflows.
