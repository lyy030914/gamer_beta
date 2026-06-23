const express = require('express');
const router = express.Router();
const { listGames, getGame, createGame, deleteGame, generateGame, getAllTags, getStats } = require('../controllers/gameController');
const { pushToGitHub } = require('../controllers/authController');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, listGames);
router.get('/tags', getAllTags);
router.get('/stats', getStats);
router.post('/generate', authMiddleware, generateGame);
router.post('/:id/push-github', authMiddleware, pushToGitHub);
router.get('/:id', getGame);
router.post('/', authMiddleware, createGame);
router.delete('/:id', authMiddleware, deleteGame);

module.exports = router;
