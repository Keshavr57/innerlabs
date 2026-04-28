/**
 * Prompt Controller
 * 
 * This module contains the controller functions for handling prompt-related HTTP requests.
 * Controllers orchestrate the complete request lifecycle by coordinating between services
 * (AI service, retry service, database service) and returning responses to clients.
 * 
 * Design Decision: Controllers own the request orchestration logic (not services) to:
 * 1. Keep services focused on single responsibilities (AI calls, retries, database ops)
 * 2. Enable easy testing of orchestration logic separately from service logic
 * 3. Provide clear entry points for each API endpoint
 * 4. Maintain separation between HTTP concerns (req/res) and business logic
 * 5. Centralize request lifecycle management in one place
 * 
 * Architecture:
 * - Controllers receive validated requests from routes (validation already done)
 * - Controllers coordinate between multiple services to fulfill requests
 * - Controllers handle the complete request lifecycle from start to finish
 * - Controllers return structured responses or pass errors to error handler
 * - Controllers do NOT contain business logic (that lives in services)
 * 
 * Request Lifecycle for Prompt Submission:
 * 1. Create initial ResponseRecord with status='pending'
 * 2. Call retry service to attempt AI processing (up to 3 attempts)
 * 3. For each failed attempt, create FailureLog entry
 * 4. Update ResponseRecord with final status (success or failed)
 * 5. Return response to client with all metadata
 */

const { callAIService } = require('../services/aiService');
const { retryWithBackoff } = require('../services/retryService');
const {
  createResponseRecord,
  updateResponseRecord,
  createFailureLog,
  getHistory
} = require('../services/dbService');

/**
 * Submit a prompt for AI processing.
 * 
 * This is the main controller function that handles prompt submission requests.
 * It orchestrates the complete request lifecycle including database persistence,
 * retry logic, failure logging, and response generation.
 * 
 * Design Decision: Create database record BEFORE calling AI service to ensure
 * we track every request even if the AI service call fails. This satisfies the
 * "no lost requests" requirement.
 * 
 * Request Flow:
 * 1. Create initial ResponseRecord (status='pending', retry_count=0)
 * 2. Call retryWithBackoff to attempt AI processing (max 3 attempts)
 * 3. For each failed attempt, create FailureLog entry
 * 4. Update ResponseRecord with final result (success or failed)
 * 5. Return response to client
 * 
 * Success Response (200):
 * {
 *   request_id: "unique-id",
 *   prompt: "original prompt",
 *   response: "AI-generated response",
 *   status: "success",
 *   retry_count: 0-2,
 *   timestamp: "2024-01-15T10:30:00Z"
 * }
 * 
 * Failure Response (503):
 * {
 *   request_id: "unique-id",
 *   prompt: "original prompt",
 *   status: "failed",
 *   error: "AI service unavailable after 3 attempts",
 *   retry_count: 3,
 *   timestamp: "2024-01-15T10:30:00Z"
 * }
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body (already validated by middleware)
 * @param {string} req.body.prompt - The prompt text to process
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function (for error handling)
 * @returns {Promise<void>} - Sends response to client or passes error to error handler
 * 
 * @example
 * // Successful request:
 * POST /api/prompt
 * { "prompt": "Explain quantum computing" }
 * 
 * // Response:
 * {
 *   "request_id": "507f1f77bcf86cd799439011",
 *   "prompt": "Explain quantum computing",
 *   "response": "Quantum computing uses quantum bits...",
 *   "status": "success",
 *   "retry_count": 0,
 *   "timestamp": "2024-01-15T10:30:00.000Z"
 * }
 */
