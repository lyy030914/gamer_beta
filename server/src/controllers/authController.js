const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const db = require('../models/db');

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
}

function userResponse(user) {
  return {
    id: user.id, email: user.email, nickname: user.nickname,
    avatar: user.avatar, githubUsername: user.github_username,
    authProvider: user.auth_provider
  };
}

function register(req, res) {
  const { email, password, nickname } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)').run(email, passwordHash, nickname || email.split('@')[0]);

  res.status(201).json({ token: signToken(result.lastInsertRowid), user: { id: result.lastInsertRowid, email, nickname: nickname || email.split('@')[0] } });
}

function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND auth_provider = ?').get(email, 'email');
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({ token: signToken(user.id), user: userResponse(user) });
}

function getMe(req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: userResponse(user) });
}

// === GitHub OAuth ===

function githubAuth(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'GitHub OAuth not configured' });
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/github/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email,public_repo`;
  res.redirect(url);
}

function httpGet(url, token) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'GamerBeta', Accept: 'application/json' } };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    https.get(url, opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  });
}

function httpPost(url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new URLSearchParams(body).toString();
    const opts = {
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'GamerBeta', Accept: 'application/json' }
    };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function githubCallback(req, res) {
  const { code } = req.query;
  if (!code) return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=no_code`);

  try {
    const tokenRes = await httpPost('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    });

    const accessToken = tokenRes.access_token;
    if (!accessToken) throw new Error('No access_token');

    const [ghUser, emails] = await Promise.all([
      httpGet('https://api.github.com/user', accessToken),
      httpGet('https://api.github.com/user/emails', accessToken)
    ]);

    const primaryEmail = Array.isArray(emails) ? (emails.find(e => e.primary) || emails[0])?.email : ghUser.email;
    if (!primaryEmail) throw new Error('No email from GitHub');

    let user = db.prepare('SELECT * FROM users WHERE github_id = ?').get(ghUser.id.toString());
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(primaryEmail);
    }

    if (user) {
      db.prepare('UPDATE users SET github_id=?, github_username=?, github_token=?, avatar=?, auth_provider=? WHERE id=?').run(
        ghUser.id.toString(), ghUser.login, accessToken, ghUser.avatar_url, 'github', user.id
      );
    } else {
      const result = db.prepare(`
        INSERT INTO users (email, password_hash, nickname, avatar, github_id, github_username, github_token, auth_provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'github')
      `).run(primaryEmail, '', ghUser.login, ghUser.avatar_url, ghUser.id.toString(), ghUser.login, accessToken);
      user = { id: result.lastInsertRowid };
    }

    const token = signToken(user.id);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?token=${token}`);
  } catch (e) {
    console.error('[GitHub OAuth] Error:', e.message);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=github_failed`);
  }
}

// === Push Game to GitHub ===

async function pushToGitHub(req, res) {
  const { id } = req.params;
  const { repo, message } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user?.github_token) return res.status(400).json({ error: 'GitHub account not linked. Login with GitHub first.' });

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.author_id !== req.userId) return res.status(403).json({ error: 'Not your game' });

  try {
    const gameFile = require('fs').readFileSync(require('path').resolve(game.game_url.startsWith('/') ? '.' + game.game_url : game.game_url), 'utf-8');
    const safeTitle = game.title.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const filename = `${safeTitle || 'game'}.html`;
    const commitMsg = message || `Add game: ${game.title}`;
    const repoName = repo || `${user.github_username}.github.io`;

    // Get repo default branch
    let repoInfo;
    try { repoInfo = await httpGet(`https://api.github.com/repos/${user.github_username}/${repoName}`, user.github_token); } catch { repoInfo = null; }

    if (!repoInfo || repoInfo.message === 'Not Found') {
      // Create repo
      await httpPost('https://api.github.com/user/repos', { name: repoName, private: false, auto_init: true }, user.github_token);
      await new Promise(r => setTimeout(r, 2000)); // Wait for repo creation
    }

    const content = Buffer.from(gameFile).toString('base64');
    let sha = null;
    try {
      const existing = await httpGet(`https://api.github.com/repos/${user.github_username}/${repoName}/contents/${filename}`, user.github_token);
      sha = existing.sha;
    } catch {}

    const putBody = { message: commitMsg, content };
    if (sha) putBody.sha = sha;

    const result = await httpPut(`https://api.github.com/repos/${user.github_username}/${repoName}/contents/${filename}`, putBody, user.github_token);

    const htmlUrl = `https://${user.github_username}.github.io/${repoName}/${filename}`;
    res.json({ success: true, url: htmlUrl, repo: `https://github.com/${user.github_username}/${repoName}` });
  } catch (e) {
    console.error('[GitHub Push] Error:', e.message);
    res.status(500).json({ error: 'Failed to push to GitHub: ' + e.message });
  }
}

function httpPut(url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const opts = {
      hostname: u.hostname, path: u.pathname, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'GamerBeta', Authorization: `Bearer ${token}` }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = { register, login, getMe, githubAuth, githubCallback, pushToGitHub };
