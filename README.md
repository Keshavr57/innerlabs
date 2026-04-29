# Prompt Tracking System

A production-ready distributed application for AI prompt processing with comprehensive retry logic, failure tracking, and persistent storage.

## 🏗️ Architecture

```

│   Client    │
└──────┬──────┘
       │ HTTP REST
       ▼
┌─────────────────────────────────────────┐
│       Node.js Backend API (Port 3000)   │
│  ┌─────────────────────────────────┐   │
│  │  Express Routes & Controllers   │   │
│  └────────────┬────────────────────┘   │
│               │                         │
│  ┌────────────▼────────────────────┐   │
│  │   Retry Logic & Orchestration   │   │
│  │   (Owns request lifecycle)      │   │
│  └────────────┬────────────────────┘   │
│               │                         │
│  ┌────────────▼────────────────────┐   │
│  │   MongoDB Service Layer         │   │
│  └────────────┬────────────────────┘   │
└───────────────┼─────────────────────────┘
                │
                ├──────────────┐
                │              │
                ▼              ▼
         ┌───────────┐   ┌──────────┐
         │  MongoDB  │   │  Python  │
         │ Database  │   │AI Service│
         └───────────┘   └────┬─────┘
                              │
                              ▼
                         ┌─────────┐
                         │  Groq   │
                         │   API   │
                         └─────────┘
```

## ✨ Features

- **Automatic Retry Logic**: Exponential backoff with up to 3 attempts for transient failures
- **Comprehensive Failure Logging**: Every failure is logged to MongoDB for analysis
- **No Lost Requests**: All requests are tracked in the database, even if processing fails
- **History Retrieval**: Query past prompts and responses with filtering
- **Production-Ready**: Docker support, health checks, error handling, and monitoring
- **Property-Based Testing**: Correctness properties verified with 100+ iterations

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB (or use Docker Compose)
- Groq API Key

### Option 1: Docker Compose (Recommended)

1. Clone the repository
2. Create `.env` file in the root directory:
```bash
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

3. Start all services:
```bash
docker-compose up --build
```

4. Access the services:
   - Backend API: http://localhost:3000
   - AI Service: http://localhost:8000
   - MongoDB: localhost:27017

### Option 2: Local Development

#### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI
npm start
```

#### AI Service Setup

```bash
cd ai-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Groq API key
uvicorn app.main:app --reload
```

## 📡 API Endpoints

### Submit Prompt

```bash
POST /api/prompt
Content-Type: application/json

{
  "prompt": "Explain quantum computing"
}
```

**Response (Success):**
```json
{
  "request_id": "507f1f77bcf86cd799439011",
  "prompt": "Explain quantum computing",
  "response": "Quantum computing uses quantum bits...",
  "status": "success",
  "retry_count": 0,
  "timestamp": "2024-01-15T10:30:00Z",
  "model": "llama-3.3-70b-versatile",
  "tokens_used": 150
}
```

**Response (Failure):**
```json
{
  "request_id": "507f1f77bcf86cd799439011",
  "prompt": "Explain quantum computing",
  "status": "failed",
  "error": "AI service unavailable after 3 attempts",
  "retry_count": 3,
  "timestamp": "2024-01-15T10:30:15Z"
}
```

### Get History

```bash
GET /api/history
```

**Optional Query Parameters:**
- `prompt`: Filter by prompt text (e.g., `?prompt=quantum`)
- `status`: Filter by status (e.g., `?status=failed`)

