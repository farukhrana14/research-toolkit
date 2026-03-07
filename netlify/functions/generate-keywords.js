const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { topic, problemStatement, objectives, independentVariables, dependentVariable, controlVariables } = body;

  const prompt = `You are an academic research assistant specialising in literature reviews.

Generate 20 specific academic search keyword combinations for the following study:
- Research Topic: ${topic}
- Problem Statement: ${problemStatement}
- Independent Variables: ${independentVariables}
- Dependent Variable: ${dependentVariable}
- Control Variables: ${controlVariables || 'none'}

Rules:
1. Each item is a ready-to-paste database search string (Google Scholar / Scopus format)
2. Use AND, OR Boolean operators
3. Include synonyms and related academic terms
4. Group by variable relationship
5. Return ONLY a JSON array of strings — no explanation, no markdown, no labels

Example format:
["string 1","string 2","string 3"]`;

  const payload = JSON.stringify({
    contents: [{
      parts: [{ text: prompt }]
    }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  return new Promise((resolve) => {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const gemini = JSON.parse(data);
          const raw = gemini?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          // Strip markdown code fences if Gemini wraps output
          const cleaned = raw.replace(/```json|```/g, '').trim();
          const keywords = JSON.parse(cleaned);
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords })
          });
        } catch(e) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to parse Gemini response', raw: data })
          });
        }
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: e.message })
      });
    });

    req.write(payload);
    req.end();
  });
};
