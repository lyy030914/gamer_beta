require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');
const uploadRoutes = require('./routes/upload');
const assetRoutes = require('./routes/assets');
const favoritesRoutes = require('./routes/favorites');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/favorites', favoritesRoutes);

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Gamer Beta</title></head><body style="background:#0f172a;color:#f1f5f9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center"><div><h1>Gamer Beta API v1.0</h1><p>Frontend at <a href="http://localhost:5173" style="color:#6366f1">localhost:5173</a></p></div></body></html>`);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 50MB)' });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Gamer Beta server running at http://localhost:${PORT}`);
});
