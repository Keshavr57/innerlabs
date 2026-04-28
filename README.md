# Prompt Tracking System

A production-ready distributed application for AI prompt processing with comprehensive retry logic, failure tracking, and persistent storage.

## 🏗️ Architecture

```
┌─────────────┐
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
