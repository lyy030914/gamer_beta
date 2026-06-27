const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { authMiddleware } = require('../middleware/auth');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = file.fieldname === 'cover' || file.mimetype.startsWith('image/') ? 'covers' : 'games';
    cb(null, path.join(uploadDir, type));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'cover') {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Cover must be an image (jpg, png, webp, gif)'));
    }
  } else if (file.fieldname === 'game') {
    const allowedTypes = [
      'text/html', 'application/javascript', 'application/json',
      'application/zip', 'application/x-zip-compressed',
      'application/octet-stream'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.html')) {
      cb(null, true);
    } else {
      cb(new Error('Game file must be HTML, JS, JSON, or ZIP'));
    }
  } else if (file.fieldname === 'file' || file.fieldname === 'image' || file.fieldname === 'video') {
    cb(null, true);
  } else {
    cb(new Error('Unknown file field'));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/cover', authMiddleware, upload.single('cover'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const url = `/uploads/covers/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

router.post('/game', authMiddleware, upload.single('game'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const url = `/uploads/games/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

router.post('/file', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const subdir = req.file.mimetype.startsWith('image/') ? 'covers' : 'games';
  const kind = req.file.mimetype.startsWith('image/')
    ? 'image'
    : req.file.mimetype.startsWith('video/')
      ? 'video'
      : 'file';
  const url = `/uploads/${subdir}/${req.file.filename}`;
  res.json({
    url,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    kind
  });
});

module.exports = router;
