/**
 * Database Configuration Module
 * 
 * Purpose: Establishes and manages MongoDB connection using Mongoose
 * 
 * Design Decisions:
 * - Connection pooling configured via environment variables for flexibility
 * - Comprehensive error handling with descriptive messages
 * - Connection retry logic for transient failures
 * - Graceful shutdown handling to prevent data loss
 * - Event listeners for monitoring connection health
 * 
 * Why Mongoose?
 * - Provides schema validation and type safety
 * - Built-in connection pooling and retry logic
 * - Excellent integration with Node.js async/await
 * - Simplifies query building and data modeling
 */

const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Sleep utility for implementing delays between retry attempts
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Resolves after the specified delay
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Classify MongoDB connection errors as transient or permanent
 * 
 * Transient errors (should retry):
 * - Network timeouts (ETIMEDOUT, ECONNREFUSED)
 * - Server selection timeout (no reachable servers)
 * - Connection refused (server temporarily down)
 * - DNS resolution failures (temporary DNS issues)
 * 
 * Permanent errors (should NOT retry):
 * - Authentication failures (wrong credentials)
 * - Invalid connection string format
 * - Database access denied
 * 
 * @param {Error} error - The error object from mongoose.connect
 * @returns {boolean} True if error is transient and should be retried
 */
const isTransientConnectionError = (error) => {
  const errorMessage = error.message.toLowerCase();
  const errorCode = error.code;
  
  // Network-related errors (transient)
  const transientCodes = [
    'ETIMEDOUT',      // Connection timeout
    'ECONNREFUSED',   // Connection refused (server down)
    'ENOTFOUND',      // DNS lookup failed
    'ENETUNREACH',    // Network unreachable
    'EHOSTUNREACH',   // Host unreachable
    'ECONNRESET',     // Connection reset by peer
  ];
  
  if (transientCodes.includes(errorCode)) {
    return true;
  }
  
  // MongoDB-specific transient errors
  if (errorMessage.includes('server selection timeout') ||
      errorMessage.includes('no servers available') ||
      errorMessage.includes('connection timeout') ||
      errorMessage.includes('socket timeout')) {
    return true;
  }
  
  // Permanent errors (authentication, authorization, configuration)
  if (errorMessage.includes('authentication failed') ||
      errorMessage.includes('auth failed') ||
      errorMessage.includes('bad auth') ||
      errorMessage.includes('invalid connection string') ||
      errorMessage.includes('not authorized') ||
      errorMessage.includes('access denied')) {
    return false;
  }
  
  // Default to transient (safer to retry than to fail immediately)
  // This handles unknown error types that might be transient
  return true;
};

/**
 * Connect to MongoDB with connection pooling and error handling
 * 
 * Connection Strategy:
 * - Uses connection pooling to reuse connections (improves performance)
 * - Implements automatic reconnection for transient failures
 * - Configures timeouts to prevent hanging connections
 * - Logs connection events for monitoring and debugging
 * - Retries connection with exponential backoff on transient failures
 * 
 * @param {number} maxRetries - Maximum number of connection retry attempts (default: 3)
 * @param {number} initialDelayMs - Initial delay in milliseconds before first retry (default: 1000)
 * @returns {Promise<void>} Resolves when connection is established
 * @throws {Error} If connection fails after all retry attempts
 */
const connectDB = async (maxRetries = 3, initialDelayMs = 1000) => {
  // Get MongoDB URI from environment variables
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/prompt-tracking-system';
  
  // Connection options for production-ready configuration
  const options = {
    // Connection Pool Settings
    // Why pooling? Reuses connections instead of creating new ones for each request
    // Improves performance and prevents connection exhaustion
    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,  // Max concurrent connections
    minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 2,   // Keep minimum connections open
    
    // Timeout Settings
    // Why timeouts? Prevents hanging connections and provides fast failure feedback
    socketTimeoutMS: 45000,              // Close sockets after 45s of inactivity
    serverSelectionTimeoutMS: 5000,      // Fail fast if server not reachable in 5s
    
    // Retry Settings
    // Why auto-reconnect? Handles transient network failures gracefully
    // Mongoose 6+ has auto-reconnect enabled by default, but we make it explicit
  };

  // Retry loop with exponential backoff
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Log connection attempt
      if (attempt === 1) {
        console.log('Connecting to MongoDB...');
      } else {
        console.log(`MongoDB connection retry attempt ${attempt}/${maxRetries}...`);
      }
      
      // Attempt connection
      await mongoose.connect(mongoURI, options);
      
      // Connection successful
      console.log(`MongoDB connected successfully: ${mongoose.connection.host}`);
      console.log(`Database: ${mongoose.connection.name}`);
      console.log(`Connection pool: min=${options.minPoolSize}, max=${options.maxPoolSize}`);
      
      if (attempt > 1) {
        console.log(`Connection established after ${attempt} attempts`);
      }
      
      return; // Success - exit function
      
    } catch (error) {
      lastError = error;
      
      // Classify error as transient or permanent
      const isTransientError = isTransientConnectionError(error);
      
      // Log error details
      console.error(`MongoDB connection attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (!isTransientError) {
        // Permanent error - don't retry
        console.error('Error is not transient. Aborting retry attempts.');
        console.error('Connection URI:', process.env.MONGODB_URI ? 'Set in environment' : 'Using default');
        throw new Error(`Failed to connect to MongoDB (permanent error): ${error.message}`);
      }
      
      // If this was the last attempt, throw error
      if (attempt === maxRetries) {
        console.error('All connection retry attempts exhausted');
        console.error('Connection URI:', process.env.MONGODB_URI ? 'Set in environment' : 'Using default');
        throw new Error(`Failed to connect to MongoDB after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Calculate exponential backoff delay: initialDelay * 2^(attempt-1)
      // Attempt 1: 1000ms, Attempt 2: 2000ms, Attempt 3: 4000ms
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      console.log(`Waiting ${delayMs}ms before retry...`);
      
      // Wait before next retry
      await sleep(delayMs);
    }
  }
  
  // This should never be reached, but included for completeness
  throw new Error(`Failed to connect to MongoDB: ${lastError?.message || 'Unknown error'}`);
};

/**
 * Gracefully close MongoDB connection
 * 
 * Why graceful shutdown?
 * - Ensures all pending operations complete before closing
 * - Prevents data loss or corruption
 * - Releases connection pool resources properly
 * 
 * @returns {Promise<void>} Resolves when connection is closed
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed gracefully');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error.message);
    throw error;
  }
};

/**
 * Get current connection state
 * 
 * Connection States:
 * 0 = disconnected
 * 1 = connected
 * 2 = connecting
 * 3 = disconnecting
 * 
 * @returns {number} Current connection state
 */
const getConnectionState = () => {
  return mongoose.connection.readyState;
};

/**
 * Check if database is connected
 * 
 * @returns {boolean} True if connected, false otherwise
 */
const isConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Connection Event Listeners
// Why event listeners? Provides visibility into connection health for monitoring

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

// Handle application termination gracefully
// Why? Ensures clean shutdown and prevents orphaned connections
process.on('SIGINT', async () => {
  try {
    await disconnectDB();
    console.log('Application terminated, MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error.message);
    process.exit(1);
  }
});

// Export connection functions for use in server.js and tests
module.exports = {
  connectDB,
  disconnectDB,
  getConnectionState,
  isConnected,
  // Export helper functions for testing
  sleep,
  isTransientConnectionError
};
