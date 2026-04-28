/**
 * ResponseCard Component
 * 
 * Displays the AI response after prompt submission.
 * Features:
 * - Status badge (success/failed) with color coding
 * - Retry count indicator
 * - Error message display for failures
 * - Clean card layout with proper spacing
 */

const ResponseCard = ({ response }) => {
  // Don't render if no response
  if (!response) return null;

  const { status, response: aiResponse, error_message, retry_count } = response;
  
  // Determine status badge styling
  const isSuccess = status === 'success';
  const statusBadgeClass = isSuccess
    ? 'bg-green-100 text-green-800 border-green-200'
    : 'bg-red-100 text-red-800 border-red-200';

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
      {/* Header with status badge */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          AI Response
        </h3>
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${statusBadgeClass}`}>
          {status}
        </span>
      </div>

      {/* Response content or error message */}
      <div className="mb-4">
        {isSuccess ? (
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {aiResponse}
          </p>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium mb-1">Error:</p>
            <p className="text-red-700">{error_message || 'An unknown error occurred'}</p>
          </div>
        )}
      </div>

      {/* Retry count indicator (only show if retries happened) */}
      {retry_count > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <svg 
            className="w-5 h-5 text-yellow-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
          <span>
            This request was retried <strong>{retry_count}</strong> time{retry_count > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
};

export default ResponseCard;
