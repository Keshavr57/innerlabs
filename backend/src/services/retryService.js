/**
 * Retry with exponential backoff.
 *
 * Retry logic lives in the backend (not the AI service) because the backend owns
 * the database and can persist retry state across restarts.
 *
 * Strategy: attempt 1 → immediate, attempt 2 → 1 s, attempt 3 → 2 s
 * Retryable error types: timeout, rate_limit, network
 * Non-retryable: api_error, unknown (won't self-resolve)
 */

const RETRYABLE_ERRORS = new Set(['timeout', 'rate_limit', 'network']);

function calculateBackoff(attempt) {
  if (attempt === 1) return 0;
  return 1000 * Math.pow(2, attempt - 2); // 1s, 2s, 4s, ...
}

function isRetryableError(errorType) {
  return RETRYABLE_ERRORS.has(errorType);
}

async function retryWithBackoff(fn, maxAttempts = 3) {
  const failures = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = calculateBackoff(attempt);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const result = await fn();

      if (result.success) {
        return { success: true, result, attempts: attempt, failures };
      }

      failures.push({ attempt, error: result.error, error_type: result.error_type, status_code: result.status_code, timestamp: new Date() });

      if (!isRetryableError(result.error_type) || attempt === maxAttempts) {
        return { success: false, error: result.error, error_type: result.error_type, status_code: result.status_code, attempts: attempt, failures };
      }
    } catch (error) {
      failures.push({ attempt, error: error.message, error_type: 'unknown', status_code: 500, timestamp: new Date() });
      return { success: false, error: `Unexpected exception: ${error.message}`, error_type: 'unknown', status_code: 500, attempts: attempt, failures };
    }
  }

  // Unreachable — loop always returns before exhausting, but satisfies linters
  return { success: false, error: 'Max retry attempts exceeded', error_type: 'unknown', status_code: 500, attempts: maxAttempts, failures };
}

module.exports = { retryWithBackoff, calculateBackoff, isRetryableError };
