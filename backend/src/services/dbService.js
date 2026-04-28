/**
 * Database Service Layer
 * 
 * This module provides the interface for all database operations in the Prompt Tracking System.
 * It handles CRUD operations for ResponseRecord and FailureLog models with built-in retry logic
 * for transient database failures.
 * 
 * Design Decision: Centralize all database operations in a single service layer to:
 * 1. Provide consistent error handling across all database operations
 * 2. Implement retry logic for transient database failures (connection drops, timeouts)
 * 3. Abstract database implementation details from controllers
 * 4. Enable easy testing with mocked database operations
 * 5. Maintain single source of truth for database access patterns
 * 
 * Architecture:
 * - All database writes include retry logic (2 retries for transient failures)
 * - All functions return structured results (success/error) for consistent error handling
 * - Mongoose models are imported and used directly for type safety
 * - Query operations include proper error handling and logging
 * 
 * Retry Strategy for Database Operations:
 * - Initial attempt + 2 retries = 3 total attempts
 * - Retry on transient errors: connection drops, timeouts, temporary unavailability
 * - No retry on permanent errors: validation errors, duplicate keys, schema violations
 * - Short delays between retries (500ms) since database is local/nearby
 */

const ResponseRecord = require('../models/ResponseRecord');
const FailureLog = require('../models/FailureLog');

/**
 * Determine if a database error is retryable.
 * 
 * This function classifies MongoDB errors into retryable and non-retryable categories.
 * Retryable errors are transient failures that may resolve on retry.
 * Non-retryable errors are permanent failures that won't resolve on retry.
 * 
 * Design Decision: Only retry transient network/connection errors, not data validation errors.
 * Validation errors indicate bugs in our code or data, not temporary database issues.
 * 
 * Retryable Errors:
 * - MongoNetworkError: Network connectivity issues
 * - MongoTimeoutError: Operation exceeded timeout
 * - Connection errors: Database temporarily unavailable
 * 
 * Non-Retryable Errors:
 * - ValidationError: Data doesn't match schema (code bug)
 * - DuplicateKeyError: Unique constraint violation (code bug)
 * - CastError: Invalid data type (code bug)
 * 
 * @param {Error} error - The error object from MongoDB/Mongoose
 * @returns {boolean} - True if error is retryable, false otherwise
 */
function isRetryableDatabaseError(error) {
  // Network and timeout errors are retryable
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
    return true;
  }
  
  // Connection errors are retryable
  if (error.message && error.message.includes('connection')) {
    return true;
  }
  
  // Validation and data errors are NOT retryable
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return false;
  }
  
  // Duplicate key errors are NOT retryable
  if (error.code === 11000) {
    return false;
  }
  
  // Default: don't retry unknown errors
  return false;
}

/**
 * Retry a database operation with exponential backoff.
 * 
 * This function wraps database operations with retry logic for transient failures.
 * It attempts the operation up to 3 times with short delays between attempts.
 * 
 * Design Decision: Use shorter delays (500ms) for database retries compared to
 * AI service retries (1s, 2s) because the database is typically local or nearby,
 * and connection issues resolve quickly.
 * 
 * @param {Function} operation - Async function to retry (database operation)
 * @param {number} maxAttempts - Maximum number of attempts (default: 3)
 * @returns {Promise<any>} - Resolves with operation result or throws final error
 */
