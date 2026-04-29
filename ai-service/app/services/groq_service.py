"""
Groq API integration.

Stateless — one function, one responsibility: call Groq and return a typed result.
All retry logic and persistence live in the Node.js backend.

FAIL_MODE env var (for testing retry & failure-logging behaviour):
  network     → retryable network error  (backend will retry 3×)
  timeout     → retryable timeout error  (backend will retry 3×)
  rate_limit  → retryable rate-limit     (backend will retry 3×)
  always_fail → non-retryable api_error  (backend stops after 1 attempt)
  (unset)     → normal operation
"""

import os
from groq import Groq, APIError, APIConnectionError, RateLimitError, APITimeoutError
from app.models.schemas import PromptResponse, ErrorResponse

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "mixtral-8x7b-32768")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable is required but not set")

groq_client = Groq(api_key=GROQ_API_KEY)


async def process_prompt(prompt: str, request_id: str) -> PromptResponse | ErrorResponse:
    """Call the Groq API and return a structured success or error response."""

    # Inject failures for testing — remove or leave unset in production
    fail_mode = os.getenv("FAIL_MODE", "").lower()
    if fail_mode == "network":
        return ErrorResponse(error="[FAIL_MODE] Simulated network error", error_type="network", retry_after=3, status_code=502)
    if fail_mode == "timeout":
        return ErrorResponse(error="[FAIL_MODE] Simulated timeout", error_type="timeout", retry_after=5, status_code=408)
    if fail_mode == "rate_limit":
        return ErrorResponse(error="[FAIL_MODE] Simulated rate limit", error_type="rate_limit", retry_after=10, status_code=429)
    if fail_mode == "always_fail":
        return ErrorResponse(error="[FAIL_MODE] Simulated non-retryable error", error_type="api_error", retry_after=0, status_code=400)

    try:
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=GROQ_MODEL,
        )
        return PromptResponse(
            response=completion.choices[0].message.content or "",
            model=completion.model,
            tokens_used=completion.usage.total_tokens,
        )

    except APITimeoutError as e:
        return ErrorResponse(error=f"Groq timeout: {e}", error_type="timeout", retry_after=5, status_code=408)

    except RateLimitError as e:
        return ErrorResponse(error=f"Groq rate limit: {e}", error_type="rate_limit", retry_after=10, status_code=429)

    except APIConnectionError as e:
        return ErrorResponse(error=f"Groq connection error: {e}", error_type="network", retry_after=3, status_code=502)

    except APIError as e:
        status_code = getattr(e, "status_code", 500)
        return ErrorResponse(
            error=f"Groq API error: {e}",
            error_type="api_error",
            retry_after=5 if status_code >= 500 else 0,
            status_code=status_code,
        )

    except Exception as e:
        return ErrorResponse(error=f"Unexpected error: {e}", error_type="unknown", retry_after=0, status_code=500)
