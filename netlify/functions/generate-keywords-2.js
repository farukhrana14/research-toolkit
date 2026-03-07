const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GEMINI_API_KEY not set in environment' })
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { topic, problemStatement, objectives, independentVariables, dependentVariable, controlVariables } = body;

  const prompt = `You are an academic research assistant specialising in literature reviews.

Generate exactly 20 academic search keyword combinations for this study:
- Research Topic: ${topic || 'not specified'}
- Independent Variables: ${independentVariables || 'not specified'}
- Dependent Variable: ${dependentVariable || 'not specified'}
- Control Variables: ${controlVariables || 'none'}

Rules:
1. Each item must be a ready-to-paste Boolean search string for Google Scholar or Scopus
2. Use AND and OR operators
3. Include synonyms and related academic terms
4. Return ONLY a raw JSON array of 20 strings
5. No markdown, no code fences, no explanation — pure JSON array only

Output example:
["term1 AND term2","term3 OR term4"]`;

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const gemini = JSON.parse(data);

          // Surface Gemini API errors cleanly
          if (gemini.error) {
            return resolve({
              statusCode: 500,
              body: JSON.stringify({ error: gemini.error.message, detail: gemini.error })
            });
          }

          const raw = gemini?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleaned = raw.replace(/```json|```/gi, '').trim();

          let keywords;
          try {
            keywords = JSON.parse(cleaned);
          } catch(parseErr) {
            // Gemini returned prose — extract array substring if present
            const match = cleaned.match(/\[[\s\S]*\]/);
            if (match) {
              keywords = JSON.parse(match[0]);
            } else {
              return resolve({
                statusCode: 500,
                body: JSON.stringify({ error: 'Gemini response not parseable', raw: cleaned.slice(0, 500) })
              });
            }
          }

          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords })
          });

        } catch(e) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Outer parse failed', raw: data.slice(0, 500) })
          });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: 'HTTPS request error: ' + e.message }) });
    });

    req.write(payload);
    req.end();
  });
};
