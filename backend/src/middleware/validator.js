/**
 * Request Validation Middleware
 * 
 * This module provides middleware functions for validating incoming HTTP requests
 * before they reach the controller layer. Validation happens early in the request
 * pipeline to fail fast and provide clear error messages to clients.
 * 
 * Design Decision: Validate requests at the middleware layer (not in controllers) to:
 * 1. Separate validation logic from business logic (single responsibility principle)
 * 2. Fail fast - reject invalid requests before any processing or database operations
 * 3. Provide consistent validation error responses across all endpoints
 * 4. Enable reusable validation functions across multiple routes
 * 5. Reduce controller complexity by handling validation concerns separately
 * 
 * Architecture:
 * - Middleware functions follow Express middleware signature: (req, res, next)
 * - Invalid requests return 400 Bad Request with descriptive error messages
 * - Valid requests call next() to continue to the controller
 * - No database operations or external API calls in validation (fast validation)
 * 
 * Validation Rules (from Requirements 7.4):
 * - Prompt cannot be empty
 * - Prompt cannot be only whitespace
 * - Prompt cannot exceed 10,000 characters
 * - Prompt must be a string
 */

/**
 * Validate prompt request middleware.
 * 
 * This middleware validates the prompt field in the request body before processing.
 * It checks for empty prompts, whitespace-only prompts, and prompts that exceed
 * the maximum length.
 * 
 * Design Decision: Validate in the backend even though the AI service also validates.
 * This provides defense in depth and prevents unnecessary calls to the AI service
 * for invalid requests. It also gives us control over error messages returned to clients.
 * 
 * Validation Rules:
 * 1. Prompt must exist in request body
 * 2. Prompt must be a string
 * 3. Prompt cannot be empty string
 * 4. Prompt cannot be only whitespace (spaces, tabs, newlines)
 * 5. Prompt cannot exceed 10,000 characters
 * 
 * Why these rules?
 * - Empty/whitespace: Prevents wasting AI service resources on meaningless requests
 * - Max length: Prevents abuse and ensures prompts fit within LLM context windows
 * - Type checking: Prevents type errors in downstream processing
 * 
 * Error Response Format:
 * {
 *   error: "Descriptive error message",
 *   code: "ERROR_CODE",
 *   field: "prompt"
 * }
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.prompt - The prompt to validate
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} - Calls next() if valid, or sends 400 response if invalid
 * 
 * @example
 * // In routes file:
 * router.post('/api/prompt', validatePrompt, promptController.submitPrompt);
 * 
 * @example
 * // Valid request:
 * POST /api/prompt
 * { "prompt": "Explain quantum computing" }
 * // Calls next() -> continues to controller
 * 
 * @example
 * // Invalid request (empty):
 * POST /api/prompt
 * { "prompt": "" }
 * // Returns 400: { error: "Prompt cannot be empty", code: "EMPTY_PROMPT", field: "prompt" }
 * 
 * @example
 * // Invalid request (whitespace only):
 * POST /api/prompt
 * { "prompt": "   \n  \t  " }
 * // Returns 400: { error: "Prompt cannot be only whitespace", code: "WHITESPACE_PROMPT", field: "prompt" }
 * 
 * @example
 * // Invalid request (too long):
 * POST /api/prompt
 * { "prompt": "a".repeat(10001) }
 * // Returns 400: { error: "Prompt exceeds maximum length of 10000 characters", code: "PROMPT_TOO_LONG", field: "prompt" }
 */
