const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  const { total } = db.prepare('SELECT COUNT(*) as total FROM favorites WHERE user_id = ?').get(req.userId);

  const favs = db.prepare(`
    SELECT g.id, g.title, g.description, g.cover_url, g.game_url, g.tags,
           g.play_count, g.created_at, g.updated_at,
           u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar,
           f.created_at as fav_at
    FROM favorites f
    JOIN games g ON f.game_id = g.id
    JOIN users u ON g.author_id = u.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC LIMIT ? OFFSET ?
  `).all(req.userId, parseInt(pageSize), offset);

  const games = favs.map(g => ({
    id: g.id, title: g.title, description: g.description,
    coverUrl: g.cover_url, gameUrl: g.game_url,
    tags: g.tags ? g.tags.split(',').filter(Boolean) : [],
    playCount: g.play_count, createdAt: g.created_at, updatedAt: g.updated_at,
    favoritedAt: g.fav_at,
    author: { id: g.author_id, nickname: g.author_nickname, avatar: g.author_avatar }
  }));

  res.json({ games, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.get('/check/:gameId', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND game_id = ?').get(req.userId, req.params.gameId);
  res.json({ favorited: !!row });
});

router.post('/:gameId', authMiddleware, (req, res) => {
  const { gameId } = req.params;
  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND game_id = ?').get(req.userId, gameId);

  if (existing) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
    res.json({ favorited: false, action: 'removed' });
  } else {
    db.prepare('INSERT INTO favorites (user_id, game_id) VALUES (?, ?)').run(req.userId, gameId);
    res.json({ favorited: true, action: 'added' });
  }
});

module.exports = router;
