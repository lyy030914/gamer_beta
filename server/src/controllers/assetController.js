const db = require('../models/db');
const fs = require('fs');
const path = require('path');

function listAssets(req, res) {
  const { page = 1, pageSize = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);

  const assets = db.prepare(`
    SELECT id, filename, url, mimetype, size, created_at
    FROM assets WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(req.userId, limit, offset);

  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM assets WHERE user_id = ?'
  ).get(req.userId);

  res.json({ assets, total, page: parseInt(page), pageSize: limit });
}

function deleteAsset(req, res) {
  const { id } = req.params;
  const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const filePath = path.resolve(asset.url.startsWith('/') ? '.' + asset.url : asset.url);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}

  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  res.json({ message: 'Asset deleted' });
}

module.exports = { listAssets, deleteAsset };
