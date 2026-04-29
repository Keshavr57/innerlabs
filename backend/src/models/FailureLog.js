const mongoose = require('mongoose');

/**
 * Records each individual failed attempt during the retry cycle.
 *
 * A single request that exhausts all 3 retries produces 3 FailureLog entries
 * and 1 ResponseRecord (status='failed'). This separation enables per-attempt
 * failure analysis — error type distribution, timing patterns, which service
 * fails most — without polluting the main ResponseRecord.
 */
const FailureLogSchema = new mongoose.Schema({
  request_id:    { type: String, required: true },
  prompt:        { type: String, required: true },
  error_message: { type: String, required: true },
  error_type:    { type: String, enum: ['timeout', 'rate_limit', 'network', 'api_error', 'unknown'], required: true },
  retry_attempt: { type: Number, required: true, min: 1, max: 3 },
  service:       { type: String, enum: ['python_ai_service', 'groq_api'], required: true },
  timestamp:     { type: Date, default: Date.now },
});

FailureLogSchema.index({ request_id: 1 });  // look up all failures for a request
FailureLogSchema.index({ error_type: 1 });  // aggregate by error type
FailureLogSchema.index({ timestamp: -1 });  // time-range queries

module.exports = mongoose.model('FailureLog', FailureLogSchema);
