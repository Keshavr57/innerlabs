/**
 * PromptForm Component
 * 
 * Handles user input for submitting prompts to the AI service.
 * Features:
 * - Controlled textarea input
 * - Loading state during submission
 * - Disabled state to prevent double-submission
 * - Clean, accessible UI with Tailwind
 */

import { useState } from 'react';

const PromptForm = ({ onSubmit, isLoading }) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation: don't submit empty prompts
    if (!prompt.trim()) {
      return;
    }

    // Call parent's submit handler
    onSubmit(prompt);
    
    // Clear the input after submission
    setPrompt('');
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        Submit a Prompt
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label 
            htmlFor="prompt" 
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Your Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt here..."
            rows={6}
            disabled={isLoading}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="w-full bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg 
                className="animate-spin h-5 w-5 text-white" 
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
              Processing...
            </>
          ) : (
            'Submit Prompt'
          )}
        </button>
      </form>
    </div>
  );
};

export default PromptForm;
