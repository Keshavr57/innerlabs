/**
 * Home Page
 * 
 * Main application page that orchestrates the prompt tracking system.
 * Responsibilities:
 * - Manage application state (current response, history)
 * - Handle prompt submission
 * - Fetch and refresh history
 * - Coordinate between components
 * - Handle errors gracefully
 */

import { useState, useEffect } from 'react';
import PromptForm from '../components/PromptForm';
import ResponseCard from '../components/ResponseCard';
import HistoryList from '../components/HistoryList';
import { submitPrompt, getHistory } from '../services/api';

const Home = () => {
  // State management
  const [currentResponse, setCurrentResponse] = useState(null);
  const [history, setHistory] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState(null);

  // Fetch history on component mount
  useEffect(() => {
    fetchHistory();
  }, []);

  /**
   * Fetch prompt history from backend
   */
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    const result = await getHistory();
    
    if (result.success) {
      setHistory(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    
    setIsLoadingHistory(false);
  };

  /**
   * Handle prompt submission
   * @param {string} prompt - User's prompt text
   */
  const handleSubmit = async (prompt) => {
    setIsSubmitting(true);
    setError(null);
    setCurrentResponse(null); // Clear previous response

    const result = await submitPrompt(prompt);

    if (result.success) {
      setCurrentResponse(result.data);
      // Refresh history to include the new entry
      await fetchHistory();
    } else {
      setError(result.error);
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Prompt Tracking System
          </h1>
          <p className="text-gray-600">
            Submit prompts to the AI service and track all responses with retry monitoring
          </p>
        </header>

        {/* Global error message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg 
                className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
              <div>
                <p className="text-red-800 font-medium">Error</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Form and Response */}
          <div className="space-y-6">
            <PromptForm 
              onSubmit={handleSubmit} 
              isLoading={isSubmitting} 
            />
            
            {currentResponse && (
              <ResponseCard response={currentResponse} />
            )}
          </div>

          {/* Right column: History */}
          <div>
            <HistoryList 
              history={history} 
              isLoading={isLoadingHistory} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
