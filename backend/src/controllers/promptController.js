const { callAIService } = require('../services/aiService');
const { retryWithBackoff } = require('../services/retryService');
const { createResponseRecord, updateResponseRecord, createFailureLog, getHistory } = require('../services/dbService');

/**
 * POST /api/prompt
 *
 * Orchestrates the full prompt lifecycle:
 * 1. Persist a pending record before any external call (guarantees no lost requests)
 * 2. Attempt AI processing with exponential-backoff retry
 * 3. Log each failed attempt to FailureLog for observability
 * 4. Finalize the ResponseRecord and return the result
 */
async function submitPrompt(req, res, next) {
  try {
    const { prompt } = req.body;

    const record = await createResponseRecord({ prompt, status: 'pending', retry_count: 0 });
    const requestId = record.request_id;

    const retryResult = await retryWithBackoff(() => callAIService(prompt, requestId), 3);

    // Log every failed attempt — not just the final one — for detailed failure analysis
    if (retryResult.failures?.length > 0) {
      await Promise.all(
        retryResult.failures.map((failure) =>
          createFailureLog({
            request_id: requestId,
            prompt,
            error_message: failure.error,
            error_type: failure.error_type,
            retry_attempt: failure.attempt,
            service: 'python_ai_service',
            timestamp: failure.timestamp,
          }).catch((err) => console.error('FailureLog write error:', err.message))
        )
      );
    }

    if (retryResult.success) {
      const updated = await updateResponseRecord(requestId, {
        status: 'success',
        response: retryResult.result.response,
        retry_count: retryResult.attempts - 1,
      });

      return res.status(200).json({
        request_id: updated.request_id,
        prompt: updated.prompt,
        response: updated.response,
        status: updated.status,
        retry_count: updated.retry_count,
        timestamp: updated.timestamp,
        model: retryResult.result.model,
        tokens_used: retryResult.result.tokens_used,
      });
    }

    // All retries exhausted — 503 signals the client that retrying later may succeed
    const updated = await updateResponseRecord(requestId, {
      status: 'failed',
      error_message: retryResult.error,
      retry_count: retryResult.attempts,
    });

    return res.status(503).json({
      request_id: updated.request_id,
      prompt: updated.prompt,
      status: updated.status,
      error: updated.error_message,
      retry_count: updated.retry_count,
      timestamp: updated.timestamp,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/history
 *
 * Returns all prompt records, newest first.
 * Supports optional ?prompt= (text search) and ?status= filters.
 */
async function getHistoryController(req, res, next) {
  try {
    const { prompt, status } = req.query;
    const filters = {};
    if (prompt) filters.prompt = prompt;
    if (status) filters.status = status;

    const records = await getHistory(filters);
    return res.status(200).json({ total: records.length, records });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  submitPrompt,
  getHistory: getHistoryController,
};
