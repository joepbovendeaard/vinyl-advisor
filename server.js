require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const analyzeRoute = require('./routes/analyze');
const discogsRoute = require('./routes/discogs');
const authRoute = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer: opslaan in /tmp/uploads (cloud-compatible), max 2 bestanden, max 10MB
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join('/tmp', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Alleen afbeeldingen toegestaan'));
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PIN check
app.post('/check-pin', (req, res) => {
  const { pin } = req.body;
  if (pin === process.env.APP_PIN) res.json({ ok: true });
  else res.status(401).json({ ok: false });
});

// Routes
app.use('/auth', authRoute);
app.post('/analyze', (req, res, next) => {
  upload.array('photos', 2)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, analyzeRoute);
app.post('/check-collection', discogsRoute.checkCollection);
app.post('/check-wantlist', discogsRoute.checkWantlist);
app.post('/add-collection', discogsRoute.addToCollection);
app.post('/add-wantlist', discogsRoute.addToWantlist);

// Numbers/Excel: tijdelijk uitgeschakeld (werkt alleen lokaal via AppleScript)
app.post('/check-numbers', (req, res) => res.json({ exists: false, offline: true }));
app.post('/add-excel', (req, res) => res.json({ success: false, message: '📊 Numbers-integratie is offline in cloud-modus. Gebruik Discogs collectie.' }));

// Opruimen uploads na 1 uur
setInterval(() => {
  const dir = path.join('/tmp', 'uploads');
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs > 3600000) fs.unlinkSync(filePath);
  });
}, 3600000);

app.listen(PORT, () => {
  console.log(`\n🎵 Vinyl Advisor draait op poort ${PORT}`);
  console.log(`🌍 Cloud mode — Numbers-integratie uitgeschakeld\n`);
});
