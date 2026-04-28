/**
 * ResponseRecord Model
 * 
 * This Mongoose schema defines the structure for storing all prompt requests and their responses
 * in the MongoDB database. Each record represents a complete request lifecycle, from initial
 * submission through final success or failure.
 * 
 * Design Decision: This model is the single source of truth for request state and retry counts.
 * The Node backend owns all retry logic and updates this record after each attempt, ensuring
 * that request state persists even if the server restarts mid-retry.
 * 
 * Fields:
 * - prompt: The original user-submitted text (indexed for search, max 10000 chars)
 * - response: The AI-generated response (null if request failed)
 * - status: Current state of the request (pending/success/failed)
 * - retry_count: Number of retry attempts made (0-3)
 * - error_message: Final error details (only populated if status = 'failed')
 * - timestamp: When the request was created (indexed for sorting)
 * - request_id: Unique identifier for tracing across services
 * 
 * Lifecycle:
 * 1. Record created with status='pending', retry_count=0
 * 2. After each failed attempt, retry_count increments
 * 3. Final state: status='success' (with response) or status='failed' (with error_message)
 * 
 * Related: FailureLog model stores detailed failure information for each retry attempt
 */

const mongoose = require('mongoose');

const ResponseRecordSchema = new mongoose.Schema({
  prompt: {
    type: String,
    required: true,
    maxlength: 10000
  },
  response: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    required: true
  },
  retry_count: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  error_message: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  request_id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString(),
    unique: true
  }
});

/**
 * Indexes for Query Performance
 * 
 * These indexes optimize the three main query patterns in the system:
 * 
 * 1. timestamp (descending): Enables fast sorting for history retrieval (newest first)
 *    - Used by: GET /api/history (default sort order)
 *    - Performance: O(log n) instead of O(n) for sorting
 * 
 * 2. prompt (text index): Enables fast full-text search across prompt content
 *    - Used by: GET /api/history?prompt=<query> (search by prompt text)
 *    - Performance: Text search with relevance scoring
 * 
 * 3. status: Enables fast filtering by request status (success/failed/pending)
 *    - Used by: Future filtering endpoints (e.g., show only failures)
 *    - Performance: O(log n) instead of O(n) for filtering
 * 
 * Design Decision: These indexes are added at the schema level rather than created manually
 * because Mongoose automatically ensures they exist when the model is first used. This
 * approach is more maintainable and works correctly in both development and production.
 * 
 * Trade-off: Indexes improve read performance but slightly slow down writes (inserts/updates).
 * This is acceptable because our system is read-heavy (history queries) compared to writes
 * (new prompt submissions).
 */

// Index for sorting by timestamp (newest first) - used in history retrieval
ResponseRecordSchema.index({ timestamp: -1 });

// Text index for full-text search on prompt field - used in prompt filtering
ResponseRecordSchema.index({ prompt: 'text' });

// Index for filtering by status - used to show only failures or successes
ResponseRecordSchema.index({ status: 1 });

module.exports = mongoose.model('ResponseRecord', ResponseRecordSchema);
