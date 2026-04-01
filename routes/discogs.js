const axios = require('axios');

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;
const DISCOGS_HEADERS = {
  'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
  'User-Agent': 'VinylAdvisor/1.0',
  'Content-Type': 'application/json'
};

async function getUsername() {
  const response = await axios.get('https://api.discogs.com/oauth/identity', {
    headers: DISCOGS_HEADERS
  });
  return response.data.username;
}

// POST /search-thumb — zoek thumbnail voor artiest+album
exports.searchThumb = async (req, res) => {
  try {
    const { artist, album } = req.body;
    if (!artist) return res.json({ thumb: null });
    const q = [artist, album].filter(Boolean).join(' ');
    const response = await axios.get('https://api.discogs.com/database/search', {
      headers: DISCOGS_HEADERS,
      params: { q, type: 'release', format: 'vinyl', per_page: 1 }
    });
    const results = response.data.results || [];
    res.json({ thumb: results[0]?.thumb || null });
  } catch (err) {
    res.json({ thumb: null });
  }
};

// POST /check-collection — check of release al in collectie zit
exports.checkCollection = async (req, res) => {
  try {
    const { release_id } = req.body;
    if (!release_id) return res.json({ exists: false });
    const username = await getUsername();
    const response = await axios.get(
      `https://api.discogs.com/users/${username}/collection/releases/${release_id}`,
      { headers: DISCOGS_HEADERS }
    );
    const instances = response.data.releases || [];
    res.json({ exists: instances.length > 0, count: instances.length, instances });
  } catch (err) {
    if (err.response?.status === 404) return res.json({ exists: false });
    res.json({ exists: false });
  }
};

// POST /check-wantlist — check of release al op wantlist staat
exports.checkWantlist = async (req, res) => {
  try {
    const { release_id } = req.body;
    if (!release_id) return res.json({ exists: false });
    const username = await getUsername();
    await axios.get(
      `https://api.discogs.com/users/${username}/wants/${release_id}`,
      { headers: DISCOGS_HEADERS }
    );
    res.json({ exists: true });
  } catch (err) {
    if (err.response?.status === 404) return res.json({ exists: false });
    res.json({ exists: false });
  }
};

// POST /add-collection
exports.addToCollection = async (req, res) => {
  try {
    const { release_id } = req.body;
    if (!release_id) return res.status(400).json({ error: 'release_id vereist' });
    const username = await getUsername();
    const response = await axios.post(
      `https://api.discogs.com/users/${username}/collection/folders/1/releases/${release_id}`,
      {},
      { headers: DISCOGS_HEADERS }
    );
    res.json({
      success: true,
      message: `✅ Toegevoegd aan collectie`,
      instance_id: response.data.instance_id,
      discogs_url: `https://www.discogs.com/user/${username}/collection`
    });
  } catch (err) {
    console.error('Add collection error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
};

// POST /add-wantlist
exports.addToWantlist = async (req, res) => {
  try {
    const { release_id, notes } = req.body;
    if (!release_id) return res.status(400).json({ error: 'release_id vereist' });
    const username = await getUsername();
    const response = await axios.put(
      `https://api.discogs.com/users/${username}/wants/${release_id}`,
      { notes: notes || '' },
      { headers: DISCOGS_HEADERS }
    );
    res.json({
      success: true,
      message: `⭐ Toegevoegd aan wantlist`,
      discogs_url: `https://www.discogs.com/user/${username}/wants`
    });
  } catch (err) {
    console.error('Add wantlist error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
};
