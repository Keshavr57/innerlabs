/**
 * Prompt Routes
 * 
 * This module defines the Express routes for prompt-related endpoints.
 * Routes connect HTTP endpoints to controller functions and apply middleware.
 */

const express = require('express');
const router = express.Router();
const { validatePrompt, validateHistoryQuery } = require('../middleware/validator');
const { submitPrompt, getHistory, getHistoryByPrompt } = require('../controllers/promptController');

// POST /api/prompt - Submit a prompt for AI processing
router.post('/prompt', validatePrompt, submitPrompt);

// GET /api/history - Retrieve all prompt history (with optional filters)
router.get('/history', validateHistoryQuery, getHistory);

module.exports = router;
