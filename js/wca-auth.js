// ============================================================================
// WCA OAuth — Authorization Code flow with PKCE (no client secret needed).
// ----------------------------------------------------------------------------
// Two entry points:
//   • startWcaLogin()      — kicks off the OAuth redirect.
//   • handleWcaCallback()  — called on page load; if we're returning from WCA
//                            with a ?code= param, exchanges it for a token,
//                            fetches /api/v0/me, returns the user's verified
//                            WCA profile, and cleans up the URL.
//
// Implements RFC 7636 PKCE so the flow is safe in a static SPA — no client
// secret, no backend required.
// ============================================================================

const WCA_AUTH_URL  = 'https://www.worldcubeassociation.org/oauth/authorize';
const WCA_TOKEN_URL = 'https://www.worldcubeassociation.org/oauth/token';
const WCA_ME_URL    = 'https://www.worldcubeassociation.org/api/v0/me';
const WCA_MY_COMPETITIONS_URL = 'https://www.worldcubeassociation.org/api/v0/competitions/mine';
const WCA_TOKEN_KEY = 'uca_wca_access_token';
const WCA_TOKEN_EXPIRY_KEY = 'uca_wca_access_token_expires_at';

let wcaConfig = null;
try {
    const mod = await import('../wca-config.js');
    wcaConfig = mod.wcaConfig || null;
} catch (e) {
    console.warn('wca-config.js missing — WCA verification disabled.', e);
}

function configReady() {
    return wcaConfig && wcaConfig.client_id && !wcaConfig.client_id.startsWith('PASTE_');
}
export const wcaEnabled = configReady();

function randomVerifier() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return base64url(arr);
}
async function challengeFor(verifier) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64url(new Uint8Array(hash));
}
function base64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function startWcaLogin() {
    if (!configReady()) {
        alert('WCA verification is not configured.\n\nOpen wca-config.js, follow the setup steps in the comments, paste your client_id, and reload.');
        return;
    }
    // Implicit flow: access_token returns in the URL fragment.
    // No token-exchange POST means no CORS issue for confidential apps.
    const url = new URL(WCA_AUTH_URL);
    url.searchParams.set('client_id',     wcaConfig.client_id);
    url.searchParams.set('redirect_uri',  wcaConfig.redirect_uri);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('scope',         'public');
    window.location.assign(url.toString());
}

