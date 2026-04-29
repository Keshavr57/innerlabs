from fastapi import APIRouter
from app.models.schemas import PromptRequest, PromptResponse, ErrorResponse
from app.services.groq_service import process_prompt

router = APIRouter()


@router.post("/process", response_model=PromptResponse | ErrorResponse)
async def process_prompt_endpoint(request: PromptRequest):
    """
    Process a prompt via the Groq API.

    Returns PromptResponse on success or ErrorResponse on failure.
    The backend inspects error_type to decide whether to retry.
    FastAPI handles request validation (422) automatically via Pydantic.
    """
    try:
        return await process_prompt(request.prompt, request.request_id)
    except Exception as e:
        return ErrorResponse(
            error=f"Unexpected error: {str(e)}",
            error_type="unknown",
            retry_after=0,
            status_code=500,
        )
