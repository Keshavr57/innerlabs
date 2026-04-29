# Prompt Tracking System

A distributed system for processing AI prompts with retry logic, failure tracking, and persistent storage.

---

## Architecture

```
Client
  │
  ▼
Node.js Backend (Express)
  ├── validates request
  ├── saves to MongoDB (status: pending)
  ├── calls Python AI Service with retry logic
  ├── logs each failed attempt to MongoDB
  └── updates final status (success / failed)
        │
        ▼
  Python AI Service (FastAPI)
        │
        ▼
     Groq API
```

The backend owns everything — orchestration, retries, and the database. The Python service just wraps the Groq API and stays stateless.

---

## Features

- Retry with exponential backoff (up to 3 attempts)
- Every failed attempt logged separately to MongoDB
- Request saved to DB before AI call — no request is ever lost
- History endpoint with filtering by status or prompt text
- Health check endpoints on both services

---

## API

**Submit a prompt**
```
POST /api/prompt
{ "prompt": "your text here" }
```

Success response:
```json
{
  "request_id": "...",
  "prompt": "...",
  "response": "...",
  "status": "success",
  "retry_count": 0,
  "timestamp": "...",
  "model": "llama-3.3-70b-versatile",
  "tokens_used": 150
}
```

Failure response (503):
```json
{
  "request_id": "...",
  "status": "failed",
  "error": "AI service unavailable after 3 attempts",
  "retry_count": 3
}
```

**Get history**
```
GET /api/history
GET /api/history?status=failed
GET /api/history?prompt=quantum
```

---

## Architecture Decisions

**Why two separate services?**
The AI part and the backend part have completely different jobs. Node handles HTTP, database, and orchestration — things it's good at. The Python service does one thing: call the Groq API. Keeping them separate means I can swap the AI provider or scale it independently without touching the backend.

**Why does retry logic live in the backend?**
The backend owns the database, so it's the only place that can actually track retry state. If the AI service retried internally, I'd have no visibility — no failure logs, no retry counts. Keeping it in the backend means every attempt is recorded and survives a server restart.

**Why save to DB before calling the AI service?**
If the server crashes after the AI call but before saving, the request disappears. Writing a `pending` record first guarantees I always have a trace of the request, no matter what happens next.

**Why log every failed attempt separately?**
"Failed after 3 attempts" doesn't tell you much. Logging each attempt means I can see that attempt 1 timed out, attempt 2 hit a rate limit, and attempt 3 failed with a network error. That's actually useful for debugging.

**Why exponential backoff?**
Retrying immediately every second can make an overloaded service worse. Waiting 1s then 2s gives it time to recover. It's a small thing but it's the right default behaviour.

**Why keep the AI service stateless?**
No database, no session state. This means I can run multiple instances behind a load balancer without any coordination. It also makes it much easier to test and deploy.

---

## How to Run

**With Docker (recommended)**
```bash
# add GROQ_API_KEY to .env
docker-compose up --build
```

**Locally**
```bash
# Backend
cd backend && npm install && npm start

# AI Service
cd ai-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Environment variables**

Backend:
```
MONGODB_URI=...
AI_SERVICE_URL=http://localhost:8000
PORT=3000
```

AI Service:
```
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
PORT=8000
```
