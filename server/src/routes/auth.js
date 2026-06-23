const express = require('express');
const router = express.Router();
const { register, login, getMe, githubAuth, githubCallback } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.get('/github', githubAuth);
router.get('/github/callback', githubCallback);

module.exports = router;