async function retryDatabaseOperation(operation, maxAttempts = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Execute the database operation
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      if (!isRetryableDatabaseError(error)) {
        // Non-retryable error - throw immediately
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Wait before retry (500ms delay)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // This should never be reached, but included for completeness
  throw lastError;
}

/**
 * Create a new ResponseRecord in the database.
 * 
 * This function creates an initial ResponseRecord with status='pending' when a new
 * prompt request is received. This ensures we track the request even if everything
 * fails afterwards (no lost requests).
 * 
 * Design Decision: Create record BEFORE calling AI service to ensure we have a
 * database entry even if the AI service call fails. This satisfies the "no lost
 * requests" requirement.
 * 
 * The function includes retry logic for transient database failures (connection drops,
 * timeouts). If all retries fail, the function throws an error, and the controller
 * should return 500 to the client.
 * 
 * @param {Object} data - ResponseRecord data
 * @param {string} data.prompt - The user's prompt text
 * @param {string} data.status - Initial status (typically 'pending')
 * @param {number} data.retry_count - Initial retry count (typically 0)
 * @param {string} [data.request_id] - Optional request ID (auto-generated if not provided)
 * @returns {Promise<Object>} - The created ResponseRecord document
 * @throws {Error} - If database operation fails after all retries
 * 
 * @example
 * const record = await createResponseRecord({
 *   prompt: "Explain quantum computing",
 *   status: "pending",
 *   retry_count: 0
 * });
 * console.log(record.request_id); // Auto-generated ID
 */
async function createResponseRecord(data) {
  return await retryDatabaseOperation(async () => {
    const record = new ResponseRecord(data);
    await record.save();
    return record;
  });
}

/**
 * Update an existing ResponseRecord in the database.
 * 
 * This function updates a ResponseRecord with new data, typically after an AI service
 * call completes (success or failure). It's used to update the status, response,
 * error_message, and retry_count fields.
 * 
 * Design Decision: Use findOneAndUpdate with { new: true } to return the updated
 * document in a single atomic operation. This prevents race conditions if multiple
 * processes try to update the same record.
 * 
 * The function includes retry logic for transient database failures. If the record
 * is not found, it throws an error (this indicates a bug in our code).
 * 
 * @param {string} requestId - The request_id of the record to update
 * @param {Object} updates - Fields to update
 * @param {string} [updates.status] - New status (success/failed)
 * @param {string} [updates.response] - AI response text (for success)
 * @param {string} [updates.error_message] - Error details (for failure)
 * @param {number} [updates.retry_count] - Updated retry count
 * @returns {Promise<Object>} - The updated ResponseRecord document
 * @throws {Error} - If record not found or database operation fails
 * 
 * @example
 * const updated = await updateResponseRecord("req-123", {
 *   status: "success",
 *   response: "Quantum computing uses quantum bits...",
 *   retry_count: 1
 * });
 */
async function updateResponseRecord(requestId, updates) {
  return await retryDatabaseOperation(async () => {
    const record = await ResponseRecord.findOneAndUpdate(
      { request_id: requestId },
      updates,
      { new: true } // Return the updated document
    );
    
    if (!record) {
      throw new Error(`ResponseRecord not found for request_id: ${requestId}`);
    }
    
    return record;
  });
}

/**
 * Create a new FailureLog entry in the database.
 * 
 * This function creates a FailureLog entry for each failed attempt during the retry
 * process. It captures detailed failure information including error type, retry attempt
 * number, and which service failed.
 * 
 * Design Decision: Create a separate FailureLog entry for EACH failed attempt, not
 * just the final failure. This enables detailed failure analysis:
 * - Which retry attempts fail most often?
 * - What error types occur at what times?
 * - Which service (python_ai_service or groq_api) fails more?
 * 
 * The function includes retry logic for transient database failures. If all retries
 * fail, the function throws an error, but this is non-critical (the main ResponseRecord
 * is more important than the FailureLog).
 * 
 * @param {Object} data - FailureLog data
 * @param {string} data.request_id - Links to the corresponding ResponseRecord
 * @param {string} data.prompt - The original prompt that failed
 * @param {string} data.error_message - Detailed error description
 * @param {string} data.error_type - Categorized error type (timeout, rate_limit, etc.)
 * @param {number} data.retry_attempt - Which attempt failed (1, 2, or 3)
 * @param {string} data.service - Which service failed (python_ai_service or groq_api)
 * @returns {Promise<Object>} - The created FailureLog document
 * @throws {Error} - If database operation fails after all retries
 * 
 * @example
 * const log = await createFailureLog({
 *   request_id: "req-123",
 *   prompt: "Explain quantum computing",
 *   error_message: "Groq API timeout",
 *   error_type: "timeout",
 *   retry_attempt: 1,
 *   service: "groq_api"
 * });
 */
async function createFailureLog(data) {
  return await retryDatabaseOperation(async () => {
    const log = new FailureLog(data);
    await log.save();
    return log;
  });
}

/**
 * Retrieve all ResponseRecords from the database with sorting and optional filtering.
 * 
 * This function retrieves the complete history of all prompt requests, sorted by
 * timestamp in descending order (newest first). It supports optional filtering by
 * prompt text using MongoDB's text search.
 * 
 * Design Decision: Return all records without pagination initially for simplicity.
 * In production, this should be paginated (e.g., 50 records per page) to handle
 * large datasets efficiently.
 * 
 * The function does NOT include retry logic because read operations are less critical
 * than writes. If a read fails, the client can simply retry the request.
 * 
 * @param {Object} [filters={}] - Optional filters for the query
 * @param {string} [filters.prompt] - Filter by prompt text (uses text search)
 * @param {string} [filters.status] - Filter by status (pending/success/failed)
 * @returns {Promise<Array>} - Array of ResponseRecord documents
 * @throws {Error} - If database query fails
 * 
 * @example
 * // Get all records
 * const allRecords = await getHistory();
 * 
 * @example
 * // Get records matching "quantum"
 * const quantumRecords = await getHistory({ prompt: "quantum" });
 * 
 * @example
 * // Get only failed records
 * const failedRecords = await getHistory({ status: "failed" });
 */
async function getHistory(filters = {}) {
  const query = {};
  
  // Add prompt text search filter if provided
  if (filters.prompt) {
    // Use MongoDB text search for efficient full-text search
    query.$text = { $search: filters.prompt };
  }
  
  // Add status filter if provided
  if (filters.status) {
    query.status = filters.status;
  }
  
  // Execute query with sorting (newest first)
  const records = await ResponseRecord.find(query)
    .sort({ timestamp: -1 }) // Sort by timestamp descending (newest first)
    .exec();
  
  return records;
}

/**
 * Get a single ResponseRecord by request_id.
 * 
 * This function retrieves a specific ResponseRecord by its unique request_id.
 * It's used for looking up the current state of a request.
 * 
 * @param {string} requestId - The request_id to look up
 * @returns {Promise<Object|null>} - The ResponseRecord document or null if not found
 * @throws {Error} - If database query fails
 * 
 * @example
 * const record = await getResponseRecord("req-123");
 * if (record) {
 *   console.log(record.status); // "success" or "failed" or "pending"
 * }
 */
async function getResponseRecord(requestId) {
  return await ResponseRecord.findOne({ request_id: requestId }).exec();
}

/**
 * Get all FailureLog entries for a specific request.
 * 
 * This function retrieves all failure logs associated with a specific request_id.
 * It's used for debugging and analyzing what went wrong during retries.
 * 
 * @param {string} requestId - The request_id to look up
 * @returns {Promise<Array>} - Array of FailureLog documents
 * @throws {Error} - If database query fails
 * 
 * @example
 * const failures = await getFailureLogs("req-123");
 * console.log(`Request had ${failures.length} failures`);
 * failures.forEach(f => console.log(`Attempt ${f.retry_attempt}: ${f.error_type}`));
 */
async function getFailureLogs(requestId) {
  return await FailureLog.find({ request_id: requestId })
    .sort({ retry_attempt: 1 }) // Sort by attempt number (1, 2, 3)
    .exec();
}

module.exports = {
  createResponseRecord,
  updateResponseRecord,
  createFailureLog,
  getHistory,
  getResponseRecord,
  getFailureLogs
};
