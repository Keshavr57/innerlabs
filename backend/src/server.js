/**
 * Express Server Setup
 * 
 * This is the main entry point for the Node.js backend API.
 * It initializes the Express application, connects to MongoDB, registers middleware,
 * and starts the HTTP server.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/database');
const promptRoutes = require('./routes/promptRoutes');
const errorHandler = require('./middleware/errorHandler');

// Initialize Express app
const app = express();

// Middleware
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(cors()); // Enable CORS for all routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'backend-api',
    timestamp: new Date().toISOString()
  });
});

// Register routes
app.use('/api', promptRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Server configuration
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✓ MongoDB connected successfully');
    
    // Start HTTP server
    app.listen(PORT, HOST, () => {
      console.log(`✓ Server running on http://${HOST}:${PORT}`);
      console.log(`✓ Health check: http://${HOST}:${PORT}/health`);
      console.log(`✓ API endpoints: http://${HOST}:${PORT}/api`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
