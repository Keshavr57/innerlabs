"""
AI Service entry point.

Stateless FastAPI microservice — receives prompts from the Node.js backend,
calls the Groq API, and returns structured responses. No database access or
retry logic; all orchestration lives in the backend.
"""

import os
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

if not os.getenv("GROQ_API_KEY"):
    raise ValueError("GROQ_API_KEY environment variable is required but not set")

app = FastAPI(
    title="Prompt Tracking System — AI Service",
    description="Python microservice for AI prompt processing via Groq LLM API",
    version="1.0.0",
)

# Only the Node.js backend needs to call this service
ALLOWED_ORIGINS = [
    "https://innerlabs-backend.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"service": "ai-service", "status": "running", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ai-service",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0",
    }


from app.routes.prompt_routes import router as prompt_router  # noqa: E402
app.include_router(prompt_router, tags=["prompts"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("NODE_ENV") != "production",
        log_level="info",
    )