async function submitPrompt(req, res, next) {
  try {
    const { prompt } = req.body;
    
    // Step 1: Create initial ResponseRecord with status='pending'
    // Design Decision: Create record BEFORE calling AI service to ensure we track
    // the request even if everything fails afterwards (no lost requests)
    const initialRecord = await createResponseRecord({
      prompt: prompt,
      status: 'pending',
      retry_count: 0
    });
    
    const requestId = initialRecord.request_id;
    
    // Step 2: Attempt AI processing with retry logic
    // Design Decision: Use retryWithBackoff to handle transient failures automatically
    // The retry service will attempt up to 3 times with exponential backoff
    const retryResult = await retryWithBackoff(
      () => callAIService(prompt, requestId),
      3 // max attempts
    );
    
    // Step 3: Log all failures to database
    // Design Decision: Create a FailureLog entry for EACH failed attempt, not just
    // the final failure. This enables detailed failure analysis and debugging.
    if (retryResult.failures && retryResult.failures.length > 0) {
      // Create FailureLog entries for each failed attempt
      // Note: We don't await these individually to avoid slowing down the response
      // If failure logging fails, it's non-critical (the main ResponseRecord is more important)
      const failureLogPromises = retryResult.failures.map(failure => 
        createFailureLog({
          request_id: requestId,
          prompt: prompt,
          error_message: failure.error,
          error_type: failure.error_type,
          retry_attempt: failure.attempt,
          service: 'python_ai_service', // All failures come from AI service calls
          timestamp: failure.timestamp
        }).catch(err => {
          // Log error but don't fail the request if failure logging fails
          console.error('Failed to create FailureLog:', err);
        })
      );
      
      // Wait for all failure logs to be created
      await Promise.all(failureLogPromises);
    }
    
    // Step 4: Update ResponseRecord with final result
    if (retryResult.success) {
      // Success! Update record with AI response
      const updatedRecord = await updateResponseRecord(requestId, {
        status: 'success',
        response: retryResult.result.response,
        retry_count: retryResult.attempts - 1 // attempts - 1 = number of retries
      });
      
      // Step 5: Return success response to client
      return res.status(200).json({
        request_id: updatedRecord.request_id,
        prompt: updatedRecord.prompt,
        response: updatedRecord.response,
        status: updatedRecord.status,
        retry_count: updatedRecord.retry_count,
        timestamp: updatedRecord.timestamp,
        model: retryResult.result.model,
        tokens_used: retryResult.result.tokens_used
      });
      
    } else {
      // All retries failed - update record with error
      const updatedRecord = await updateResponseRecord(requestId, {
        status: 'failed',
        error_message: retryResult.error,
        retry_count: retryResult.attempts
      });
      
      // Step 5: Return failure response to client
      // Design Decision: Return 503 (Service Unavailable) for AI service failures
      // to indicate that the client can retry the request later
      return res.status(503).json({
        request_id: updatedRecord.request_id,
        prompt: updatedRecord.prompt,
        status: updatedRecord.status,
        error: updatedRecord.error_message,
        retry_count: updatedRecord.retry_count,
        timestamp: updatedRecord.timestamp
      });
    }
    
  } catch (error) {
    // Unexpected error during request processing
    // Design Decision: Pass error to global error handler for consistent error responses
    // The error handler will determine the appropriate status code and format the response
    next(error);
  }
}

/**
 * Retrieve prompt history with optional filtering.
 * 
 * This controller function handles requests to retrieve the history of all prompt
 * requests. It supports optional filtering by prompt text and status.
 * 
 * Design Decision: Return all records without pagination initially for simplicity.
 * In production, this should be paginated (e.g., 50 records per page) to handle
 * large datasets efficiently.
 * 
 * Query Parameters:
 * - prompt (optional): Filter by prompt text (uses MongoDB text search)
 * - status (optional): Filter by status (pending/success/failed)
 * 
 * Response Format:
 * {
 *   total: 150,
 *   records: [
 *     {
 *       request_id: "...",
 *       prompt: "...",
 *       response: "...",
 *       status: "success",
 *       retry_count: 1,
 *       timestamp: "2024-01-15T10:30:00Z"
 *     },
 *     // ... more records
 *   ]
 * }
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters (already validated by middleware)
 * @param {string} [req.query.prompt] - Optional prompt filter
 * @param {string} [req.query.status] - Optional status filter
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function (for error handling)
 * @returns {Promise<void>} - Sends response to client or passes error to error handler
 * 
 * @example
 * // Get all records:
 * GET /api/history
 * 
 * // Response:
 * {
 *   "total": 150,
 *   "records": [...]
 * }
 * 
 * @example
 * // Get records matching "quantum":
 * GET /api/history?prompt=quantum
 * 
 * // Response:
 * {
 *   "total": 5,
 *   "records": [... records containing "quantum" ...]
 * }
 * 
 * @example
 * // Get only failed records:
 * GET /api/history?status=failed
 * 
 * // Response:
 * {
 *   "total": 10,
 *   "records": [... failed records ...]
 * }
 */
async function getHistoryController(req, res, next) {
  try {
    // Extract query parameters (already validated by middleware)
    const { prompt, status } = req.query;
    
    // Build filters object
    const filters = {};
    if (prompt) {
      filters.prompt = prompt;
    }
    if (status) {
      filters.status = status;
    }
    
    // Retrieve records from database
    // Design Decision: Use dbService to abstract database operations
    // This keeps the controller focused on HTTP concerns
    const records = await getHistory(filters);
    
    // Return response to client
    return res.status(200).json({
      total: records.length,
      records: records
    });
    
  } catch (error) {
    // Unexpected error during history retrieval
    // Pass error to global error handler
    next(error);
  }
}

/**
 * Retrieve prompt history filtered by prompt text.
 * 
 * This is a convenience function that wraps getHistoryController with a specific
 * filter. It's used for the GET /api/history?prompt=<query> route.
 * 
 * Design Decision: This function is essentially the same as getHistoryController
 * since we handle filtering through query parameters. It's included for clarity
 * and to match the task requirements, but in practice getHistoryController handles
 * both filtered and unfiltered requests.
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.prompt - Prompt filter (required for this endpoint)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} - Sends response to client or passes error to error handler
 */
async function getHistoryByPrompt(req, res, next) {
  // This function is the same as getHistoryController since we handle
  // filtering through query parameters. Just call getHistoryController.
  return getHistoryController(req, res, next);
}

module.exports = {
  submitPrompt,
  getHistory: getHistoryController,
  getHistoryByPrompt
};
