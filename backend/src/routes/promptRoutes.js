const express = require('express');
const router = express.Router();
const { validatePrompt, validateHistoryQuery } = require('../middleware/validator');
const { submitPrompt, getHistory } = require('../controllers/promptController');

router.post('/prompt', validatePrompt, submitPrompt);
router.get('/history', validateHistoryQuery, getHistory);

module.exports = router;