**Response:**
```json
{
  "total": 150,
  "records": [
    {
      "request_id": "...",
      "prompt": "...",
      "response": "...",
      "status": "success",
      "retry_count": 1,
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Health Check

```bash
GET /health
```

## 🧪 Testing

### Run All Tests

```bash
cd backend
npm test
```

### Run Property-Based Tests

```bash
npm run test:properties
```

### Run with Coverage

```bash
npm test -- --coverage
```

## 🏛️ Project Structure

```
.
├── backend/                 # Node.js Backend API
│   ├── src/
│   │   ├── config/         # Database configuration
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Validation & error handling
│   │   ├── models/         # Mongoose schemas
│   │   ├── routes/         # Express routes
│   │   ├── services/       # Business logic
│   │   └── server.js       # Entry point
│   ├── tests/              # Jest tests
│   └── Dockerfile
│
├── ai-service/             # Python AI Service
│   ├── app/
│   │   ├── models/         # Pydantic schemas
│   │   ├── routes/         # FastAPI routes
│   │   ├── services/       # Groq API client
│   │   └── main.py         # Entry point
│   └── Dockerfile
│
└── docker-compose.yml      # Multi-service orchestration
```

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```bash
MONGODB_URI=mongodb://localhost:27017/prompt-tracking-system
AI_SERVICE_URL=http://localhost:8000
PORT=3000
NODE_ENV=development
DB_MAX_POOL_SIZE=10
DB_MIN_POOL_SIZE=2
```

**AI Service (.env):**
```bash
GROQ_API_KEY=your_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
PORT=8000
HOST=0.0.0.0
```

## 📊 Monitoring

### Health Checks

- Backend: `GET http://localhost:3000/health`
- AI Service: `GET http://localhost:8000/health`

### Logs

- Backend logs: Console output with structured error logging
- AI Service logs: Uvicorn access logs
- Database logs: MongoDB logs in Docker volume

## 🔄 Retry Strategy

- **Maximum Attempts**: 3 (1 initial + 2 retries)
- **Backoff Strategy**: Exponential (1s, 2s)
- **Retryable Errors**: timeout, rate_limit, network
- **Non-Retryable Errors**: api_error (4xx), unknown

## 🧠 Architecture Decisions

**Why two separate services (Node.js + Python)?**
I could have built everything in one service, but the AI processing part has a very different job from the rest of the system. The Node backend handles HTTP, database, retry logic, and orchestration — things Node is great at. The Python service does one thing: talk to the Groq API. Keeping them separate means I can swap out the AI provider, scale the AI service independently, or replace it entirely without touching the backend. It also keeps each service small and easy to reason about.

**Why does retry logic live in the backend, not the AI service?**
The backend owns the database, so it's the only place that can persist retry state. If the AI service handled retries internally, we'd have no visibility into what happened — no failure logs, no retry counts in the database. By keeping retry logic in the backend, every attempt is tracked and the request state survives even if the server restarts mid-retry.

**Why save the request to the database before calling the AI service?**
I wanted to guarantee that no request is ever lost. If I called the AI service first and then the server crashed before saving, that request would disappear completely. By writing a `pending` record first, I always have a trace of the request regardless of what happens next. The record gets updated to `success` or `failed` once the retry cycle completes.

**Why log every failed attempt instead of just the final failure?**
A single "failed after 3 attempts" message doesn't tell you much. Logging each attempt separately means I can see whether attempt 1 timed out, attempt 2 hit a rate limit, and attempt 3 got a network error — which is much more useful for debugging. It also makes it easy to spot patterns, like rate limits always happening at a specific time of day.

**Why exponential backoff?**
Linear retries (retry every 1 second) can make things worse — if the Groq API is overloaded, hammering it every second just adds more load. Exponential backoff (1s, then 2s) gives the service time to recover between attempts. It's a small thing but it's the right behaviour for a production system.

**Why keep the AI service stateless?**
The AI service holds no database connections, no session state, nothing. This means I can run multiple instances of it behind a load balancer without any coordination between them. It also makes it simpler to deploy and easier to test in isolation.

**Scalability thought process**
I didn't over-engineer this for scale, but I made sure the foundation is right. Both services are stateless, MongoDB uses a connection pool, and the services are containerised so they can be scaled horizontally if needed. The main bottleneck would be the Groq API rate limits, which the retry logic already handles gracefully.

## 🛡️ Error Handling

- **400 Bad Request**: Invalid prompt (empty, too long, whitespace-only)
- **500 Internal Server Error**: Database or server errors
- **503 Service Unavailable**: AI service unavailable after retries

## 📈 Scalability

- **Stateless Services**: Both backend and AI service are stateless
- **Connection Pooling**: MongoDB connection pool (min: 2, max: 10)
- **Horizontal Scaling**: Services can be scaled independently
- **Async Operations**: All I/O operations use async/await

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with Express.js, FastAPI, MongoDB, and Groq API
- Property-based testing with fast-check
- Containerization with Docker

## 📞 Support

For issues and questions, please open a GitHub issue.
