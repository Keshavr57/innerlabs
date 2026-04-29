const mongoose = require('mongoose');

/**
 * Represents the full lifecycle of a single prompt request.
 *
 * A record is created with status='pending' before the AI call is made,
 * ensuring every request is tracked even if the service fails mid-flight.
 * It is updated to 'success' or 'failed' once the retry cycle completes.
 *
 * Related: FailureLog stores per-attempt failure details for requests that retry.
 */
const ResponseRecordSchema = new mongoose.Schema({
  prompt:        { type: String, required: true, maxlength: 10000 },
  response:      { type: String, default: null },
  status:        { type: String, enum: ['pending', 'success', 'failed'], required: true },
  retry_count:   { type: Number, default: 0, min: 0, max: 3 },
  error_message: { type: String, default: null },
  timestamp:     { type: Date, default: Date.now },
  request_id:    { type: String, default: () => new mongoose.Types.ObjectId().toString(), unique: true },
});

ResponseRecordSchema.index({ timestamp: -1 });  // default sort: newest first
ResponseRecordSchema.index({ prompt: 'text' });  // full-text search support
ResponseRecordSchema.index({ status: 1 });       // filter by status

module.exports = mongoose.model('ResponseRecord', ResponseRecordSchema);
