const https = require('https');

exports.handler = async function(event) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'No API key' }) };

  let body;
  try { body = JSON.parse(event.body); } catch(e) { return { statusCode: 400, body: '{}' }; }

  const prompt = `Return ONLY a valid JSON array of 10 academic keyword search strings for: ${body.topic || 'consumer behaviour'}. No markdown. No explanation. Pure JSON array only.`;

  const payload = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  return new Promise((resolve) => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('RAW:', data.slice(0, 800));
        try {
          const g = JSON.parse(data);
          if (g.error) return resolve({ statusCode: 500, body: JSON.stringify({ error: g.error.message }) });
          const raw = g?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          console.log('TEXT:', raw.slice(0, 400));
          const cleaned = raw.replace(/```json|```/gi, '').trim();
          const match = cleaned.match(/\[[\s\S]*\]/);
          const keywords = JSON.parse(match ? match[0] : cleaned);
          resolve({ statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords }) });
        } catch(e) {
          console.log('PARSE ERROR:', e.message);
          resolve({ statusCode: 500, body: JSON.stringify({ error: 'parse failed' }) });
        }
      });
    });
    req.on('error', e => { console.log('REQ ERROR:', e.message); resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) }); });
    req.write(payload);
    req.end();
  });
};
