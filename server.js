import express from 'express';
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

app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.use(express.static('dist'));

app.get('/downloads', auth, (req, res) => {
  try {
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

app.get('/downloads/:filename', auth, (req, res) => {
  const filePath = path.join(CAPTURES_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
});

app.delete('/downloads/:filename', auth, (req, res) => {
  const filePath = path.join(CAPTURES_DIR, req.params.filename);
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
});