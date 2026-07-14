const FIREBASE_V = "11.0.2";
const APP_URL       = `https://www.gstatic.com/firebasejs/${FIREBASE_V}/firebase-app.js`;
const AUTH_URL      = `https://www.gstatic.com/firebasejs/${FIREBASE_V}/firebase-auth.js`;
const FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_V}/firebase-firestore.js`;

// Settings keys that live in the profile doc (everything except `sess_*`)
const PROFILE_KEYS = [
    'learned', 'mainChoices', 'inspection', 'focusMode',
    'holdDelay', 'precision', 'groupMode', 'trainCube', 'puzzleCube',
    'profile', 'statsFilter', 'trainGroupMode', 'inputMode', 'planner'
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
let doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, serverTimestamp;
let GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged;
let firestoreModule = null;

// ---- Pending write batching ----
let pendingProfile = {};
let pendingSessions = {};
let writeTimer = null;
function scheduleWrite() {
    if (!enabled || !currentUser) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrites, 500);
}
async function flushWrites() {
    if (!enabled || !currentUser) return;
    const uid = currentUser.uid;
    const tasks = [];
    if (Object.keys(pendingProfile).length) {
        tasks.push(setDoc(doc(db, 'users', uid, 'data', 'profile'), pendingProfile, { merge: true }));
        pendingProfile = {};
    }
    if (Object.keys(pendingSessions).length) {
        tasks.push(setDoc(doc(db, 'users', uid, 'data', 'sessions'), pendingSessions, { merge: true }));
        pendingSessions = {};
    }
    try { await Promise.all(tasks); }
    catch (e) { console.error('Firestore write failed:', e); }
}

export function noteLSWrite(key, value) {
    if (!enabled || !currentUser) return;
    if (key.startsWith('sess_')) {
        pendingSessions['puzzle_' + key.slice(5)] = value;
    } else if (PROFILE_KEYS.includes(key)) {
        pendingProfile[key] = value;
    }
    // Unknown keys are kept local-only.
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
async function pushLocalToCloud(uid) {
    const profile = {};
    PROFILE_KEYS.forEach(k => {
        const raw = localStorage.getItem('uc_' + k);
        if (raw !== null) {
            try { profile[k] = JSON.parse(raw); } catch (e) {}
        }
    });
    const sessions = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('uc_sess_')) {
            try { sessions['puzzle_' + k.slice(8)] = JSON.parse(localStorage.getItem(k)); }
            catch (e) {}
        }
    }
    const tasks = [];
    if (Object.keys(profile).length)  tasks.push(setDoc(doc(db, 'users', uid, 'data', 'profile'),  profile,  { merge: true }));
    if (Object.keys(sessions).length) tasks.push(setDoc(doc(db, 'users', uid, 'data', 'sessions'), sessions, { merge: true }));
    await Promise.all(tasks);
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
            localStorage.setItem('uc_sess_' + k.slice(7), JSON.stringify(v));
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

        ({ doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, serverTimestamp } = fsMod);
        ({ GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = authMod);
        firestoreModule = fsMod;
        enabled = true;

        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user) {
                try {
                    const cloud = await pullCloud(user.uid);
                    if (!cloud.profile && !cloud.sessions) {
                        await pushLocalToCloud(user.uid);
                    } else {
                        applyCloudToLocal(cloud);
                    }
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
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
        console.error('Sign-in failed:', e);
        alert('Sign-in failed: ' + (e.message || e.code || e));
    }
}
async function doSignOut() {
    await firebaseReady;
    if (!enabled) return;
    try { await signOut(auth); }
    catch (e) { console.error('Sign-out failed:', e); }
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
    // Firestore primitives exposed for additional features (battles, etc.)
    db: () => db,
    fs: () => firestoreModule
};
