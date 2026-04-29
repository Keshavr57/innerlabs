// Maps error characteristics to HTTP status codes
function getStatusCode(error) {
  if (error.statusCode) return error.statusCode;
  if (error.name === 'ValidationError' || error.name === 'CastError') return 400;
  if (error.message?.includes('not found')) return 404;
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') return 500;
  if (error.message?.includes('AI service') || error.message?.includes('service unavailable')) return 503;
  return 500;
}

function getErrorCode(error) {
  if (error.code && typeof error.code === 'string') return error.code;

  const codeMap = {
    ValidationError: 'VALIDATION_ERROR',
    CastError: 'INVALID_DATA_TYPE',
    MongoNetworkError: 'DATABASE_CONNECTION_ERROR',
    MongoTimeoutError: 'DATABASE_TIMEOUT',
    MongoError: 'DATABASE_ERROR',
  };

  if (codeMap[error.name]) return codeMap[error.name];
  if (error.message?.includes('not found')) return 'NOT_FOUND';
  if (error.message?.includes('AI service')) return 'AI_SERVICE_ERROR';
  return 'INTERNAL_ERROR';
}

// Scrub internal details from error messages in production
function sanitizeMessage(message) {
  if (process.env.NODE_ENV === 'development') return message;
  if (message.includes('Mongo') || message.includes('database')) return 'A database error occurred. Please try again later.';
  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) return 'A service is temporarily unavailable. Please try again later.';
  return message;
}

// Must be registered last in the Express middleware chain (4-arg signature required by Express)
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', {
    message: err.message,
    name: err.name,
    url: req.url,
    method: req.method,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });

  const response = {
    error: sanitizeMessage(err.message),
    code: getErrorCode(err),
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(getStatusCode(err)).json(response);
}

module.exports = errorHandler;
