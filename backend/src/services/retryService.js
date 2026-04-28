/**
 * Retry Service with Exponential Backoff
 * 
 * This module implements the retry logic for the Prompt Tracking System.
 * It handles automatic retries with exponential backoff for failed AI service calls.
 * 
 * Design Decision: Retry logic lives in the Node.js backend (not in the Python AI service)
 * because:
 * 1. The backend owns the database and can track retry counts persistently
 * 2. The backend orchestrates the complete request lifecycle
 * 3. The AI service remains stateless and simple
 * 4. Retry state survives backend restarts (stored in MongoDB)
 * 5. Centralized retry logic for multiple AI services if needed in the future
 * 
 * Architecture:
 * - Implements exponential backoff (1s, 2s delays)
 * - Maximum 3 attempts (1 initial + 2 retries)
 * - Classifies errors as retryable or non-retryable
 * - Returns final result or error after all attempts
 * - Provides detailed failure information for logging
 * 
 * Retry Strategy:
 * - Attempt 1: Immediate
 * - Attempt 2: Wait 1 second (2^0 * 1s)
 * - Attempt 3: Wait 2 seconds (2^1 * 1s)
 * 
 * Why exponential backoff?
 * - Gives transient failures time to resolve
 * - Reduces load on failing services (rate limits, overload)
 * - Industry standard pattern (AWS SDK, Google Cloud, etc.)
 */

/**
 * Calculate exponential backoff delay in milliseconds.
 * 
 * This function implements exponential backoff with a base delay of 1 second.
 * The delay doubles with each retry attempt.
 * 
 * Formula: delay = baseDelay * (2 ^ (attemptNumber - 1))
 * 
 * Design Decision: Use exponential backoff to:
 * - Give services time to recover from transient failures
 * - Reduce thundering herd problem (many clients retrying simultaneously)
 * - Balance between quick recovery and not overwhelming failing services
 * 
 * @param {number} attemptNumber - The current attempt number (1, 2, or 3)
 * @returns {number} - Delay in milliseconds before next retry
 * 
 * @example
 * calculateBackoff(1) // Returns 0 (no delay for first attempt)
 * calculateBackoff(2) // Returns 1000 (1 second delay)
 * calculateBackoff(3) // Returns 2000 (2 seconds delay)
 */
function calculateBackoff(attemptNumber) {
  if (attemptNumber === 1) {
    return 0; // No delay for first attempt
  }
  
  const baseDelay = 1000; // 1 second in milliseconds
  const delay = baseDelay * Math.pow(2, attemptNumber - 2);
  
  return delay;
}

/**
 * Determine if an error is retryable based on error type.
 * 
 * This function classifies errors into retryable and non-retryable categories.
 * Retryable errors are transient failures that may resolve on retry.
 * Non-retryable errors are permanent failures that won't resolve on retry.
 * 
 * Design Decision: Error classification enables intelligent retry decisions:
 * - Retryable: timeout, rate_limit, network (transient failures)
 * - Non-retryable: api_error (4xx client errors), unknown (unexpected errors)
 * 
 * Retryable Error Types:
 * - timeout: Request exceeded time limit (may succeed on retry)
 * - rate_limit: API rate limit exceeded (will resolve after delay)
 * - network: Network connectivity issues (may be transient)
 * 
 * Non-Retryable Error Types:
 * - api_error: API returned error (4xx client errors won't fix themselves)
 * - unknown: Unexpected errors (need investigation, not automatic retry)
 * 
 * Note: api_error with 5xx status codes could be retryable, but we treat
 * them as non-retryable by default to avoid retrying server errors that
 * may indicate a bug in the AI service.
 * 
 * @param {string} errorType - The error type from the AI service response
 * @returns {boolean} - True if error is retryable, false otherwise
 * 
 * @example
 * isRetryableError('timeout') // Returns true
 * isRetryableError('rate_limit') // Returns true
 * isRetryableError('network') // Returns true
 * isRetryableError('api_error') // Returns false
 * isRetryableError('unknown') // Returns false
 */
