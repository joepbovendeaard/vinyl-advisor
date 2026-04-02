const path = require('path');
const fs = require('fs');

// We gebruiken een simpel JSON-bestand als tussenlaag en genereren xlsx on-demand
const DATA_PATH = path.join('/tmp', 'vinyl_collectie.json');

function loadData() {
  if (!fs.existsSync(DATA_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); }
  catch { return []; }
}

function saveData(rows) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(rows, null, 2));
}

// POST /check-numbers — zoek op artiest+album
exports.checkNumbers = async (req, res) => {
  try {
    const { artist, title } = req.body;
    if (!artist || !title) return res.json({ exists: false });
    const rows = loadData();
    const norm = s => (s || '').toLowerCase().trim();
    const idx = rows.findIndex(r =>
      norm(r.artist).includes(norm(artist)) && norm(r.album).includes(norm(title))
    );
    res.json({ exists: idx >= 0, row: idx >= 0 ? idx + 2 : null });
  } catch (err) {
    res.json({ exists: false });
  }
};

// POST /add-excel
exports.addToNumbers = async (req, res) => {
  try {
    const { record, best_match, price_advice, action } = req.body;
    if (!record) return res.status(400).json({ error: 'record data vereist' });

    const rows = loadData();
    const entry = {
      nr: rows.length + 1,
      artist: record.artist || '',
      album: record.title || '',
      label: record.label || best_match?.label || '',
      catno: record.catalog_number || best_match?.catno || '',
      year: record.year || best_match?.year || '',
      format: record.format || 'LP',
      median: price_advice?.median_price ? `€${price_advice.median_price.toFixed(2)}` : '',
      range: price_advice?.lowest_price && price_advice?.median_price
        ? `€${price_advice.lowest_price.toFixed(2)} - €${price_advice.median_price.toFixed(2)}` : '',
      notes: record.notes || '',
      discogs_id: best_match?.id || '',
      discogs_url: best_match?.uri || '',
      added: new Date().toISOString().split('T')[0]
    };

    const isReplace = action && action.startsWith('replace:');
    if (isReplace) {
      const idx = parseInt(action.split(':')[1]) - 2;
      if (idx >= 0 && idx < rows.length) {
        entry.nr = rows[idx].nr;
        rows[idx] = entry;
      }
    } else {
      rows.push(entry);
    }

    saveData(rows);
    const msg = isReplace ? '📊 Bijgewerkt in collectie' : '📊 Toegevoegd aan collectie';
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /download-collection — genereer en download xlsx
exports.downloadCollection = async (req, res) => {
  try {
    const rows = loadData();
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Nog geen platen in de collectie' });
    }

    // Genereer CSV (altijd beschikbaar, geen extra dependencies)
    const headers = ['Nr', 'Artiest', 'Album', 'Label', 'Cat.Nr', 'Jaar', 'Format', 'Mediaan', 'Prijsrange', 'Opmerkingen', 'Discogs ID', 'Discogs URL', 'Toegevoegd'];
    const csvRows = [headers.join(',')];
    rows.forEach(r => {
      csvRows.push([
        r.nr, `"${r.artist}"`, `"${r.album}"`, `"${r.label}"`, `"${r.catno}"`,
        r.year, r.format, r.median, `"${r.range}"`, `"${r.notes}"`,
        r.discogs_id, r.discogs_url, r.added
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Jazz_Vinyl_Collectie.csv');
    res.send(csvRows.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
