const MAX_PROMPT_LENGTH = 10000;
const VALID_STATUSES = ['pending', 'success', 'failed'];

function validatePrompt(req, res, next) {
  const { prompt } = req.body;

  if (prompt === undefined || prompt === null) {
    return res.status(400).json({ error: 'Prompt is required', code: 'MISSING_PROMPT', field: 'prompt' });
  }
  if (typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt must be a string', code: 'INVALID_PROMPT_TYPE', field: 'prompt' });
  }
  if (prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt cannot be empty or whitespace', code: 'EMPTY_PROMPT', field: 'prompt' });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({
      error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
      code: 'PROMPT_TOO_LONG',
      field: 'prompt',
      current_length: prompt.length,
      max_length: MAX_PROMPT_LENGTH,
    });
  }

  next();
}

function validateHistoryQuery(req, res, next) {
  const { prompt, status, limit, offset } = req.query;

  if (prompt !== undefined && (typeof prompt !== 'string' || prompt.trim().length === 0)) {
    return res.status(400).json({ error: 'Prompt filter must be a non-empty string', code: 'INVALID_PROMPT_FILTER', field: 'prompt' });
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
      code: 'INVALID_STATUS',
      field: 'status',
      valid_values: VALID_STATUSES,
    });
  }

  if (limit !== undefined) {
    const parsed = parseInt(limit, 10);
    if (isNaN(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'Limit must be a positive integer', code: 'INVALID_LIMIT', field: 'limit' });
    }
    req.query.limit = parsed;
  }

  if (offset !== undefined) {
    const parsed = parseInt(offset, 10);
    if (isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ error: 'Offset must be a non-negative integer', code: 'INVALID_OFFSET', field: 'offset' });
    }
    req.query.offset = parsed;
  }

  next();
}

module.exports = { validatePrompt, validateHistoryQuery };