function isRetryableError(errorType) {
  const retryableErrors = ['timeout', 'rate_limit', 'network'];
  return retryableErrors.includes(errorType);
}

/**
 * Retry a function with exponential backoff.
 * 
 * This is the core retry logic function. It attempts to execute a function
 * up to 3 times with exponential backoff between attempts.
 * 
 * Design Decision: Generic retry function that can be used with any async function.
 * This makes the retry logic reusable and testable independently of the AI service.
 * 
 * Retry Flow:
 * 1. Attempt to execute the function
 * 2. If successful, return the result immediately
 * 3. If failed and error is retryable, wait with exponential backoff
 * 4. Retry up to 3 total attempts
 * 5. If all attempts fail, return the final error
 * 
 * The function tracks all failures and returns them for logging purposes.
 * This enables the backend to create FailureLog entries for each failed attempt.
 * 
 * @param {Function} fn - Async function to retry (should return Promise)
 * @param {number} maxAttempts - Maximum number of attempts (default: 3)
 * @returns {Promise<Object>} - Resolves with result or final error
 *   Success: { success: true, result: any, attempts: number, failures: Array }
 *   Error: { success: false, error: string, error_type: string, attempts: number, failures: Array }
 * 
 * @example
 * const result = await retryWithBackoff(
 *   () => callAIService("Hello", "req-123"),
 *   3
 * );
 * 
 * if (result.success) {
 *   console.log('Success after', result.attempts, 'attempts');
 *   console.log('Response:', result.result.response);
 * } else {
 *   console.log('Failed after', result.attempts, 'attempts');
 *   console.log('Failures:', result.failures);
 * }
 */
async function retryWithBackoff(fn, maxAttempts = 3) {
  const failures = []; // Track all failures for logging
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Calculate backoff delay for this attempt
      const delay = calculateBackoff(attempt);
      
      // Wait before retry (no delay for first attempt)
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Execute the function
      const result = await fn();
      
      // Check if the result indicates success or error
      if (result.success) {
        // Success! Return result with attempt count and failure history
        return {
          success: true,
          result: result,
          attempts: attempt,
          failures: failures
        };
      }
      
      // Function returned an error result
      // Record the failure for logging
      failures.push({
        attempt: attempt,
        error: result.error,
        error_type: result.error_type,
        status_code: result.status_code,
        timestamp: new Date()
      });
      
      // Check if error is retryable
      if (!isRetryableError(result.error_type)) {
        // Non-retryable error - don't retry, return immediately
        return {
          success: false,
          error: result.error,
          error_type: result.error_type,
          status_code: result.status_code,
          attempts: attempt,
          failures: failures
        };
      }
      
      // Error is retryable, continue to next attempt
      // (unless we've exhausted all attempts)
      if (attempt === maxAttempts) {
        // All attempts exhausted, return final error
        return {
          success: false,
          error: result.error,
          error_type: result.error_type,
          status_code: result.status_code,
          attempts: attempt,
          failures: failures
        };
      }
      
    } catch (error) {
      // Unexpected exception during function execution
      // This shouldn't happen if the function handles errors properly,
      // but we catch it for safety
      failures.push({
        attempt: attempt,
        error: error.message,
        error_type: 'unknown',
        status_code: 500,
        timestamp: new Date()
      });
      
      // Don't retry unexpected exceptions
      return {
        success: false,
        error: `Unexpected exception: ${error.message}`,
        error_type: 'unknown',
        status_code: 500,
        attempts: attempt,
        failures: failures
      };
    }
  }
  
  // This should never be reached, but included for completeness
  return {
    success: false,
    error: 'Maximum retry attempts exceeded',
    error_type: 'unknown',
    status_code: 500,
    attempts: maxAttempts,
    failures: failures
  };
}

module.exports = {
  retryWithBackoff,
  calculateBackoff,
  isRetryableError
};
