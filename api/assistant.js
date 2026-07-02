function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function readKeys() {
    const raw = process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || '';
    return raw.split(',').map(v => v.trim()).filter(Boolean);
}

async function readJson(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const keys = readKeys();
    if (!keys.length) {
        return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY or OPENROUTER_API_KEYS on the server.' });
    }

    const body = await readJson(req).catch(() => null);
    if (!body) return res.status(400).json({ error: 'Invalid JSON body.' });

    const models = Array.isArray(body.fallbackModels) && body.fallbackModels.length
        ? body.fallbackModels
        : [body.model].filter(Boolean);
    const messages = [
        { role: 'system', content: String(body.systemPrompt || '') },
        { role: 'user', content: `User context:\n${JSON.stringify(body.context || {}, null, 2)}\n\nUser request:\n${String(body.prompt || '')}` }
    ];

    let lastError = 'No models attempted.';
    for (const key of keys) {
        for (const model of models) {
            try {
                const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost',
                        'X-Title': process.env.OPENROUTER_APP_NAME || 'Unleashed Cubing Academy'
                    },
                    body: JSON.stringify({ model, messages })
                });
                const data = await resp.json().catch(() => ({}));
                if (resp.ok) {
                    return res.status(200).json({
                        reply: data?.choices?.[0]?.message?.content?.trim() || 'No response returned.',
                        modelUsed: model
                    });
                }
                lastError = data?.error?.message || `OpenRouter request failed (${resp.status})`;
                if (![429, 502, 503, 504].includes(resp.status)) {
                    return res.status(resp.status).json({ error: lastError, modelTried: model });
                }
            } catch (err) {
                lastError = err?.message || String(err);
            }
        }
    }

    return res.status(502).json({ error: lastError });
};
