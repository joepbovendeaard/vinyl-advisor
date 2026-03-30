const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();
const TOKEN_PATH = path.join(__dirname, '..', 'google-token.json');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
  );
}

// GET /auth/google — start OAuth flow
router.get('/google', (req, res) => {
  const oAuth2Client = getOAuthClient();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

// GET /auth/google/callback — exchange code voor token
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Geen code ontvangen van Google');

  try {
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    res.send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>✅ Google Drive gekoppeld!</h2>
        <p>Je kunt dit venster sluiten en de app gebruiken.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).send('Google koppeling mislukt: ' + err.message);
  }
});

// GET /auth/status — check of Google gekoppeld is
router.get('/status', (req, res) => {
  res.json({ google_connected: fs.existsSync(TOKEN_PATH) });
});

module.exports = router;
module.exports.getOAuthClient = getOAuthClient;
module.exports.TOKEN_PATH = TOKEN_PATH;
