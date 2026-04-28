/**
 * FailureLog Model
 * 
 * This Mongoose schema defines the structure for storing detailed failure information for each
 * retry attempt in the MongoDB database. Unlike ResponseRecord (which stores the final outcome),
 * FailureLog captures every individual failure that occurs during the retry process.
 * 
 * Design Decision: Separate FailureLog from ResponseRecord to enable detailed failure analysis.
 * If a request fails 3 times, we get 3 FailureLog entries (one per attempt) and 1 ResponseRecord
 * (final status='failed'). This separation allows us to:
 * - Analyze which retry attempts fail most often
 * - Identify patterns in error types (e.g., rate limits at specific times)
 * - Debug the complete timeline of what happened during retries
 * - Monitor service health (which service fails more: python_ai_service or groq_api)
 * 
 * Fields:
 * - request_id: Links to the corresponding ResponseRecord (indexed for fast lookup)
 * - prompt: The original prompt that failed (stored for context)
 * - error_message: Detailed error description from the failing service
 * - error_type: Categorized error type for analytics (timeout, rate_limit, etc.)
 * - retry_attempt: Which attempt failed (1, 2, or 3)
 * - service: Which service failed (python_ai_service or groq_api)
 * - timestamp: When this specific failure occurred (indexed for time-based queries)
 * 
 * Example Usage:
 * If a request fails on attempt 1 (timeout), succeeds on attempt 2:
 * - 1 FailureLog entry (attempt 1, error_type='timeout')
 * - 1 ResponseRecord (status='success', retry_count=1)
 * 
 * If a request fails all 3 attempts:
 * - 3 FailureLog entries (attempts 1, 2, 3 with their respective errors)
 * - 1 ResponseRecord (status='failed', retry_count=3)
 * 
 * Related: ResponseRecord model stores the final outcome of each request
 */

const mongoose = require('mongoose');

const FailureLogSchema = new mongoose.Schema({
  request_id: {
    type: String,
    required: true
  },
  prompt: {
    type: String,
    required: true
  },
  error_message: {
    type: String,
    required: true
  },
  error_type: {
    type: String,
    enum: ['timeout', 'rate_limit', 'network', 'api_error', 'unknown'],
    required: true
  },
  retry_attempt: {
    type: Number,
    required: true,
    min: 1,
    max: 3
  },
  service: {
    type: String,
    enum: ['python_ai_service', 'groq_api'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Indexes for query performance
// request_id: Fast lookup of all failures for a specific request
FailureLogSchema.index({ request_id: 1 });

// error_type: Fast analytics queries (e.g., count by error type)
FailureLogSchema.index({ error_type: 1 });

// timestamp: Fast time-based filtering and sorting
FailureLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('FailureLog', FailureLogSchema);
