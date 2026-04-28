"""
Groq API Service

This module provides the interface to the Groq LLM API for processing prompts.
It handles API client initialization, prompt processing, and comprehensive error handling.

Design Decision: This service is stateless and focused solely on Groq API communication.
All retry logic, persistence, and orchestration is handled by the Node.js backend.

Error Classification:
- timeout: Request exceeded time limit
- rate_limit: Groq API rate limit exceeded (429)
- network: Network connectivity issues
- api_error: Groq API returned an error response
- unknown: Unexpected errors that don't fit other categories

FAIL_MODE (env var) — for testing retry & error-logging behaviour:
  FAIL_MODE=network      → always return a retryable network error (3 retries expected)
  FAIL_MODE=timeout      → always return a retryable timeout error (3 retries expected)
  FAIL_MODE=rate_limit   → always return a retryable rate-limit error (3 retries expected)
  FAIL_MODE=always_fail  → return a non-retryable api_error (stops after 1 attempt)
  (unset / empty)        → normal operation
"""

import os
from groq import Groq
from groq import APIError, APIConnectionError, RateLimitError, APITimeoutError
from app.models.schemas import PromptResponse, ErrorResponse


# Initialize Groq client with API key from environment
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "mixtral-8x7b-32768")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable is required but not set")

groq_client = Groq(api_key=GROQ_API_KEY)


async def process_prompt(prompt: str, request_id: str) -> PromptResponse | ErrorResponse:
    """
    Process a prompt via the Groq API and return a structured response.

    When FAIL_MODE env var is set, returns a simulated error immediately so you
    can observe retry logic and failure logging without hitting the real API.
    """
    # ── FAIL_MODE injection ──────────────────────────────────────────────────
    fail_mode = os.getenv("FAIL_MODE", "").lower()
    if fail_mode == "network":
        return ErrorResponse(
            error="[FAIL_MODE] Simulated network error",
            error_type="network",
            retry_after=3,
            status_code=502
        )
    elif fail_mode == "timeout":
        return ErrorResponse(
            error="[FAIL_MODE] Simulated timeout error",
            error_type="timeout",
            retry_after=5,
            status_code=408
        )
    elif fail_mode == "rate_limit":
        return ErrorResponse(
            error="[FAIL_MODE] Simulated rate limit error",
            error_type="rate_limit",
            retry_after=10,
            status_code=429
        )
    elif fail_mode == "always_fail":
        return ErrorResponse(
            error="[FAIL_MODE] Simulated non-retryable API error",
            error_type="api_error",
            retry_after=0,
            status_code=400
        )
    # ── Normal operation ─────────────────────────────────────────────────────
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=GROQ_MODEL,
        )

        response_text = chat_completion.choices[0].message.content or ""
        model_used = chat_completion.model
        tokens_used = chat_completion.usage.total_tokens

        return PromptResponse(
            response=response_text,
            model=model_used,
            tokens_used=tokens_used
        )

    except APITimeoutError as e:
        return ErrorResponse(
            error=f"Groq API request timed out: {str(e)}",
            error_type="timeout",
            retry_after=5,
            status_code=408
        )

    except RateLimitError as e:
        return ErrorResponse(
            error=f"Groq API rate limit exceeded: {str(e)}",
            error_type="rate_limit",
            retry_after=10,
            status_code=429
        )

    except APIConnectionError as e:
        return ErrorResponse(
            error=f"Failed to connect to Groq API: {str(e)}",
            error_type="network",
            retry_after=3,
            status_code=502
        )

    except APIError as e:
        status_code = getattr(e, 'status_code', 500)
        retry_after = 5 if status_code >= 500 else 0
        return ErrorResponse(
            error=f"Groq API error: {str(e)}",
            error_type="api_error",
            retry_after=retry_after,
            status_code=status_code
        )

    except Exception as e:
        return ErrorResponse(
            error=f"Unexpected error processing prompt: {str(e)}",
            error_type="unknown",
            retry_after=0,
            status_code=500
        )
