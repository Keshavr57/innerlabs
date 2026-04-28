"""
FastAPI Application Entry Point

This module initializes the FastAPI application for the AI Service.
The AI Service is responsible for processing prompts by interfacing with the Groq LLM API.

Design Decision: The AI Service remains stateless and simple, with no database access or retry logic.
All orchestration, retry logic, and persistence is handled by the Node.js backend.

Architecture:
- This service receives prompts from the Node.js backend
- Calls the Groq API for AI processing
- Returns responses back to the backend
- Remains horizontally scalable due to stateless design
"""

import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env file
load_dotenv()

# Load required environment variables
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Validate that required environment variables are present
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable is required but not set")

# Initialize FastAPI application
app = FastAPI(
    title="Prompt Tracking System - AI Service",
    description="Python microservice for AI prompt processing using Groq LLM API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
# Design Decision: Allow requests from Node.js backend (localhost:3000) for development
# In production, this should be restricted to specific backend URLs
# CORS Configuration — allow backend and localhost
origins = [
    "https://innerlabs-backend.onrender.com",  # Render backend
    "http://localhost:3000",                    # local backend dev
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,           # Allow requests from Node.js backend
    allow_credentials=True,          # Allow cookies and authentication headers
    allow_methods=["*"],             # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],             # Allow all headers for development flexibility
)


# Root endpoint for basic service verification
@app.get("/")
async def root():
    """
    Root endpoint that returns basic service information.
    
    Returns:
        dict: Service name and status
    """
    return {
        "service": "Prompt Tracking System - AI Service",
        "status": "running",
        "version": "1.0.0"
    }


# Health check endpoint for monitoring
@app.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring and service verification.
    
    This endpoint is used by:
    - Monitoring tools to verify service availability
    - Node.js backend to check if AI service is running
    - Container orchestration systems (Docker, Kubernetes) for health checks
    
    Design Decision: Returns timestamp and service information for debugging.
    A healthy service returns HTTP 200 with service details.
    
    Returns:
        dict: Health status, timestamp, and service information
    """
    from datetime import datetime
    
    return {
        "status": "healthy",
        "service": "ai-service",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0"
    }


# Register prompt processing routes
# Design Decision: Import and include the router after app initialization
# This keeps route definitions modular and organized in separate files
from app.routes.prompt_routes import router as prompt_router

app.include_router(
    prompt_router,
    tags=["prompts"]
)


# Uvicorn Server Configuration
if __name__ == "__main__":
    import uvicorn
    
    # Load server configuration from environment variables with defaults
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    
    # Run the FastAPI application with uvicorn
    # Design Decision: Use reload=True for development to auto-reload on code changes
    # In production, reload should be set to False for better performance
    uvicorn.run(
        "app.main:app",           # Application module path
        host=host,                # Server host (default: 0.0.0.0 for all interfaces)
        port=port,                # Server port (default: 8000)
        reload=True,              # Auto-reload on code changes (development mode)
        log_level="info"          # Logging level for server output
    )
