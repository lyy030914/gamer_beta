const db = require('../models/db');
const path = require('path');
const fs = require('fs');
const { orchestrateGameGeneration } = require('../services/orchestrator');

function listGames(req, res) {
  const { page = 1, pageSize = 20, tag } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);

  let query = `
    SELECT g.id, g.title, g.description, g.cover_url, g.game_url, g.tags,
           g.play_count, g.status, g.created_at, g.updated_at,
           u.id as author_id, u.nickname as author_nickname, u.avatar as author_avatar
    FROM games g
    JOIN users u ON g.author_id = u.id
    WHERE g.status = 'published'
  `;
  let countQuery = `SELECT COUNT(*) as total FROM games WHERE status = 'published'`;
  const params = [];

  if (tag) {
    query += ` AND ',' || g.tags || ',' LIKE ?`;
    countQuery += ` AND ',' || tags || ',' LIKE ?`;
    params.push(`%,${tag},%`);
  }

  query += ` ORDER BY g.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const games = db.prepare(query).all(...params);
  const { total } = db.prepare(countQuery).get(
    ...(tag ? [`%,${tag},%`] : [])
  );

  const list = games.map(g => ({
    id: g.id,
    title: g.title,
    description: g.description,
    coverUrl: g.cover_url,
    gameUrl: g.game_url,
    tags: g.tags ? g.tags.split(',').filter(Boolean) : [],
    playCount: g.play_count,
    status: g.status,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    author: {
      id: g.author_id,
      nickname: g.author_nickname,
      avatar: g.author_avatar
    }
  }));

  res.json({ games: list, total, page: parseInt(page), pageSize: limit });
}

function getGame(req, res) {
  const { id } = req.params;

  const game = db.prepare(`
    SELECT g.*, u.nickname as author_nickname, u.avatar as author_avatar,
           gm.meta_json
    FROM games g
    JOIN users u ON g.author_id = u.id
    LEFT JOIN game_meta gm ON gm.game_id = g.id
    WHERE g.id = ?
  `).get(id);

  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  db.prepare('UPDATE games SET play_count = play_count + 1 WHERE id = ?').run(id);

  res.json({
    game: {
      id: game.id,
      title: game.title,
      description: game.description,
      coverUrl: game.cover_url,
      gameUrl: game.game_url,
      tags: game.tags ? game.tags.split(',').filter(Boolean) : [],
      playCount: game.play_count + 1,
      status: game.status,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
      meta: game.meta_json ? JSON.parse(game.meta_json) : {},
      author: {
        id: game.author_id,
        nickname: game.author_nickname,
        avatar: game.author_avatar
      }
    }
  });
}

function createGame(req, res) {
  const { title, description, tags, gameUrl, coverUrl, meta } = req.body;

  if (!title || !gameUrl) {
    return res.status(400).json({ error: 'Title and game URL are required' });
  }

  const result = db.prepare(`
    INSERT INTO games (title, description, cover_url, game_url, tags, author_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    title,
    description || '',
    coverUrl || '',
    gameUrl,
    Array.isArray(tags) ? tags.join(',') : (tags || ''),
    req.userId
  );

  if (meta) {
    db.prepare('INSERT INTO game_meta (game_id, meta_json) VALUES (?, ?)').run(
      result.lastInsertRowid,
      JSON.stringify(meta)
    );
  }

  res.status(201).json({
    game: {
      id: result.lastInsertRowid,
      title,
      description,
      coverUrl,
      gameUrl,
      tags: Array.isArray(tags) ? tags : [],
      meta: meta || {}
    }
  });
}

function deleteGame(req, res) {
  const { id } = req.params;

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  if (game.author_id !== req.userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (game.game_url) {
    const filePath = path.resolve(game.game_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  if (game.cover_url) {
    const coverPath = path.resolve(game.cover_url);
    if (fs.existsSync(coverPath)) {
      fs.unlinkSync(coverPath);
    }
  }

  db.prepare('DELETE FROM game_meta WHERE game_id = ?').run(id);
  db.prepare('DELETE FROM games WHERE id = ?').run(id);

  res.json({ message: 'Game deleted' });
}

async function generateGame(req, res) {
  const { prompt, imageUrls } = req.body;

  if (!prompt || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Game prompt is required' });
  }

  try {
    const urls = Array.isArray(imageUrls) ? imageUrls : [];
    const result = await orchestrateGameGeneration(prompt.trim(), req.userId, urls);
    res.status(201).json(result);
  } catch (e) {
    console.error('[GameController] Generation failed:', e.message);
    res.status(500).json({ error: 'Game generation failed: ' + e.message });
  }
}

module.exports = { listGames, getGame, createGame, deleteGame, generateGame };
