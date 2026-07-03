function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function bestToDisplay(raw, type) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (type === 'single' || type === 'average') return (n / 100).toFixed(2);
    return String(n);
}
function rankValue(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? String(n) : '—';
}
function rankScopeForRegion(region) {
    const raw = String(region || '').trim().toLowerCase();
    if (!raw || raw === 'world') return 'world';
    if (['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania'].includes(raw)) return 'continent';
    return 'country';
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const q = req.query || {};
    const type = q.type === 'average' ? 'average' : 'single';
    const event = String(q.event || '333').trim();
    const region = String(q.region || 'world').trim() || 'world';
    const rankScope = rankScopeForRegion(region);
    const base = 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1';
    const url = `${base}/rank/${encodeURIComponent(region)}/${type}/${encodeURIComponent(event)}.json`;

    try {
        const resp = await fetch(url, { headers: { 'User-Agent': 'UnleashedCubingAcademy/1.0' } });
        const data = await resp.json();
        if (!resp.ok) {
            return res.status(resp.status).json({ error: `WCA request failed (${resp.status})`, url });
        }
        const top = Array.isArray(data?.items) ? data.items.slice(0, 250) : [];
        const personDetails = await Promise.all(top.map(async (item) => {
            const personUrl = `${base}/persons/${encodeURIComponent(item.personId)}.json`;
            try {
                const personResp = await fetch(personUrl, { headers: { 'User-Agent': 'UnleashedCubingAcademy/1.0' } });
                const person = await personResp.json();
                if (!personResp.ok) return null;
                return {
                    id: item.personId,
                    name: person?.name || item.personId,
                    country: person?.country || '',
                    wcaUrl: `https://www.worldcubeassociation.org/persons/${encodeURIComponent(item.personId)}`
                };
            } catch (_) {
                return null;
            }
        }));
        const personMap = new Map(personDetails.filter(Boolean).map(p => [p.id, p]));
        return res.status(200).json({
            source: 'wca-rest-api.robiningelbrecht.be',
            sourceUrl: 'https://wca-rest-api.robiningelbrecht.be/',
            url,
            region,
            rankScope,
            event,
            type,
            items: top.map(item => {
                const person = personMap.get(item.personId);
                const worldRank = rankValue(item?.rank?.world);
                const continentRank = rankValue(item?.rank?.continent);
                const countryRank = rankValue(item?.rank?.country);
                return {
                    rank: rankScope === 'world' ? worldRank : (rankScope === 'continent' ? continentRank : countryRank),
                    worldRank,
                    continentRank,
                    countryRank,
                    result: bestToDisplay(item.best, type),
                    person: person?.name || item.personId,
                    country: person?.country || '',
                    personId: item.personId,
                    wcaUrl: person?.wcaUrl || `https://www.worldcubeassociation.org/persons/${encodeURIComponent(item.personId)}`
                };
            })
        });
    } catch (err) {
        return res.status(502).json({ error: err?.message || String(err), url });
    }
};
