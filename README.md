# Socialite: AI Cyberbully & Toxic Comment Detector 🛡️

End-to-end safety analytics: **User Comments → Sequence Classification NLP Model → Real-Time WebSockets → FastAPI Backend → Live React Dashboard**.

## Architecture

```mermaid
graph TD
    A[Social Media Feed / User Input] -->|Post / Comment| B[FastAPI Backend]
    
    subgraph "AI Moderation Engine"
        B -->|Keyword Pre-filter check| C{Is Explicit?}
        C -->|No| D[HuggingFace Sequence Classification NLP Model]
        D -->|Toxicity Score & Label| E{Is Toxic?}
    end
    
    E -->|Yes| F[Auto-Blur & Flag Content]
    C -->|Yes| F
    
    F -->|WebSocket Alert| G[Real-Time Notification System]
    
    subgraph "React Frontend System"
        G -->|Alert Triangle| H[🚨 User Moderation Alert]
        B -->|Comment Feed| I[💬 Post Feed Update]
        B -->|Analytics API| J[📊 Moderator Dashboard]
    end
```

## ✨ Premium Application Features

1.  **AI Moderation Engine (Important)**: Real-time detection of abusive, hate, and toxic speech using a hybrid pipeline of keyword checks and deep learning sequence classification.
2.  **Real-Time WebSocket Notifications**: Integrated STOMP/WebSocket alerts that instantly notify users if a comment violates community guidelines (flashes a red Warning/AlertTriangle).
3.  **Analytics & Toxicity Heatmap**: A visual admin layout charting the trends of flagged content, overall user toxicity ratings, and general community health metrics.
4.  **Auto-Blur Detection Preview**: A simulated social media feed showing blurred toxic comments natively alongside clean posts.

## Quick Start — 5 Commands

```bash
# 1. Clone and install backend dependencies
cd backend && pip install -r requirements.txt

# 2. Add sample social media dummy data (50 users, 100 posts)
python fix_data.py

# 3. Start the FastAPI backend
uvicorn app.main:app --reload --port 8000

# 4. Start the React frontend 
cd ../frontend && npm install && npm run dev

# 5. Access the Local App
# Open http://localhost:5173
```

- **API docs**: http://localhost:8000/docs  
- **App Dashboard**: http://localhost:5173

## Docker (one command)

```bash
docker compose up --build
```

- API: http://localhost:8000/docs  
- Dashboard: http://localhost:5173

## Running the Toxicity Moderation Engine

Place your PyTorch/Safetensors moderation weights under `backend/model/`. If no weights are found, the system intelligently defaults to standard baseline fallback configurations.

Then run:

```bash
# Seed the backend with fresh valid users and dummy posts
cd backend
python fix_data.py

# Or if you just want unstructured dummy generation:
python generate_data.py
```

Moderation is performed asynchronously in the background.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/comments/` | Creates a comment & Triggers Background ML Toxicity Task |
| `PATCH`| `/notifications/read-all` | Marks all moderation socket alerts as Read |
| `POST` | `/posts/{id}/like` | Updates user interaction & handles post engagement |
| `GET`  | `/posts/` | Feed data query with hydrated authors and comments count |
| `GET`  | `/analytics/toxic-comments` | Chart metrics representing weekly flagged content trends |
| `GET`  | `/notifications/` | Real-time fetch of user's personal alerts |
| `WS`   | `/ws/notifications` | Upgrades connection to WebSocket for live pinging |

## Moderation payload Schema

```json
{
  "_id": "647f123abc456",
  "post_id": "65b9c1d...",
  "user_id": "673cf82...",
  "content": "This is a hateful comment",
  "moderation_status": "flagged",
  "is_blurred": true,
  "is_toxic": true,
  "toxicity_score": 0.98,
  "created_at": "2026-06-19T14:22:10Z"
}
```

## Live WebSockets & Moderation Demo 

The frontend implements a robust WebSocket connection. To watch your comments get detected and flagged live:

```bash
# Terminal 1 — start API
cd backend && uvicorn app.main:app --port 8000

# Terminal 2 — start dashboard
cd frontend && npm run dev
```

Open http://localhost:5173, log into your profile, and test posting an abusive keyword. Watch the **🔴 Moderation Warning** slide in dynamically through your notification system, instantly blurring the text on the public feed!

## Tests

```bash
cd backend
pytest tests/ -v
pytest tests/ --cov=app --cov-report=term-missing
```

Covers: ML pipeline fallback testing, background task integration, WebSocket payloads, toxicity keyword exact matching, and missing field validation.

## Data Structure (read-only)

| Path | Contents |
|------|----------|
| `backend/model/*.safetensors` | Neural Network Weights |
| `backend/model/config.json` | Tokenizer configuration and `id2label` mapping |
| `backend/app/services/moderation_service.py` | Asynchronous ML inference and keyword filtering |
| `backend/app/database.py` | MongoDB connection & collections instance |
| `backend/fix_data.py` | Custom Faker script resolving ID constraints |

**Never modify raw tensors under `backend/model/`.**

## Edge Cases Handled

| Edge Case | How We Handle It |
|-----------|-----------------|
| ML Model Missing/Loading | Automatically falls back to keyword-based filtering + sets safety flags while PyTorch loads into memory |
| Socket Disconnects | React `useSocket` reconnects. Missed alerts are re-polled via standard HTTP GET `/notifications/` |
| Invalid Comment Data | Schema validation catches missing text/empty strings before it ever hits the HuggingFace Transformer |
| UI Empty States | Empty suggestions/notifications render bespoke empty-state "Zero items" mockups gracefully |
| Null Relational Data | Custom script (`fix_data`) injects strict `ObjectId` mapping to prevent `Unknown` user rendering |

See [CHOICES.md](CHOICES.md) for architecture and decision rationale.