// Returns the verified WCA profile { wca_id, name, avatar }
// or null if we're not on a redirect callback.
// Implicit flow: access_token comes back in the URL fragment.
// We try /me first (best — auto-detects who they are). If CORS blocks it,
// we throw a clear error and let the UI fall back to manual WCA-ID entry.
export async function handleWcaCallback() {
    if (!configReady()) return null;
    const hash = window.location.hash || '';

    function cleanUrl() {
        history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }

    // Check for OAuth error sent back in the fragment OR query string
    const allParams = new URLSearchParams((hash.replace(/^#/, '') || '') + '&' + (window.location.search.replace(/^\?/, '') || ''));
    const errCode = allParams.get('error');
    if (errCode) {
        cleanUrl();
        throw new Error('WCA OAuth error: ' + errCode + (allParams.get('error_description') ? ' — ' + allParams.get('error_description') : ''));
    }

    if (!hash.includes('access_token=')) return null;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const token = params.get('access_token');
    if (!token) {
        cleanUrl();
        return null;
    }
    const expiresIn = Number(params.get('expires_in') || 7200);
    sessionStorage.setItem(WCA_TOKEN_KEY, token);
    sessionStorage.setItem(WCA_TOKEN_EXPIRY_KEY, String(Date.now() + Math.max(60, expiresIn) * 1000));
    console.info('[WCA] Got access_token from fragment, fetching /me');
    try {
        let meResp;
        try {
            meResp = await fetch(WCA_ME_URL, { headers: { Authorization: 'Bearer ' + token } });
        } catch (netErr) {
            throw new Error(
                'WCA /me request was blocked by CORS. '
                + 'This usually means your WCA OAuth application is configured "Confidential" — '
                + 'browser-origin requests are denied. '
                + 'As a workaround, enter your WCA ID manually in Edit Profile — your PRs will load from the public WCA API.'
            );
        }
        if (!meResp.ok) {
            let detail = '';
            try { detail = await meResp.text(); } catch (_) {}
            throw new Error('WCA /me failed: HTTP ' + meResp.status + (detail ? ' — ' + detail.slice(0, 400) : ''));
        }
        const meData = await meResp.json();
        const me = meData.me || meData;
        cleanUrl();
        return {
            wca_id: me.wca_id || null,
            name:   me.name   || null,
            avatar: (me.avatar && me.avatar.url) || null,
            personal_records: me.personal_records || null
        };
    } catch (e) {
        sessionStorage.removeItem(WCA_TOKEN_KEY);
        sessionStorage.removeItem(WCA_TOKEN_EXPIRY_KEY);
        cleanUrl();
        throw e;
    }
}

export function getWcaAccessToken() {
    const token = sessionStorage.getItem(WCA_TOKEN_KEY) || '';
    const expiresAt = Number(sessionStorage.getItem(WCA_TOKEN_EXPIRY_KEY) || 0);
    if (!token || (expiresAt && Date.now() >= expiresAt)) {
        sessionStorage.removeItem(WCA_TOKEN_KEY);
        sessionStorage.removeItem(WCA_TOKEN_EXPIRY_KEY);
        return '';
    }
    return token;
}

export async function fetchMyWcaCompetitions() {
    const token = getWcaAccessToken();
    if (!token) throw new Error('Sign in with WCA again to check your registered competitions.');
    const response = await fetch(WCA_MY_COMPETITIONS_URL, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401) {
        sessionStorage.removeItem(WCA_TOKEN_KEY);
        sessionStorage.removeItem(WCA_TOKEN_EXPIRY_KEY);
        throw new Error('Your WCA session expired. Sign in with WCA again.');
    }
    if (!response.ok) throw new Error(`WCA competition lookup failed: HTTP ${response.status}`);
    const data = await response.json();
    const future = Array.isArray(data?.future_competitions) ? data.future_competitions : [];
    return Promise.all(future.slice(0, 8).map(async competition => {
        try {
            const detailsResponse = await fetch(`https://www.worldcubeassociation.org/api/v0/competitions/${encodeURIComponent(competition.id)}`);
            if (!detailsResponse.ok) return competition;
            const details = await detailsResponse.json();
            return { ...competition, event_ids: details.event_ids || competition.event_ids || [] };
        } catch (_) {
            return competition;
        }
    }));
}

// Fallback: fetch a user's PUBLIC profile + PRs by WCA ID (no auth required).
// This endpoint has CORS enabled for all origins.
export async function fetchPublicWcaProfile(wcaId) {
    const id = String(wcaId || '').trim();
    if (!/^\d{4}[A-Z]{4}\d{2}$/.test(id)) throw new Error('Invalid WCA ID format');
    const resp = await fetch(`https://www.worldcubeassociation.org/api/v0/persons/${id}`);
    if (!resp.ok) throw new Error('WCA person lookup failed: HTTP ' + resp.status);
    const data = await resp.json();
    const person = data.person || data;
    const rankSingle = (data.personal_records || data.ranks_single || []);
    const rankAverage = (data.ranks_average || []);
    // Normalise to the same shape as /me: { eventId: { single, average } } in seconds
    const pr = {};
    for (const r of rankSingle)  { (pr[r.eventId] = pr[r.eventId] || {}).single  = (r.best || 0) / 100; }
    for (const r of rankAverage) { (pr[r.eventId] = pr[r.eventId] || {}).average = (r.best || 0) / 100; }
    return {
        wca_id: person.wca_id || id,
        name:   person.name   || null,
        avatar: (person.avatar && person.avatar.url) || null,
        personal_records: pr
    };
}
