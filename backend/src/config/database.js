const mongoose = require('mongoose');
require('dotenv').config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Permanent errors should not be retried — wrong credentials, bad URI, access denied
function isTransientError(error) {
  const msg = error.message.toLowerCase();
  const transientCodes = ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET'];

  if (transientCodes.includes(error.code)) return true;
  if (msg.includes('server selection timeout') || msg.includes('connection timeout')) return true;
  if (msg.includes('authentication failed') || msg.includes('not authorized') || msg.includes('bad auth')) return false;

  return true;
}

async function connectDB(maxRetries = 3, initialDelayMs = 1000) {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/prompt-tracking-system';
  const options = {
    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
    minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 2,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) console.log(`MongoDB connection retry ${attempt}/${maxRetries}...`);
      await mongoose.connect(uri, options);
      console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (!isTransientError(error)) {
        throw new Error(`MongoDB connection failed (permanent error): ${error.message}`);
      }

      if (attempt === maxRetries) {
        throw new Error(`MongoDB connection failed after ${maxRetries} attempts: ${error.message}`);
      }

      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

async function disconnectDB() {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
}

const isConnected = () => mongoose.connection.readyState === 1;

mongoose.connection.on('error', (err) => console.error('Mongoose error:', err.message));
mongoose.connection.on('disconnected', () => console.warn('Mongoose disconnected'));

process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

module.exports = { connectDB, disconnectDB, isConnected, sleep, isTransientError };