function validatePrompt(req, res, next) {
  const { prompt } = req.body;
  
  // Check if prompt exists in request body
  if (prompt === undefined || prompt === null) {
    return res.status(400).json({
      error: 'Prompt is required',
      code: 'MISSING_PROMPT',
      field: 'prompt'
    });
  }
  
  // Check if prompt is a string
  if (typeof prompt !== 'string') {
    return res.status(400).json({
      error: 'Prompt must be a string',
      code: 'INVALID_PROMPT_TYPE',
      field: 'prompt'
    });
  }
  
  // Check if prompt is empty
  if (prompt.length === 0) {
    return res.status(400).json({
      error: 'Prompt cannot be empty',
      code: 'EMPTY_PROMPT',
      field: 'prompt'
    });
  }
  
  // Check if prompt is only whitespace
  // Design Decision: Use trim() to check for whitespace-only strings
  // This catches spaces, tabs, newlines, and other whitespace characters
  if (prompt.trim().length === 0) {
    return res.status(400).json({
      error: 'Prompt cannot be only whitespace',
      code: 'WHITESPACE_PROMPT',
      field: 'prompt'
    });
  }
  
  // Check if prompt exceeds maximum length
  // Design Decision: 10,000 character limit balances usability with resource constraints
  // Most LLMs have context windows measured in tokens (~4 chars per token)
  // 10,000 chars ≈ 2,500 tokens, which fits comfortably in most LLM context windows
  const MAX_PROMPT_LENGTH = 10000;
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({
      error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
      code: 'PROMPT_TOO_LONG',
      field: 'prompt',
      current_length: prompt.length,
      max_length: MAX_PROMPT_LENGTH
    });
  }
  
  // All validations passed - continue to controller
  next();
}

/**
 * Validate query parameters for history endpoint.
 * 
 * This middleware validates optional query parameters for the history retrieval endpoint.
 * It ensures that filter parameters are properly formatted and within acceptable ranges.
 * 
 * Design Decision: Validate query parameters to prevent injection attacks and ensure
 * proper data types for database queries.
 * 
 * Validation Rules:
 * 1. prompt (optional): If provided, must be a non-empty string
 * 2. status (optional): If provided, must be one of: pending, success, failed
 * 3. limit (optional): If provided, must be a positive integer
 * 4. offset (optional): If provided, must be a non-negative integer
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.prompt] - Optional prompt filter
 * @param {string} [req.query.status] - Optional status filter
 * @param {string} [req.query.limit] - Optional result limit
 * @param {string} [req.query.offset] - Optional result offset
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} - Calls next() if valid, or sends 400 response if invalid
 * 
 * @example
 * // In routes file:
 * router.get('/api/history', validateHistoryQuery, promptController.getHistory);
 * 
 * @example
 * // Valid request:
 * GET /api/history?prompt=quantum&status=success
 * // Calls next() -> continues to controller
 * 
 * @example
 * // Invalid request (invalid status):
 * GET /api/history?status=invalid
 * // Returns 400: { error: "Invalid status value", code: "INVALID_STATUS" }
 */
function validateHistoryQuery(req, res, next) {
  const { prompt, status, limit, offset } = req.query;
  
  // Validate prompt filter if provided
  if (prompt !== undefined) {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Prompt filter must be a non-empty string',
        code: 'INVALID_PROMPT_FILTER',
        field: 'prompt'
      });
    }
  }
  
  // Validate status filter if provided
  if (status !== undefined) {
    const validStatuses = ['pending', 'success', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(', ')}`,
        code: 'INVALID_STATUS',
        field: 'status',
        valid_values: validStatuses
      });
    }
  }
  
  // Validate limit if provided
  if (limit !== undefined) {
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum <= 0) {
      return res.status(400).json({
        error: 'Limit must be a positive integer',
        code: 'INVALID_LIMIT',
        field: 'limit'
      });
    }
    // Store parsed value for controller to use
    req.query.limit = limitNum;
  }
  
  // Validate offset if provided
  if (offset !== undefined) {
    const offsetNum = parseInt(offset, 10);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'Offset must be a non-negative integer',
        code: 'INVALID_OFFSET',
        field: 'offset'
      });
    }
    // Store parsed value for controller to use
    req.query.offset = offsetNum;
  }
  
  // All validations passed - continue to controller
  next();
}

module.exports = {
  validatePrompt,
  validateHistoryQuery
};
