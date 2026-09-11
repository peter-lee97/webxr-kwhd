import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const CAPTURES_DIR = path.join(__dirname, 'captures');
const USERNAME = process.env.DOWNLOADS_USER || 'admin';
const PASSWORD = process.env.DOWNLOADS_PASS || 'changeme';
const MAX_CAPTURE_FILES = parseInt(process.env.CAPTURES_MAX_FILES, 10) || 500;
const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9._-]+\.png$/;

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Captures"');
    return res.status(401).json({ error: 'Authorization required' });
  }
  const [user, pass] = Buffer.from(authHeader.slice(6), 'base64').toString().split(':');
  if (user !== USERNAME || pass !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  next();
};

app.set('trust proxy', 1);

const saveCaptureLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many captures saved from this IP, try again later' }
});

app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'gallery.html'));
});

app.use(express.static('dist'));

function getSafeCapturePath(filename) {
  if (!filename || !SAFE_FILENAME_PATTERN.test(filename)) return null;
  return path.join(CAPTURES_DIR, filename);
}

function enforceCaptureLimit() {
  if (!fs.existsSync(CAPTURES_DIR)) return;
  const files = fs.readdirSync(CAPTURES_DIR)
    .filter(f => SAFE_FILENAME_PATTERN.test(f))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(CAPTURES_DIR, f)).mtimeMs
    }))
    .sort((a, b) => a.mtime - b.mtime);
  const excess = files.length - MAX_CAPTURE_FILES;
  for (let i = 0; i < excess; i += 1) {
    try {
      fs.unlinkSync(path.join(CAPTURES_DIR, files[i].name));
      console.log(`Pruned old capture ${files[i].name} (limit ${MAX_CAPTURE_FILES})`);
    } catch (err) {
      console.error(`Failed to prune old capture ${files[i].name}:`, err.message);
    }
  }
}

function createCaptureFilename() {
  const base = `capture-${Date.now()}`;
  let filename = `${base}.png`;
  let counter = 1;
  while (fs.existsSync(path.join(CAPTURES_DIR, filename))) {
    filename = `${base}-${counter}.png`;
    counter += 1;
  }
  return filename;
}

app.post('/save-capture', saveCaptureLimiter, (req, res) => {
  const { dataUrl } = req.body;
  if (!dataUrl) {
    return res.status(400).json({ error: 'Missing dataUrl' });
  }
  const matches = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!matches) {
    return res.status(400).json({ error: 'Invalid dataUrl format' });
  }
  try {
    if (!fs.existsSync(CAPTURES_DIR)) fs.mkdirSync(CAPTURES_DIR, { recursive: true });
    const filename = createCaptureFilename();
    fs.writeFileSync(path.join(CAPTURES_DIR, filename), Buffer.from(matches[1], 'base64'));
    enforceCaptureLimit();
    res.json({ file: filename });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save capture' });
  }
});

app.get('/downloads', auth, (req, res) => {
  try {
    if (!fs.existsSync(CAPTURES_DIR)) {
      return res.json({ files: [] });
    }
    const files = fs.readdirSync(CAPTURES_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => ({
        name: f,
        url: `/downloads/${f}`,
        size: fs.statSync(path.join(CAPTURES_DIR, f)).size,
        modified: fs.statSync(path.join(CAPTURES_DIR, f)).mtime
      }));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

app.get('/gallery/files', (req, res) => {
  try {
    if (!fs.existsSync(CAPTURES_DIR)) {
      return res.json({ files: [] });
    }
    const files = fs.readdirSync(CAPTURES_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => {
        const stats = fs.statSync(path.join(CAPTURES_DIR, f));
        return {
          name: f,
          url: `/gallery/files/${f}`,
          downloadUrl: `/gallery/download/${f}`,
          size: stats.size,
          modified: stats.mtime
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

app.get('/gallery/files/:filename', (req, res) => {
  const filePath = getSafeCapturePath(req.params.filename);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

app.get('/gallery/download/:filename', (req, res) => {
  const filePath = getSafeCapturePath(req.params.filename);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath, req.params.filename);
});

app.get('/downloads/:filename', auth, (req, res) => {
  const filePath = getSafeCapturePath(req.params.filename);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

app.delete('/downloads/:filename', auth, (req, res) => {
  const filePath = getSafeCapturePath(req.params.filename);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  try {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Captures directory: ${CAPTURES_DIR}`);
  if (PASSWORD === 'changeme') {
    console.warn('WARNING: DOWNLOADS_PASS is unset or still "changeme". Set a real password in .env before exposing /downloads publicly.');
  }
});