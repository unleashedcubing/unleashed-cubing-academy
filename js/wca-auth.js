// ============================================================================
// WCA OAuth for a static app. The WCA identity is linked to the signed-in
// Firebase account after /api/v0/me verifies who authorized the app.
// ============================================================================

const WCA_AUTH_URL  = 'https://www.worldcubeassociation.org/oauth/authorize';
const WCA_ME_URL    = 'https://www.worldcubeassociation.org/api/v0/me';
const WCA_MY_COMPETITIONS_URL = 'https://www.worldcubeassociation.org/api/v0/competitions/mine';
const WCA_TOKEN_KEY = 'uca_wca_access_token';
const WCA_TOKEN_EXPIRY_KEY = 'uca_wca_access_token_expires_at';
const WCA_TOKEN_IDENTITY_KEY = 'uca_wca_access_token_identity';
const WCA_STATE_KEY = 'uca_wca_oauth_state';

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
    const state = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(WCA_STATE_KEY, state);
    url.searchParams.set('state', state);
    window.location.assign(url.toString());
}

// Returns the verified WCA profile { wca_id, name, avatar }
// or null if we're not on a redirect callback.
// Implicit flow: access_token comes back in the URL fragment.
// /me auto-detects the authorized WCA identity; users never type a WCA ID.
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
        sessionStorage.removeItem(WCA_STATE_KEY);
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
    const expectedState = sessionStorage.getItem(WCA_STATE_KEY);
    if (!expectedState || params.get('state') !== expectedState) {
        sessionStorage.removeItem(WCA_STATE_KEY);
        cleanUrl();
        throw new Error('WCA sign-in could not be verified. Start linking again from Profile.');
    }
    sessionStorage.removeItem(WCA_STATE_KEY);
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
                'WCA could not verify the authorized account from this browser. '
                + 'Check that the OAuth application is public and that its redirect URI exactly matches this site, then retry.'
            );
        }
        if (!meResp.ok) {
            let detail = '';
            try { detail = await meResp.text(); } catch (_) {}
            throw new Error('WCA /me failed: HTTP ' + meResp.status + (detail ? ' — ' + detail.slice(0, 400) : ''));
        }
        const meData = await meResp.json();
        const me = meData.me || meData;
        const wcaId = String(me.wca_id || '').trim().toUpperCase();
        if (!/^\d{4}[A-Z]{4}\d{2}$/.test(wcaId)) {
            throw new Error('This WCA account does not have an assigned WCA ID yet. Link it again after your first official competition results are published.');
        }
        sessionStorage.setItem(WCA_TOKEN_IDENTITY_KEY, wcaId);
        cleanUrl();
        return {
            user_id: me.id || null,
            wca_id: wcaId,
            name:   me.name   || null,
            avatar: (me.avatar && me.avatar.url) || null,
            personal_records: me.personal_records || null
        };
    } catch (e) {
        sessionStorage.removeItem(WCA_TOKEN_KEY);
        sessionStorage.removeItem(WCA_TOKEN_EXPIRY_KEY);
        sessionStorage.removeItem(WCA_TOKEN_IDENTITY_KEY);
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
        sessionStorage.removeItem(WCA_TOKEN_IDENTITY_KEY);
        return '';
    }
    return token;
}

export function clearWcaSession() {
    sessionStorage.removeItem(WCA_TOKEN_KEY);
    sessionStorage.removeItem(WCA_TOKEN_EXPIRY_KEY);
    sessionStorage.removeItem(WCA_TOKEN_IDENTITY_KEY);
    sessionStorage.removeItem(WCA_STATE_KEY);
}

function normalizeEventIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(event => {
        if (typeof event === 'string') return event;
        return event?.id || event?.event_id || event?.eventId || '';
    }).filter(Boolean))];
}

function registeredEventIds(competition) {
    const candidates = [
        competition?.registered_event_ids,
        competition?.registration?.event_ids,
        competition?.registration?.events,
        competition?.user_registration?.event_ids,
        competition?.user_registration?.events,
        competition?.my_registration?.event_ids,
        competition?.my_registration?.events
    ];
    for (const candidate of candidates) {
        const ids = normalizeEventIds(candidate);
        if (ids.length) return ids;
    }
    return [];
}

export async function fetchMyWcaCompetitions(expectedWcaId = '') {
    const token = getWcaAccessToken();
    if (!token) throw new Error('Sign in with WCA again to check your registered competitions.');
    const headers = { Authorization: `Bearer ${token}` };
    const [response, meResponse] = await Promise.all([
        fetch(WCA_MY_COMPETITIONS_URL, { headers }),
        fetch(WCA_ME_URL, { headers })
    ]);
    if (response.status === 401 || meResponse.status === 401) {
        clearWcaSession();
        throw new Error('Your WCA session expired. Sign in with WCA again.');
    }
    if (!response.ok) throw new Error(`WCA competition lookup failed: HTTP ${response.status}`);
    if (!meResponse.ok) throw new Error(`WCA account lookup failed: HTTP ${meResponse.status}`);
    const data = await response.json();
    const meData = await meResponse.json();
    const me = meData.me || meData;
    const userId = me.id;
    if (!userId) throw new Error('WCA did not return the linked account identity. Reconnect WCA and retry.');
    const verifiedWcaId = String(me.wca_id || '').toUpperCase();
    const requiredWcaId = String(expectedWcaId || '').trim().toUpperCase();
    if (requiredWcaId && verifiedWcaId !== requiredWcaId) {
        clearWcaSession();
        throw new Error('This WCA session belongs to a different linked account. Reconnect WCA from Profile.');
    }
    sessionStorage.setItem(WCA_TOKEN_IDENTITY_KEY, verifiedWcaId);

    const future = Array.isArray(data?.future_competitions) ? data.future_competitions : [];
    const statuses = data?.registrations_by_competition || {};
    const registeredFuture = future.filter(competition =>
        Object.prototype.hasOwnProperty.call(statuses, competition.id)
    );

    return Promise.all(registeredFuture.slice(0, 8).map(async competition => {
        const competitionId = encodeURIComponent(competition.id);
        const [detailsResult, registrationsResult] = await Promise.allSettled([
            fetch(`https://www.worldcubeassociation.org/api/v0/competitions/${competitionId}`),
            fetch(`https://www.worldcubeassociation.org/api/v0/competitions/${competitionId}/registrations`)
        ]);

        let offered = normalizeEventIds(competition.event_ids);
        if (detailsResult.status === 'fulfilled' && detailsResult.value.ok) {
            const details = await detailsResult.value.json();
            offered = normalizeEventIds(details.event_ids || competition.event_ids);
        }

        let registered = registeredEventIds(competition);
        if (registrationsResult.status === 'fulfilled' && registrationsResult.value.ok) {
            const payload = await registrationsResult.value.json();
            const registrations = Array.isArray(payload) ? payload : (payload?.registrations || []);
            const mine = registrations.find(registration => String(registration.user_id) === String(userId));
            registered = normalizeEventIds(mine?.event_ids);
        }

        return {
            ...competition,
            registration_status: statuses[competition.id] || competition.registration_status || '',
            offered_event_ids: offered,
            registered_event_ids: registered,
            event_ids: registered
        };
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
