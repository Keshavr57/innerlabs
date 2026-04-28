/**
 * Global Error Handler Middleware
 * 
 * This module provides centralized error handling for the Express application.
 * It catches all errors that occur during request processing and returns
 * consistent, structured error responses to clients.
 * 
 * Design Decision: Use a global error handler (not try-catch in every controller) to:
 * 1. Centralize error handling logic in one place (DRY principle)
 * 2. Ensure consistent error response format across all endpoints
 * 3. Simplify controller code by removing repetitive error handling
 * 4. Enable easy logging and monitoring of all errors
 * 5. Prevent error details from leaking to clients in production
 * 
 * Architecture:
 * - This middleware must be registered LAST in the Express middleware chain
 * - It catches errors from all previous middleware and route handlers
 * - It maps error types to appropriate HTTP status codes
 * - It returns structured error responses with error codes and request IDs
 * - It logs errors to console for debugging (in production, use proper logging service)
 * 
 * Error Response Format:
 * {
 *   error: "Human-readable error message",
 *   code: "ERROR_CODE",
 *   request_id: "unique-request-id",
 *   timestamp: "2024-01-15T10:30:00Z"
 * }
 * 
 * HTTP Status Code Mapping (from Requirements 7.5):
 * - 400: Validation errors (invalid input)
 * - 500: Server/database errors (internal failures)
 * - 503: AI service unavailable (external service failures)
 */

/**
 * Determine the appropriate HTTP status code for an error.
 * 
 * This function maps error types and properties to HTTP status codes.
 * It provides intelligent status code selection based on error characteristics.
 * 
 * Design Decision: Use error properties (name, message, statusCode) to determine
 * the appropriate HTTP status code. This allows different parts of the application
 * to signal the type of error without explicitly passing status codes everywhere.
 * 
 * Status Code Rules:
 * - 400: Validation errors, invalid input, client errors
 * - 404: Resource not found
 * - 500: Database errors, unexpected errors, server errors
 * - 503: AI service unavailable, external service failures
 * 
 * @param {Error} error - The error object
 * @returns {number} - HTTP status code (400, 404, 500, or 503)
 * 
 * @example
 * const error = new Error("Validation failed");
 * error.name = "ValidationError";
 * getStatusCode(error); // Returns 400
 * 
 * @example
 * const error = new Error("AI service unavailable");
 * error.statusCode = 503;
 * getStatusCode(error); // Returns 503
 */
function getStatusCode(error) {
  // If error has explicit statusCode property, use it
  if (error.statusCode) {
    return error.statusCode;
  }
  
  // Mongoose validation errors -> 400 Bad Request
  if (error.name === 'ValidationError') {
    return 400;
  }
  
  // Mongoose cast errors (invalid ObjectId, etc.) -> 400 Bad Request
  if (error.name === 'CastError') {
    return 400;
  }
  
  // Resource not found errors -> 404 Not Found
  if (error.message && error.message.includes('not found')) {
    return 404;
  }
  
  // Database connection errors -> 500 Internal Server Error
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
    return 500;
  }
  
  // AI service unavailable -> 503 Service Unavailable
  if (error.message && (
    error.message.includes('AI service') ||
    error.message.includes('service unavailable')
  )) {
    return 503;
  }
  
  // Default to 500 Internal Server Error for unknown errors
  return 500;
}

/**
 * Get a user-friendly error code from an error object.
 * 
 * This function generates consistent error codes that clients can use for
 * programmatic error handling (e.g., showing specific UI messages).
 * 
 * Design Decision: Use error codes (not just messages) to enable client-side
 * error handling logic. Clients can check error codes and display appropriate
 * messages in different languages or show specific UI elements.
 * 
 * @param {Error} error - The error object
 * @returns {string} - Error code (e.g., "VALIDATION_ERROR", "DATABASE_ERROR")
 * 
 * @example
 * const error = new Error("Validation failed");
 * error.name = "ValidationError";
 * getErrorCode(error); // Returns "VALIDATION_ERROR"
 */
