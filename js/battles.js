// ============================================================================
// 1v1 (and 1v1v1) Battles — real-time race over Firestore.
// ----------------------------------------------------------------------------
// Data model:
//   battles/{code} : {
//     puzzle, scramble, createdBy, createdAt, state,
//     maxPlayers   // 2 or 3
//   }
//   battles/{code}/players/{uid} : {
//     name, joined, ready, time, penalty, finished
//   }
//
// Firestore security rules required (paste under Rules tab):
//   match /battles/{code} {
//     allow read:  if request.auth != null;
//     allow create: if request.auth != null;
//     allow update: if request.auth != null;
//     match /players/{uid} {
//       allow read: if request.auth != null;
//       allow create, update, delete: if request.auth.uid == uid;
//     }
//   }
// ============================================================================

import { fbSync } from './firebase-sync.js';
import { randomScrambleForEvent } from "https://cdn.cubing.net/js/cubing/scramble";

function requireDb() {
    if (!fbSync.enabled) throw new Error('Cloud sync is not configured. Edit firebase-config.js.');
    const user = fbSync.getUser();
    if (!user) throw new Error('Sign in with Google to use Battles.');
    return { user, db: fbSync.db(), fs: fbSync.fs() };
}

function randCode(n = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no easily-confused chars
    let s = '';
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

export const BATTLE_SCRAMBLE_COUNT = 5;     // Ao5 race

export async function createBattle({ puzzle = '333', maxPlayers = 2 } = {}) {
    const { user, db, fs } = requireDb();
    // Pick 5 fresh scrambles for the Ao5 race
    const scrambles = [];
    for (let i = 0; i < BATTLE_SCRAMBLE_COUNT; i++) {
        scrambles.push((await randomScrambleForEvent(puzzle)).toString());
    }
    // Try a few codes if there's a (very unlikely) collision
    let code = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = randCode();
        const existing = await fs.getDoc(fs.doc(db, 'battles', candidate));
        if (!existing.exists()) { code = candidate; break; }
    }
    if (!code) throw new Error('Could not allocate a battle code. Try again.');

    await fs.setDoc(fs.doc(db, 'battles', code), {
        puzzle, scrambles, maxPlayers,
        createdBy: { uid: user.uid, name: user.displayName || user.email || 'Player' },
        createdAt: fs.serverTimestamp(),
        state: 'waiting'
    });
    await fs.setDoc(fs.doc(db, 'battles', code, 'players', user.uid), {
        name: user.displayName || user.email || 'Player',
        joined: fs.serverTimestamp(),
        ready: false,
        times: [],      // appended one per solve
        finished: false
    });
    return code;
}

export async function joinBattle(code) {
    const { user, db, fs } = requireDb();
    const battleRef = fs.doc(db, 'battles', code);
    const battleSnap = await fs.getDoc(battleRef);
    if (!battleSnap.exists()) throw new Error('Battle not found. Check the code.');
    const battle = battleSnap.data();
    // Already joined? just return
    const myRef = fs.doc(db, 'battles', code, 'players', user.uid);
    const mine = await fs.getDoc(myRef);
    if (mine.exists()) return battle;
    // Capacity check (best-effort; full enforcement belongs in security rules)
    const playersSnap = await fs.getDoc(fs.doc(db, 'battles', code));
    if (battle.state === 'finished') throw new Error('That battle is finished.');
    await fs.setDoc(myRef, {
        name: user.displayName || user.email || 'Player',
        joined: fs.serverTimestamp(),
        ready: false,
        times: [],
        finished: false
    });
    return battle;
}

export function listenBattle(code, onUpdate) {
    const { db, fs } = requireDb();
    let cachedBattle = null;
    let cachedPlayers = {};
    const fire = () => onUpdate({ battle: cachedBattle, players: cachedPlayers });
    const unsubB = fs.onSnapshot(fs.doc(db, 'battles', code), snap => {
        cachedBattle = snap.exists() ? { code, ...snap.data() } : null;
        if (!snap.exists()) { onUpdate({ deleted: true }); return; }
        fire();
    });
    const unsubP = fs.onSnapshot(fs.collection(db, 'battles', code, 'players'), snap => {
        cachedPlayers = {};
        snap.forEach(d => { cachedPlayers[d.id] = d.data(); });
        fire();
    });
    return () => { try { unsubB(); } catch (_) {} try { unsubP(); } catch (_) {} };
}

export async function setReady(code, ready) {
    const { user, db, fs } = requireDb();
    await fs.updateDoc(fs.doc(db, 'battles', code, 'players', user.uid), { ready: !!ready });
}

export async function setBattleState(code, state) {
    const { db, fs } = requireDb();
    await fs.updateDoc(fs.doc(db, 'battles', code), { state });
}

// Append one solve to the player's times array. Marks finished when 5 solves are in.
export async function addBattleSolve(code, timeSeconds, penalty = 'ok') {
    const { user, db, fs } = requireDb();
    const ref = fs.doc(db, 'battles', code, 'players', user.uid);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) throw new Error('Not joined to this battle.');
    const cur = snap.data();
    const newTimes = (cur.times || []).slice();
    newTimes.push({ t: timeSeconds, penalty });
    const finished = newTimes.length >= BATTLE_SCRAMBLE_COUNT;
    await fs.updateDoc(ref, { times: newTimes, finished });
    return { count: newTimes.length, finished };
}

export async function leaveBattle(code) {
    const { user, db, fs } = requireDb();
    try {
        await fs.deleteDoc(fs.doc(db, 'battles', code, 'players', user.uid));
    } catch (_) {}
}

// Effective time in seconds for a single solve (or Infinity for DNF)
export function effSolveTime(s) {
    if (!s || s.penalty === 'dnf') return Infinity;
    return s.penalty === '+2' ? s.t + 2 : s.t;
}
// Ao5: take 5 times, drop best and worst, mean of middle 3. 2+ DNF → DNF.
export function ao5(times) {
    if (!times || times.length < 5) return null;
    const eff = times.slice(0, 5).map(effSolveTime).sort((a, b) => a - b);
    const mid = eff.slice(1, -1);
    if (mid.some(v => v === Infinity)) return Infinity;
    return mid.reduce((a, b) => a + b, 0) / mid.length;
}
// Winner = lowest Ao5 among players who completed all 5 solves.
export function computeWinner(players) {
    const completed = Object.entries(players).filter(([_, p]) => p.finished && p.times && p.times.length >= 5);
    if (!completed.length) return null;
    const ranked = completed.map(([uid, p]) => ({ uid, avg: ao5(p.times) }))
        .sort((a, b) => (a.avg === Infinity ? 1e9 : a.avg) - (b.avg === Infinity ? 1e9 : b.avg));
    if (ranked[0].avg === Infinity) return 'all-dnf';
    if (ranked.length > 1 && ranked[1].avg === ranked[0].avg) return 'tie';
    return ranked[0].uid;
}
