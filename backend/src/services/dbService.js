const ResponseRecord = require('../models/ResponseRecord');
const FailureLog = require('../models/FailureLog');

// Only retry on transient infrastructure errors, not data/validation bugs
function isRetryableDatabaseError(error) {
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') return true;
  if (error.message?.includes('connection')) return true;
  if (error.name === 'ValidationError' || error.name === 'CastError') return false;
  if (error.code === 11000) return false; // duplicate key
  return false;
}

async function withRetry(operation, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableDatabaseError(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function createResponseRecord(data) {
  return withRetry(async () => {
    const record = new ResponseRecord(data);
    await record.save();
    return record;
  });
}

async function updateResponseRecord(requestId, updates) {
  return withRetry(async () => {
    const record = await ResponseRecord.findOneAndUpdate(
      { request_id: requestId },
      updates,
      { new: true }
    );
    if (!record) throw new Error(`ResponseRecord not found: ${requestId}`);
    return record;
  });
}

async function createFailureLog(data) {
  return withRetry(async () => {
    const log = new FailureLog(data);
    await log.save();
    return log;
  });
}

async function getHistory(filters = {}) {
  const query = {};
  if (filters.prompt) query.$text = { $search: filters.prompt };
  if (filters.status) query.status = filters.status;

  return ResponseRecord.find(query).sort({ timestamp: -1 }).exec();
}

async function getResponseRecord(requestId) {
  return ResponseRecord.findOne({ request_id: requestId }).exec();
}

async function getFailureLogs(requestId) {
  return FailureLog.find({ request_id: requestId }).sort({ retry_attempt: 1 }).exec();
}

module.exports = { createResponseRecord, updateResponseRecord, createFailureLog, getHistory, getResponseRecord, getFailureLogs };