function getErrorCode(error) {
  // If error has explicit code property, use it
  if (error.code && typeof error.code === 'string') {
    return error.code;
  }
  
  // Map error names to error codes
  const errorCodeMap = {
    'ValidationError': 'VALIDATION_ERROR',
    'CastError': 'INVALID_DATA_TYPE',
    'MongoNetworkError': 'DATABASE_CONNECTION_ERROR',
    'MongoTimeoutError': 'DATABASE_TIMEOUT',
    'MongoError': 'DATABASE_ERROR'
  };
  
  if (errorCodeMap[error.name]) {
    return errorCodeMap[error.name];
  }
  
  // Check error message for specific patterns
  if (error.message) {
    if (error.message.includes('not found')) {
      return 'NOT_FOUND';
    }
    if (error.message.includes('AI service')) {
      return 'AI_SERVICE_ERROR';
    }
    if (error.message.includes('timeout')) {
      return 'TIMEOUT_ERROR';
    }
  }
  
  // Default error code
  return 'INTERNAL_ERROR';
}

/**
 * Sanitize error message for client response.
 * 
 * This function removes sensitive information from error messages before
 * sending them to clients. In production, we don't want to leak internal
 * details like file paths, database connection strings, or stack traces.
 * 
 * Design Decision: Sanitize error messages to prevent information leakage.
 * In development, we can be more verbose, but in production we should be
 * careful about what error details we expose to clients.
 * 
 * @param {string} message - The original error message
 * @param {string} env - Environment (development/production)
 * @returns {string} - Sanitized error message
 */
function sanitizeErrorMessage(message, env = process.env.NODE_ENV) {
  // In development, return full error message for debugging
  if (env === 'development') {
    return message;
  }
  
  // In production, return generic messages for certain error types
  // to avoid leaking internal implementation details
  
  // Database errors -> generic message
  if (message.includes('Mongo') || message.includes('database')) {
    return 'A database error occurred. Please try again later.';
  }
  
  // File system errors -> generic message
  if (message.includes('ENOENT') || message.includes('EACCES')) {
    return 'A server error occurred. Please try again later.';
  }
  
  // Network errors -> generic message
  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
    return 'A service is temporarily unavailable. Please try again later.';
  }
  
  // Return original message if it doesn't contain sensitive information
  return message;
}

/**
 * Global error handler middleware.
 * 
 * This is the main error handling middleware that catches all errors in the
 * Express application. It must be registered LAST in the middleware chain
 * (after all routes and other middleware).
 * 
 * Design Decision: Use Express's 4-parameter error handling middleware signature.
 * Express automatically recognizes this as an error handler and calls it when
 * errors occur in previous middleware or route handlers.
 * 
 * Error Handling Flow:
 * 1. Log error to console (in production, use proper logging service)
 * 2. Determine appropriate HTTP status code
 * 3. Generate error code for client-side handling
 * 4. Sanitize error message to prevent information leakage
 * 5. Return structured error response to client
 * 
 * The error response includes:
 * - error: Human-readable error message (sanitized)
 * - code: Machine-readable error code for client logic
 * - request_id: Unique identifier for tracing (if available)
 * - timestamp: When the error occurred (ISO 8601 format)
 * 
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function (unused in error handlers)
 * @returns {void} - Sends error response to client
 * 
 * @example
 * // In server.js (must be registered LAST):
 * app.use(errorHandler);
 * 
 * @example
 * // Controller throws error:
 * async function submitPrompt(req, res, next) {
 *   try {
 *     // ... processing logic
 *     throw new Error("Database connection failed");
 *   } catch (error) {
 *     next(error); // Pass error to error handler
 *   }
 * }
 * 
 * // Error handler catches it and returns:
 * // {
 * //   error: "A database error occurred. Please try again later.",
 * //   code: "DATABASE_ERROR",
 * //   request_id: "req-123",
 * //   timestamp: "2024-01-15T10:30:00Z"
 * // }
 */
function errorHandler(err, req, res, next) {
  // Log error to console for debugging
  // Design Decision: Log full error details (including stack trace) to console
  // for debugging, but don't send stack traces to clients
  console.error('Error occurred:', {
    message: err.message,
    name: err.name,
    code: err.code,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // Determine HTTP status code
  const statusCode = getStatusCode(err);
  
  // Generate error code
  const errorCode = getErrorCode(err);
  
  // Sanitize error message
  const errorMessage = sanitizeErrorMessage(err.message);
  
  // Get request_id if available (from request body or generated earlier)
  const requestId = req.body?.request_id || req.requestId || 'unknown';
  
  // Build error response
  const errorResponse = {
    error: errorMessage,
    code: errorCode,
    request_id: requestId,
    timestamp: new Date().toISOString()
  };
  
  // In development, include stack trace for debugging
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }
  
  // Send error response to client
  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
