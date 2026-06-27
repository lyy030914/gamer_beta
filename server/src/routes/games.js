const express = require('express');
const router = express.Router();
const { listGames, getGame, createGame, deleteGame, generateGame, getAllTags, getStats,
  getGenerateTrace, listGenerateTraces, listFailedTraces, getGenerateTraceStats } = require('../controllers/gameController');
const { pushToGitHub } = require('../controllers/authController');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, listGames);
router.get('/tags', getAllTags);
router.get('/stats', getStats);

// Trace routes (must be before /:id to avoid route conflict)
router.get('/traces', authMiddleware, listGenerateTraces);
router.get('/traces/failed', authMiddleware, listFailedTraces);
router.get('/traces/stats', authMiddleware, getGenerateTraceStats);
router.get('/traces/:traceId', authMiddleware, getGenerateTrace);

router.post('/generate', authMiddleware, generateGame);
router.post('/:id/push-github', authMiddleware, pushToGitHub);
router.get('/:id', getGame);
router.post('/', authMiddleware, createGame);
router.delete('/:id', authMiddleware, deleteGame);

module.exports = router;
