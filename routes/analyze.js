const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const fs = require('fs');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;
const DISCOGS_HEADERS = {
  'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
  'User-Agent': 'VinylAdvisor/1.0'
};

module.exports = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Minimaal één foto vereist' });
    }

    // Foto's inlezen als base64
    const imageMessages = req.files.map(file => {
      const data = fs.readFileSync(file.path);
      const base64 = data.toString('base64');
      const mediaType = file.mimetype;
      return {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 }
      };
    });

    // Stap 1: Claude herkent de plaat
    const identifyResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          ...imageMessages,
          {
            type: 'text',
            text: `Analyseer deze foto(s) van een vinyl plaat. Geef een JSON object terug met de volgende velden:
{
  "artist": "artiestnaam",
  "title": "albumtitel",
  "label": "platenlabel",
  "catalog_number": "catalogusnummer van het label (bijv. CBS 12345)",
  "year": "jaar (bij benadering als niet zichtbaar)",
  "country": "land van persing",
  "format": "LP/7inch/12inch etc",
  "notes": "bijzonderheden die je ziet (kleur vinyl, promo stempel, handtekening, etc.)"
}
Geef ALLEEN het JSON object terug, geen extra tekst. Als een veld niet te bepalen is, gebruik dan null.`
          }
        ]
      }]
    });

    let recordInfo;
    try {
      let jsonText = identifyResponse.content[0].text.trim();
      // Verwijder markdown code blocks als Claude die toevoegt
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      recordInfo = JSON.parse(jsonText);
    } catch {
      console.error('Claude response:', identifyResponse.content[0].text);
      return res.status(500).json({ error: 'Kon plaat niet herkennen uit de foto\'s. Probeer een scherpere foto van de hoes of het label.' });
    }

    // Stap 2: Discogs zoeken — breed beginnen, alleen artiest + titel
    const searchQuery = [recordInfo.artist, recordInfo.title].filter(Boolean).join(' ');

    const searchResponse = await axios.get('https://api.discogs.com/database/search', {
      headers: DISCOGS_HEADERS,
      params: { q: searchQuery, type: 'release', format: 'vinyl' }
    });

    const results = searchResponse.data.results || [];

    if (results.length === 0) {
      return res.json({
        record: recordInfo,
        discogs_results: [],
        price_advice: {
          verdict: 'Geen Discogs data gevonden',
          advice: 'Plaat niet gevonden op Discogs. Zoek handmatig op discogs.com.'
        }
      });
    }

    // Stap 3: Top 5 meest relevante releases ophalen met marktprijzen
    const topResults = results.slice(0, 5);
    const releaseDetails = await Promise.all(
      topResults.map(async (r) => {
        try {
          const detail = await axios.get(`https://api.discogs.com/releases/${r.id}`, {
            headers: DISCOGS_HEADERS
          });
          const stats = await axios.get(`https://api.discogs.com/marketplace/stats/${r.id}`, {
            headers: DISCOGS_HEADERS
          });
          console.log(`Stats voor ${r.id}:`, JSON.stringify(stats.data));
          const lowestPrice = stats.data.lowest_price?.value ?? null;
          const medianPrice = lowestPrice ? Math.round(lowestPrice * 1.4 * 100) / 100 : null;
          return {
            id: r.id,
            title: r.title,
            year: r.year,
            country: r.country,
            label: r.label ? r.label[0] : null,
            catno: r.catno,
            thumb: r.thumb,
            uri: `https://www.discogs.com${r.uri}`,
            lowest_price: lowestPrice,
            median_price: medianPrice,
            num_for_sale: stats.data.num_for_sale,
            want: detail.data.community?.want,
            have: detail.data.community?.have,
            notes: r.format_quantity > 1 ? `${r.format_quantity} LP set` : null
          };
        } catch (e) {
          console.error(`Stats fout voor ${r.id}:`, e.message);
          return { id: r.id, title: r.title, year: r.year, country: r.country, catno: r.catno, thumb: r.thumb, uri: `https://www.discogs.com${r.uri}` };
        }
      })
    );

    // Stap 4: Beste match kiezen
    const bestMatch = releaseDetails.find(r => r.catno && recordInfo.catalog_number &&
      r.catno.replace(/\s/g, '').toLowerCase() === recordInfo.catalog_number.replace(/\s/g, '').toLowerCase()
    ) || releaseDetails[0];

    // Stap 5: Prijsadvies berekenen
    let priceAdvice = buildPriceAdvice(bestMatch, req.body.asking_price, recordInfo);

    res.json({
      record: recordInfo,
      best_match: bestMatch,
      all_releases: releaseDetails,
      price_advice: priceAdvice
    });

  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

function buildPriceAdvice(release, askingPriceStr, recordInfo) {
  const askingPrice = askingPriceStr ? parseFloat(askingPriceStr) : null;

  if (!release || !release.median_price) {
    return {
      verdict: 'Onbekend',
      max_pay: null,
      advice: 'Geen marktprijzen beschikbaar op Discogs. Controleer handmatig.',
      asking_price: askingPrice
    };
  }

  const median = release.median_price;
  const lowest = release.lowest_price || median * 0.6;

  // Max te betalen: 80% van mediaanprijs (ruimte voor staat/transport)
  const maxPay = Math.round(median * 0.8 * 100) / 100;

  let verdict = '';
  let advice = '';

  if (askingPrice !== null) {
    if (askingPrice <= lowest) {
      verdict = '🟢 Koopje!';
      advice = `Vraagprijs €${askingPrice} ligt onder de laagste marktprijs (€${lowest.toFixed(2)}). Kopen!`;
    } else if (askingPrice <= median * 0.85) {
      verdict = '🟢 Goede prijs';
      advice = `Vraagprijs €${askingPrice} is goed. Mediaan is €${median.toFixed(2)}.`;
    } else if (askingPrice <= median * 1.1) {
      verdict = '🟡 Redelijk';
      advice = `Vraagprijs €${askingPrice} zit rond de marktprijs (€${median.toFixed(2)}). Onderhandel naar max €${maxPay}.`;
    } else {
      verdict = '🔴 Te duur';
      advice = `Vraagprijs €${askingPrice} is boven marktwaarde. Mediaan: €${median.toFixed(2)}. Bied max €${maxPay}.`;
    }
  } else {
    verdict = '💡 Prijsadvies';
    advice = `Mediaan: €${median.toFixed(2)} | Laagste: €${lowest.toFixed(2)} | Betaal max: €${maxPay}`;
  }

  return {
    verdict,
    advice,
    median_price: median,
    lowest_price: lowest,
    max_pay: maxPay,
    asking_price: askingPrice,
    num_for_sale: release.num_for_sale,
    want: release.want,
    have: release.have
  };
}
