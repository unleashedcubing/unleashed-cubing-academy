function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const q = req.query || {};
    const type = q.type === 'average' ? 'average' : 'single';
    const params = new URLSearchParams();
    if (q.country) params.set('region', String(q.country).trim());
    if (q.gender && q.gender !== 'all') params.set('gender', String(q.gender).trim());
    const url = `https://www.worldcubeassociation.org/results/rankings/${encodeURIComponent(String(q.event || '333'))}/${type}${params.toString() ? `?${params.toString()}` : ''}`;

    try {
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'UnleashedCubingAcademy/1.0'
            }
        });
        const html = await resp.text();
        if (!resp.ok) {
            return res.status(resp.status).json({ error: `WCA request failed (${resp.status})`, url });
        }
        return res.status(200).json({ url, html });
    } catch (err) {
        return res.status(502).json({ error: err?.message || String(err), url });
    }
};
