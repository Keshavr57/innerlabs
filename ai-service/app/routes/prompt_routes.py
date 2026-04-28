"""
Prompt Processing Routes

This module defines the FastAPI routes for prompt processing in the AI Service.
It provides the REST API endpoint that the Node.js backend calls to process prompts.

Design Decision: Keep routes simple and focused on HTTP handling.
All business logic lives in the groq_service module for better separation of concerns.

Architecture:
- POST /process: Receives prompts from Node.js backend, calls Groq API, returns responses
- Routes validate requests using Pydantic models (automatic validation)
- Routes return appropriate HTTP status codes based on response type
- All errors are structured and returned as ErrorResponse objects

This module is the entry point for all prompt processing requests from the backend.
"""

from fastapi import APIRouter, HTTPException, status
from app.models.schemas import PromptRequest, PromptResponse, ErrorResponse
from app.services.groq_service import process_prompt

# Create router for prompt-related endpoints
# Design Decision: Use APIRouter for modular route organization
# This router is included in main.py with the /process prefix
router = APIRouter()


@router.post("/process", response_model=PromptResponse | ErrorResponse)
async def process_prompt_endpoint(request: PromptRequest):
    """
    Process a prompt by calling the Groq API and return the AI-generated response.
    
    This endpoint is the core of the AI Service. It receives prompts from the Node.js
    backend, processes them using the Groq API, and returns structured responses.
    
    Design Decision: Return union type (PromptResponse | ErrorResponse) to handle
    both success and error cases with proper typing. FastAPI automatically serializes
    the response based on the actual type returned.
    
    Request Flow:
    1. FastAPI validates incoming request against PromptRequest schema
    2. If validation fails, FastAPI automatically returns 422 Unprocessable Entity
    3. If validation succeeds, call groq_service.process_prompt
    4. groq_service returns either PromptResponse or ErrorResponse
    5. Return the response with appropriate HTTP status code
    
    Error Handling:
    - Validation errors (422): Handled automatically by FastAPI/Pydantic
    - Groq API errors: Returned as ErrorResponse with appropriate status code
    - Unexpected errors: Caught and returned as 500 Internal Server Error
    
    Args:
        request: PromptRequest object containing prompt text and request_id
                 - Automatically validated by Pydantic
                 - FastAPI returns 422 if validation fails
    
    Returns:
        PromptResponse: On success, contains AI response, model, and tokens_used
                        - HTTP 200 OK
        ErrorResponse: On failure, contains error details and classification
                       - HTTP status code matches error_type (408, 429, 502, 500)
    
    Raises:
        HTTPException: Only for unexpected errors not handled by groq_service
    """
    try:
        # Call the Groq service to process the prompt
        # Design Decision: Delegate all business logic to groq_service
        # This keeps the route handler thin and focused on HTTP concerns
        result = await process_prompt(request.prompt, request.request_id)
        
        # Check if the result is an error response
        if isinstance(result, ErrorResponse):
            # Return error response with appropriate HTTP status code
            # Design Decision: Use the status_code from ErrorResponse to maintain
            # consistent HTTP semantics across the API
            # Note: We return the ErrorResponse object directly, not raise HTTPException
            # This allows the backend to parse the structured error response
            return result
        
        # Return success response (PromptResponse)
        # FastAPI automatically serializes to JSON with HTTP 200 OK
        return result
    
    except Exception as e:
        # Catch any unexpected errors that weren't handled by groq_service
        # Design Decision: Return structured ErrorResponse even for unexpected errors
        # This ensures the backend always receives a consistent error format
        return ErrorResponse(
            error=f"Unexpected error in prompt processing endpoint: {str(e)}",
            error_type="unknown",
            retry_after=0,  # Don't retry unexpected errors
            status_code=500  # HTTP 500 Internal Server Error
        )
