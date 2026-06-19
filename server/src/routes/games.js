const express = require('express');
const router = express.Router();
const { listGames, getGame, createGame, deleteGame, generateGame } = require('../controllers/gameController');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, listGames);
router.post('/generate', authMiddleware, generateGame);
router.get('/:id', getGame);
router.post('/', authMiddleware, createGame);
router.delete('/:id', authMiddleware, deleteGame);

module.exports = router;
