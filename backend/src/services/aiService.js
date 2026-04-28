/**
 * AI Service Client
 * 
 * This module provides the interface for the Node.js backend to communicate with
 * the Python AI Service. It handles HTTP requests to the AI service and returns
 * structured responses.
 * 
 * Design Decision: This service acts as a client to the Python AI microservice.
 * All retry logic, persistence, and orchestration happens in the Node backend,
 * while this module focuses solely on HTTP communication with the AI service.
 * 
 * Architecture:
 * - Makes HTTP POST requests to Python AI service /process endpoint
 * - Sets appropriate timeouts to prevent hanging requests
 * - Parses and returns structured responses (success or error)
 * - Handles network errors and timeouts
 * - Does NOT implement retry logic (that's handled by retryService.js)
 * 
 * Error Handling:
 * - Network errors: Connection refused, DNS failures, etc.
 * - Timeouts: Request exceeds configured timeout
 * - HTTP errors: AI service returns error response
 * - All errors are returned as structured objects for retry logic to handle
 */

const axios = require('axios');

// AI Service Configuration
// Design Decision: Use environment variables for configuration to support
// different environments (development, staging, production)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_TIMEOUT = parseInt(process.env.AI_SERVICE_TIMEOUT || '5000', 10); // 5 seconds default

/**
 * Call the Python AI Service to process a prompt.
 * 
 * This function makes an HTTP POST request to the Python AI service's /process endpoint.
 * It sends the prompt and request_id, and returns the structured response.
 * 
 * Design Decision: This function does NOT retry on failure. Retry logic is handled
 * by the retryService.js module, which calls this function multiple times if needed.
 * This separation of concerns keeps the code modular and testable.
 * 
 * Request Flow:
 * 1. Make HTTP POST to AI service /process endpoint
 * 2. Include prompt and request_id in request body
 * 3. Set timeout to prevent hanging requests
 * 4. Parse response and return structured data
 * 5. Handle errors and return structured error objects
 * 
 * Error Handling Strategy:
 * - Network errors (ECONNREFUSED, ETIMEDOUT, etc.): Return error object with error_type "network"
 * - Timeout errors: Return error object with error_type "timeout"
 * - HTTP errors (4xx, 5xx): Parse error response from AI service
 * - Unknown errors: Return error object with error_type "unknown"
 * 
 * @param {string} prompt - The text prompt to be processed by the AI service
 * @param {string} requestId - Unique identifier for tracing this request across services
 * @returns {Promise<Object>} - Resolves with success response or error response
 *   Success: { success: true, response: string, model: string, tokens_used: number }
 *   Error: { success: false, error: string, error_type: string, retry_after: number, status_code: number }
 * 
 * @example
 * // Successful call
 * const result = await callAIService("Explain quantum computing", "req-123");
 * // result = { success: true, response: "Quantum computing uses...", model: "mixtral-8x7b-32768", tokens_used: 150 }
 * 
 * @example
 * // Failed call (network error)
 * const result = await callAIService("Hello", "req-456");
 * // result = { success: false, error: "AI service unavailable", error_type: "network", retry_after: 3, status_code: 502 }
 */
async function callAIService(prompt, requestId) {
  try {
    // Make HTTP POST request to Python AI service
    // Design Decision: Use axios for HTTP requests (industry standard, good error handling)
    const response = await axios.post(
      `${AI_SERVICE_URL}/process`,
      {
        prompt: prompt,
        request_id: requestId
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: AI_SERVICE_TIMEOUT, // 5 seconds timeout
        validateStatus: function (status) {
          // Don't throw on any status code - we'll handle errors manually
          // This allows us to parse error responses from the AI service
          return true;
        }
      }
    );

    // Check if the response indicates success or error
    // Design Decision: AI service returns structured responses with different schemas
    // PromptResponse: { response, model, tokens_used }
    // ErrorResponse: { error, error_type, retry_after, status_code }
    
    if (response.data.error) {
      // AI service returned an error response
      // Return structured error object for retry logic to handle
      return {
        success: false,
        error: response.data.error,
        error_type: response.data.error_type,
        retry_after: response.data.retry_after,
        status_code: response.data.status_code
      };
    }

    // Success response from AI service
    // Return structured success object
    return {
      success: true,
      response: response.data.response,
      model: response.data.model,
      tokens_used: response.data.tokens_used
    };

  } catch (error) {
    // Handle network errors, timeouts, and other exceptions
    // Design Decision: Classify errors to help retry logic make intelligent decisions
    
    if (error.code === 'ECONNREFUSED') {
      // AI service is not running or not reachable
      return {
        success: false,
        error: 'AI service is unavailable (connection refused)',
        error_type: 'network',
        retry_after: 3,
        status_code: 502 // Bad Gateway
      };
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      // Request timed out
      return {
        success: false,
        error: `AI service request timed out after ${AI_SERVICE_TIMEOUT}ms`,
        error_type: 'timeout',
        retry_after: 5,
        status_code: 408 // Request Timeout
      };
    }

    if (error.code === 'ENOTFOUND') {
      // DNS resolution failed
      return {
        success: false,
        error: `AI service host not found: ${AI_SERVICE_URL}`,
        error_type: 'network',
        retry_after: 0, // Don't retry DNS errors
        status_code: 502 // Bad Gateway
      };
    }

    // Unknown error
    // Design Decision: Return structured error even for unknown cases
    // This ensures consistent error handling throughout the system
    return {
      success: false,
      error: `Unexpected error calling AI service: ${error.message}`,
      error_type: 'unknown',
      retry_after: 0, // Don't retry unknown errors
      status_code: 500 // Internal Server Error
    };
  }
}

module.exports = {
  callAIService
};
