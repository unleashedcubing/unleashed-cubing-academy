const FIREBASE_V = "12.15.0";
const APP_URL       = `https://www.gstatic.com/firebasejs/${FIREBASE_V}/firebase-app.js`;
const AUTH_URL      = `https://www.gstatic.com/firebasejs/${FIREBASE_V}/firebase-auth.js`;
const FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_V}/firebase-firestore.js`;

// Settings keys that live in the profile doc (everything except `sess_*`)
const PROFILE_KEYS = [
    'learned', 'mainChoices', 'inspection', 'focusMode',
    'holdDelay', 'precision', 'groupMode', 'trainCube', 'puzzleCube',
    'profile', 'statsFilter', 'trainGroupMode', 'inputMode', 'planner',
    'learning', 'algMasteryCube', 'sessionRailLayout', 'timerChartPrefs',
    'assistantPrefs', 'socialPrefs', 'appColor', 'widgets', 'zenMode'
];

function configIsRealistic(cfg) {
    return cfg && cfg.apiKey && !cfg.apiKey.startsWith('PASTE_') && cfg.projectId;
}

let enabled = false;
let app, auth, db;
let currentUser = null;
let userChangeListeners = [];
let initialAuthResolved = false;

// Firestore helpers (loaded only if config is usable)
let doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, serverTimestamp, runTransaction;
let GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged;
let firestoreModule = null;

// ---- Pending write batching ----
let pendingProfile = {};
let pendingSessions = {};
let writeTimer = null;
let pendingUid = '';
function clearPendingWrites() {
    clearTimeout(writeTimer);
    writeTimer = null;
    pendingProfile = {};
    pendingSessions = {};
    pendingUid = '';
}
function scheduleWrite() {
    if (!enabled || !currentUser) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrites, 500);
}
async function flushWrites() {
    if (!enabled || !currentUser) return;
    const uid = currentUser.uid;
    if (pendingUid && pendingUid !== uid) {
        clearPendingWrites();
        return;
    }
    const tasks = [];
    if (Object.keys(pendingProfile).length) {
        tasks.push(setDoc(doc(db, 'users', uid, 'data', 'profile'), pendingProfile, { merge: true }));
        pendingProfile = {};
    }
    if (Object.keys(pendingSessions).length) {
        tasks.push(setDoc(doc(db, 'users', uid, 'data', 'sessions'), pendingSessions, { merge: true }));
        pendingSessions = {};
    }
    pendingUid = '';
    try { await Promise.all(tasks); }
    catch (e) { console.error('Firestore write failed:', e); }
}

export function noteLSWrite(key, value) {
    if (!enabled || !currentUser) return;
    const isSessionKey = key === 'sessions_global' || key.startsWith('sess_');
    const isProfileKey = PROFILE_KEYS.includes(key);
    if (!isSessionKey && !isProfileKey) return;
    if (pendingUid && pendingUid !== currentUser.uid) clearPendingWrites();
    pendingUid = currentUser.uid;
    if (key === 'sessions_global') {
        pendingSessions.puzzle_sessions_global = value;
    } else if (key.startsWith('sess_')) {
        pendingSessions['puzzle_' + key.slice(5)] = value;
    } else {
        pendingProfile[key] = value;
    }
    scheduleWrite();
}

async function pullCloud(uid) {
    const [p, s] = await Promise.all([
        getDoc(doc(db, 'users', uid, 'data', 'profile')),
        getDoc(doc(db, 'users', uid, 'data', 'sessions'))
    ]);
    return {
        profile:  p.exists() ? p.data() : null,
        sessions: s.exists() ? s.data() : null
    };
}
async function pushLocalToCloud(uid, includeSessions = true) {
    const profile = {};
    PROFILE_KEYS.forEach(k => {
        const raw = localStorage.getItem('uc_' + k);
        if (raw !== null) {
            try { profile[k] = JSON.parse(raw); } catch (e) {}
        }
    });
    const sessions = {};
    if (includeSessions) {
        const globalSessions = localStorage.getItem('uc_sessions_global');
        if (globalSessions !== null) {
            try { sessions.puzzle_sessions_global = JSON.parse(globalSessions); }
            catch (e) {}
        }
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('uc_sess_')) {
                try { sessions['puzzle_' + k.slice(8)] = JSON.parse(localStorage.getItem(k)); }
                catch (e) {}
            }
        }
    }
    const tasks = [];
    if (Object.keys(profile).length)  tasks.push(setDoc(doc(db, 'users', uid, 'data', 'profile'),  profile,  { merge: true }));
    if (Object.keys(sessions).length) tasks.push(setDoc(doc(db, 'users', uid, 'data', 'sessions'), sessions, { merge: true }));
    await Promise.all(tasks);
}

function readLocalJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function guestSessionStore() {
    const globalStore = readLocalJson('uc_guest_sessions_global');
    if (globalStore && Array.isArray(globalStore.sessions)) return globalStore;

    // Support guest data produced by earlier session-per-puzzle builds.
    const sessions = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('uc_guest_sess_')) continue;
        const puzzle = key.slice('uc_guest_sess_'.length);
        const store = readLocalJson(key);
        if (!store || !Array.isArray(store.sessions)) continue;
        store.sessions.forEach(session => sessions.push({
            ...session,
            id: session.id || `guest-${Date.now()}-${sessions.length}`,
            puzzle: session.puzzle || puzzle,
            solves: Array.isArray(session.solves) ? session.solves : []
        }));
    }
    return sessions.length ? { activeId: sessions[0].id, sessions } : null;
}

function solveFingerprint(solve) {
    return [
        solve && solve.t,
        solve && solve.penalty,
        solve && solve.date,
        solve && solve.scramble,
        solve && solve.note
    ].join('|');
}

function solveIdentity(solve) {
    const date = solve && solve.date;
    return date !== undefined && date !== null && date !== ''
        ? `date:${date}`
        : `legacy:${solveFingerprint(solve)}`;
}

function mergeSessionStores(accountStore, guestStore) {
    const merged = accountStore && Array.isArray(accountStore.sessions)
        ? clone(accountStore)
        : { activeId: '', sessions: [] };
    const byId = new Map(merged.sessions.map(session => [session.id, session]));

    guestStore.sessions.forEach((guestSession, index) => {
        if (!guestSession) return;
        let target = byId.get(guestSession.id);
        if (!target) {
            target = clone(guestSession);
            target.id = target.id || `guest-${Date.now()}-${index}`;
            target.solves = Array.isArray(target.solves) ? target.solves : [];
            merged.sessions.push(target);
            byId.set(target.id, target);
            return;
        }

        target.solves = Array.isArray(target.solves) ? target.solves : [];
        const solveIndexes = new Map(target.solves.map((solve, solveIndex) => [solveIdentity(solve), solveIndex]));
        (guestSession.solves || []).forEach(solve => {
            if (!solve) return;
            const identity = solveIdentity(solve);
            const existingIndex = solveIndexes.get(identity);
            if (existingIndex == null) {
                target.solves.push(clone(solve));
                solveIndexes.set(identity, target.solves.length - 1);
            } else {
                target.solves[existingIndex] = {
                    ...target.solves[existingIndex],
                    ...clone(solve)
                };
            }
        });
    });

    if (!merged.activeId || !byId.has(merged.activeId)) {
        merged.activeId = merged.sessions[0] ? merged.sessions[0].id : '';
    }
    return merged;
}

async function mergeSignedInSessionsIntoCloud(uid, cloud) {
    const localStore = readLocalJson('uc_sessions_global');
    if (!localStore || !Array.isArray(localStore.sessions) || !localStore.sessions.length) return cloud;

    const cloudStore = cloud.sessions && cloud.sessions.puzzle_sessions_global;
    const mergedStore = mergeSessionStores(cloudStore, localStore);
    if (JSON.stringify(mergedStore) !== JSON.stringify(cloudStore || null)) {
        await setDoc(doc(db, 'users', uid, 'data', 'sessions'), {
            puzzle_sessions_global: mergedStore
        }, { merge: true });
    }
    return {
        ...cloud,
        sessions: { ...(cloud.sessions || {}), puzzle_sessions_global: mergedStore }
    };
}

function clearGuestSessionCache() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key === 'uc_guest_sessions_global' || (key && key.startsWith('uc_guest_sess_'))) {
            localStorage.removeItem(key);
        }
    }
}

async function mergeGuestSessionsIntoCloud(uid, cloud) {
    const guestStore = guestSessionStore();
    if (!guestStore || !guestStore.sessions.length) return cloud;

    const accountStore = cloud.sessions && cloud.sessions.puzzle_sessions_global;
    const mergedStore = mergeSessionStores(accountStore, guestStore);
    await setDoc(doc(db, 'users', uid, 'data', 'sessions'), {
        puzzle_sessions_global: mergedStore
    }, { merge: true });
    clearGuestSessionCache();
    return {
        ...cloud,
        sessions: { ...(cloud.sessions || {}), puzzle_sessions_global: mergedStore }
    };
}

function applyCloudToLocal(cloud) {
    if (cloud.profile) {
        Object.entries(cloud.profile).forEach(([k, v]) => {
            localStorage.setItem('uc_' + k, JSON.stringify(v));
        });
    }
    if (cloud.sessions) {
        Object.entries(cloud.sessions).forEach(([k, v]) => {
            if (!k.startsWith('puzzle_')) return;
            const suffix = k.slice(7);
            const localKey = suffix === 'sessions_global'
                ? 'uc_sessions_global'
                : 'uc_sess_' + suffix;
            localStorage.setItem(localKey, JSON.stringify(v));
        });
    }
}

function notify(user) {
    userChangeListeners.forEach(fn => {
        try { fn(user); } catch (e) { console.error(e); }
    });
}

async function initializeFirebase() {
    let firebaseConfig = null;
    try {
        const mod = await import('../firebase-config.js');
        firebaseConfig = mod.firebaseConfig || null;
    } catch (e) {
        console.warn('firebase-config.js missing — cloud sync disabled.', e);
    }

    if (!configIsRealistic(firebaseConfig)) {
        enabled = false;
        initialAuthResolved = true;
        notify(null);
        return false;
    }

    try {
        const [appMod, authMod, fsMod] = await Promise.all([
            import(APP_URL),
            import(AUTH_URL),
            import(FIRESTORE_URL)
        ]);

        app  = appMod.initializeApp(firebaseConfig);
        auth = authMod.getAuth(app);
        db   = fsMod.getFirestore(app);

        ({ doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, serverTimestamp, runTransaction } = fsMod);
        ({ GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = authMod);
        firestoreModule = fsMod;
        enabled = true;

        onAuthStateChanged(auth, async (user) => {
            if (pendingUid && pendingUid !== user?.uid) clearPendingWrites();
            currentUser = user;
            if (user) {
                try {
                    let cloud = await pullCloud(user.uid);
                    cloud = await mergeSignedInSessionsIntoCloud(user.uid, cloud);
                    cloud = await mergeGuestSessionsIntoCloud(user.uid, cloud);
                    if (!cloud.profile) {
                        await pushLocalToCloud(user.uid, false);
                    }
                    applyCloudToLocal(cloud);
                } catch (e) {
                    console.error('Cloud pull failed:', e);
                }
            }
            initialAuthResolved = true;
            notify(user);
        });
        return true;
    } catch (e) {
        console.error('Firebase init failed:', e);
        enabled = false;
        initialAuthResolved = true;
        notify(null);
        return false;
    }
}

const firebaseReady = initializeFirebase();

async function doSignIn() {
    await firebaseReady;
    if (!enabled) {
        alert('Cloud sync is not configured.\n\nEdit firebase-config.js and add your Firebase project credentials, then reload.');
        return;
    }
    try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        return result.user || null;
    } catch (e) {
        console.error('Sign-in failed:', e);
        const alreadyUsed = [
            'auth/account-exists-with-different-credential',
            'auth/credential-already-in-use',
            'auth/email-already-in-use'
        ].includes(e?.code);
        alert(alreadyUsed
            ? 'This Google account is already connected to another UC Academy account.'
            : 'Sign-in failed: ' + (e.message || e.code || e));
        return null;
    }
}
async function doSignOut() {
    await firebaseReady;
    if (!enabled) return;
    try {
        await flushWrites();
        clearPendingWrites();
        await signOut(auth);
    }
    catch (e) { console.error('Sign-out failed:', e); }
}

async function waitForAuth() {
    await firebaseReady;
    if (initialAuthResolved) return currentUser;
    return new Promise(resolve => {
        const listener = user => {
            userChangeListeners = userChangeListeners.filter(item => item !== listener);
            resolve(user);
        };
        userChangeListeners.push(listener);
    });
}

async function claimWcaIdentity(rawWcaId) {
    await firebaseReady;
    const user = currentUser;
    if (!enabled || !user) throw new Error('Sign in with Google before linking WCA.');
    const wcaId = String(rawWcaId || '').trim().toUpperCase();
    if (!/^\d{4}[A-Z]{4}\d{2}$/.test(wcaId)) throw new Error('WCA did not return a valid WCA ID.');

    const linkRef = doc(db, 'accountLinks', `wca_${wcaId}`);
    const accountRef = doc(db, 'users', user.uid, 'data', 'account');
    await runTransaction(db, async transaction => {
        const linkSnap = await transaction.get(linkRef);
        const accountSnap = await transaction.get(accountRef);
        if (linkSnap.exists() && linkSnap.data()?.uid !== user.uid) {
            const error = new Error('This WCA account is already linked to another UC Academy account.');
            error.code = 'wca/account-already-used';
            throw error;
        }
        const currentWcaId = String(accountSnap.data()?.wcaId || '');
        if (currentWcaId && currentWcaId !== wcaId) {
            throw new Error('Unlink your current WCA account before linking a different one.');
        }
        transaction.set(linkRef, {
            kind: 'wca',
            value: wcaId,
            uid: user.uid,
            linkedAtMs: Date.now()
        }, { merge: true });
        transaction.set(accountRef, {
            googleUid: user.uid,
            googleEmail: user.email || '',
            wcaId,
            updatedAtMs: Date.now()
        }, { merge: true });
    });
    return wcaId;
}

async function unlinkWcaIdentity(rawWcaId) {
    await firebaseReady;
    const user = currentUser;
    if (!enabled || !user) throw new Error('Sign in with Google first.');
    const wcaId = String(rawWcaId || '').trim().toUpperCase();
    if (!wcaId) return;
    const linkRef = doc(db, 'accountLinks', `wca_${wcaId}`);
    const accountRef = doc(db, 'users', user.uid, 'data', 'account');
    await runTransaction(db, async transaction => {
        const linkSnap = await transaction.get(linkRef);
        if (linkSnap.exists() && linkSnap.data()?.uid !== user.uid) {
            throw new Error('This WCA link belongs to another account.');
        }
        if (linkSnap.exists()) transaction.delete(linkRef);
        transaction.set(accountRef, { wcaId: null, updatedAtMs: Date.now() }, { merge: true });
    });
}

export const fbSync = {
    get enabled() { return enabled; },
    getUser:       () => currentUser,
    onUserChange:  (fn) => {
        userChangeListeners.push(fn);
        if (initialAuthResolved) setTimeout(() => fn(currentUser), 0);
    },
    signIn:        doSignIn,
    signOut:       doSignOut,
    noteLSWrite,
    isInitialAuthResolved: () => initialAuthResolved,
    ready:         () => firebaseReady,
    waitForAuth,
    claimWcaIdentity,
    unlinkWcaIdentity,
    // Firestore primitives exposed for additional features (battles, etc.)
    db: () => db,
    fs: () => firestoreModule
};
