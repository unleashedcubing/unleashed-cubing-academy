function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function getJson(url) {
    const resp = await fetch(url, { headers: { 'User-Agent': 'UnleashedCubingAcademy/1.0' } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return data;
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const base = 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1';

    try {
        const [countriesData, continentsData, eventsData] = await Promise.all([
            getJson(`${base}/countries.json`),
            getJson(`${base}/continents.json`),
            getJson(`${base}/events.json`)
        ]);

        const countries = Array.isArray(countriesData?.items) ? countriesData.items : [];
        const continents = Array.isArray(continentsData?.items) ? continentsData.items : [];
        const events = Array.isArray(eventsData?.items) ? eventsData.items : [];

        return res.status(200).json({
            source: 'wca-rest-api.robiningelbrecht.be',
            sourceUrl: 'https://wca-rest-api.robiningelbrecht.be/',
            countries: countries.map(item => ({
                id: String(item?.id || item?.iso2 || item?.iso2Code || '').trim(),
                name: String(item?.name || '').trim(),
                iso2: String(item?.iso2 || item?.iso2Code || item?.id || '').trim()
            })).filter(item => item.id && item.name),
            continents: continents.map(item => ({
                id: String(item?.id || '').trim(),
                name: String(item?.name || '').trim()
            })).filter(item => item.id && item.name),
            events: events.map(item => ({
                id: String(item?.id || '').trim(),
                name: String(item?.name || '').trim()
            })).filter(item => item.id && item.name)
        });
    } catch (err) {
        return res.status(502).json({ error: err?.message || String(err) });
    }
};
