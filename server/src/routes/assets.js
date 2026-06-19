const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { listAssets, deleteAsset } = require('../controllers/assetController');
const db = require('../models/db');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(uploadDir, 'covers')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const router = express.Router();

router.get('/', authMiddleware, listAssets);

router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/covers/${req.file.filename}`;
  db.prepare('INSERT INTO assets (user_id, filename, url, mimetype, size) VALUES (?,?,?,?,?)')
    .run(req.userId, req.file.originalname, url, req.file.mimetype, req.file.size);
  const asset = db.prepare('SELECT * FROM assets WHERE url = ?').get(url);
  res.status(201).json({ asset });
});

router.delete('/:id', authMiddleware, deleteAsset);

module.exports = router;
