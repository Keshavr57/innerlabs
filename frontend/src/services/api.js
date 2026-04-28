/**
 * API Service Layer
 * 
 * Centralizes all backend communication using axios.
 * Benefits:
 * - Single source of truth for API endpoints
 * - Consistent error handling
 * - Easy to mock for testing
 * - Base URL configuration in one place
 */

import axios from 'axios';

// Base URL for the backend API
// In production, this would come from environment variables
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout (AI responses can take time)
});

/**
 * Submit a prompt to the AI service
 * @param {string} prompt - The user's prompt text
 * @returns {Promise} Response data including AI response, status, retry_count
 */
export const submitPrompt = async (prompt) => {
  try {
    const response = await apiClient.post('/prompt', { prompt });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to submit prompt',
    };
  }
};

/**
 * Fetch all prompt history
 * @returns {Promise} Array of historical prompts with responses
 */
export const getHistory = async () => {
  try {
    const response = await apiClient.get('/history');
    return {
      success: true,
      data: response.data.records ?? response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to fetch history',
    };
  }
};

export default apiClient;
