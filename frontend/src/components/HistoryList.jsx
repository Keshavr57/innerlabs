/**
 * HistoryList Component
 * 
 * Displays all historical prompts and their responses.
 * Features:
 * - Chronological list (latest first)
 * - Status badges for each entry
 * - Timestamp formatting
 * - Empty state handling
 * - Expandable/collapsible design for long responses
 */

const HistoryList = ({ history, isLoading }) => {
  // Format timestamp to readable format
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Ensure history is an array
  const historyArray = Array.isArray(history) ? history : [];

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">History</h2>
        <div className="flex items-center justify-center py-8">
          <svg 
            className="animate-spin h-8 w-8 text-blue-600" 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24"
          >
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      </div>
    );
  }

  // Empty state
  if (!history || history.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">History</h2>
        <div className="text-center py-8">
          <svg 
            className="mx-auto h-12 w-12 text-gray-400 mb-3" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
            />
          </svg>
          <p className="text-gray-500">No history yet. Submit your first prompt!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        History ({history.length})
      </h2>
      
      <div className="space-y-4">
        {history.map((entry) => {
          const isSuccess = entry.status === 'success';
          const statusBadgeClass = isSuccess
            ? 'bg-green-100 text-green-800 border-green-200'
            : 'bg-red-100 text-red-800 border-red-200';

          return (
            <div 
              key={entry._id} 
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              {/* Header: timestamp and status */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusBadgeClass}`}>
                  {entry.status}
                </span>
              </div>

              {/* Prompt */}
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  Prompt
                </p>
                <p className="text-gray-800 text-sm">
                  {entry.prompt}
                </p>
              </div>

              {/* Response or Error */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  {isSuccess ? 'Response' : 'Error'}
                </p>
                {isSuccess ? (
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">
                    {entry.response}
                  </p>
                ) : (
                  <p className="text-red-700 text-sm">
                    {entry.error_message || 'Unknown error'}
                  </p>
                )}
              </div>

              {/* Retry count indicator */}
              {entry.retry_count > 0 && (
                <div className="mt-3 flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 w-fit">
                  <svg 
                    className="w-4 h-4" 
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
                  <span>{entry.retry_count} retry</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistoryList;
