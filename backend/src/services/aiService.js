const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_TIMEOUT = parseInt(process.env.AI_SERVICE_TIMEOUT || '30000', 10);

/**
 * Calls the Python AI service to process a prompt.
 *
 * This function is intentionally thin — it makes one HTTP call and returns a
 * structured result. Retry logic lives in retryService.js, keeping concerns separate.
 *
 * Returns a plain object (not throws) on failure so the retry service can inspect
 * the error_type and decide whether to retry.
 */
async function callAIService(prompt, requestId) {
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/process`,
      { prompt, request_id: requestId },
      {
        timeout: AI_SERVICE_TIMEOUT,
        // Accept all status codes so we can parse structured error bodies from the AI service
        validateStatus: () => true,
      }
    );

    if (response.data.error) {
      return {
        success: false,
        error: response.data.error,
        error_type: response.data.error_type,
        retry_after: response.data.retry_after,
        status_code: response.data.status_code,
      };
    }

    return {
      success: true,
      response: response.data.response,
      model: response.data.model,
      tokens_used: response.data.tokens_used,
    };
  } catch (error) {
    return classifyNetworkError(error);
  }
}

function classifyNetworkError(error) {
  const base = { success: false };

  if (error.code === 'ECONNREFUSED') {
    return { ...base, error: 'AI service unavailable (connection refused)', error_type: 'network', retry_after: 3, status_code: 502 };
  }
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    return { ...base, error: `AI service timed out after ${AI_SERVICE_TIMEOUT}ms`, error_type: 'timeout', retry_after: 5, status_code: 408 };
  }
  if (error.code === 'ENOTFOUND') {
    return { ...base, error: `AI service host not found: ${AI_SERVICE_URL}`, error_type: 'network', retry_after: 0, status_code: 502 };
  }

  return { ...base, error: `Unexpected error calling AI service: ${error.message}`, error_type: 'unknown', retry_after: 0, status_code: 500 };
}

module.exports = { callAIService };
