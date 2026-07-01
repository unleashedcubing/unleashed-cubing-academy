// ============================================================================
// Battles — Firestore-backed real-time races.
// Supports Ao5, sets, and infinite battles with pre-generated scrambles.
// ============================================================================

import { fbSync } from './firebase-sync.js';
import { randomScrambleForEvent } from "https://cdn.cubing.net/v0/js/cubing/scramble";

function requireDb() {
    if (!fbSync.enabled) throw new Error('Cloud sync is not configured. Edit firebase-config.js.');
    const user = fbSync.getUser();
    if (!user) throw new Error('Sign in with Google to use Battles.');
    return { user, db: fbSync.db(), fs: fbSync.fs() };
}

function randCode(n = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

export const BATTLE_SCRAMBLE_COUNT = 5;
const PREGEN_SCRAMBLES = {
    ao5: 5,
    sets: 25,
    infinite: 50
};

function modeConfig(mode = 'ao5', target = 3) {
    const cleanMode = ['ao5', 'sets', 'infinite'].includes(mode) ? mode : 'ao5';
    const setTarget = cleanMode === 'sets' ? Math.max(1, parseInt(target, 10) || 3) : null;
    return {
        mode: cleanMode,
        target: setTarget,
        solveCap: cleanMode === 'ao5' ? 5 : null,
        scrambleCount: PREGEN_SCRAMBLES[cleanMode] || 5
    };
}

async function buildScrambles(puzzle, count) {
    const scrambles = [];
    for (let i = 0; i < count; i++) {
        scrambles.push((await randomScrambleForEvent(puzzle)).toString());
    }
    return scrambles;
}

export async function createBattle({ puzzle = '333', maxPlayers = 2, mode = 'ao5', target = 3 } = {}) {
    const { user, db, fs } = requireDb();
    const cfg = modeConfig(mode, target);
    const scrambles = await buildScrambles(puzzle, cfg.scrambleCount);

    let code = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = randCode();
        const existing = await fs.getDoc(fs.doc(db, 'battles', candidate));
        if (!existing.exists()) { code = candidate; break; }
    }
    if (!code) throw new Error('Could not allocate a battle code. Try again.');

    await fs.setDoc(fs.doc(db, 'battles', code), {
        puzzle,
        scrambles,
        maxPlayers,
        createdBy: { uid: user.uid, name: user.displayName || user.email || 'Player' },
        createdAt: fs.serverTimestamp(),
        state: 'waiting',
        mode: cfg.mode,
        target: cfg.target,
        solveCap: cfg.solveCap,
        countdownEndsAt: null,
        endedBy: null
    });
    await fs.setDoc(fs.doc(db, 'battles', code, 'players', user.uid), {
        name: user.displayName || user.email || 'Player',
        joined: fs.serverTimestamp(),
        ready: false,
        times: [],
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
    const myRef = fs.doc(db, 'battles', code, 'players', user.uid);
    const mine = await fs.getDoc(myRef);
    if (mine.exists()) return battle;
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

export async function setBattleState(code, state, extra = {}) {
    const { db, fs } = requireDb();
    await fs.updateDoc(fs.doc(db, 'battles', code), { state, ...extra });
}

export async function endBattle(code) {
    const { user, db, fs } = requireDb();
    await fs.updateDoc(fs.doc(db, 'battles', code), {
        state: 'finished',
        endedBy: { uid: user.uid, name: user.displayName || user.email || 'Player' },
        endedAt: Date.now()
    });
}

export async function addBattleSolve(code, timeSeconds, penalty = 'ok') {
    const { user, db, fs } = requireDb();
    const battleSnap = await fs.getDoc(fs.doc(db, 'battles', code));
    if (!battleSnap.exists()) throw new Error('Battle not found.');
    const battle = battleSnap.data();
    const ref = fs.doc(db, 'battles', code, 'players', user.uid);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) throw new Error('Not joined to this battle.');
    const cur = snap.data();
    const newTimes = (cur.times || []).slice();
    newTimes.push({ t: timeSeconds, penalty, at: Date.now() });
    const finished = !!(battle.solveCap && newTimes.length >= battle.solveCap);
    await fs.updateDoc(ref, { times: newTimes, finished });
    return { count: newTimes.length, finished };
}

export async function leaveBattle(code) {
    const { user, db, fs } = requireDb();
    try {
        await fs.deleteDoc(fs.doc(db, 'battles', code, 'players', user.uid));
    } catch (_) {}
}

export function effSolveTime(s) {
    if (!s || s.penalty === 'dnf') return Infinity;
    return s.penalty === '+2' ? s.t + 2 : s.t;
}

export function ao5(times) {
    if (!times || times.length < 5) return null;
    const eff = times.slice(0, 5).map(effSolveTime).sort((a, b) => a - b);
    const mid = eff.slice(1, -1);
    if (mid.some(v => v === Infinity)) return Infinity;
    return mid.reduce((a, b) => a + b, 0) / mid.length;
}

function bestRollingAo5(times) {
    if (!times || times.length < 5) return null;
    let best = Infinity;
    for (let i = 0; i + 5 <= times.length; i++) {
        const v = ao5(times.slice(i, i + 5));
        if (v != null && v < best) best = v;
    }
    return best === Infinity ? Infinity : best;
}

export function computeSetScores(players) {
    const ids = Object.keys(players || {});
    const scores = {};
    ids.forEach(uid => { scores[uid] = 0; });
    let resolvedRounds = 0;
    if (!ids.length) return { scores, resolvedRounds };

    const maxRounds = Math.max(...ids.map(uid => ((players[uid] || {}).times || []).length), 0);
    for (let round = 0; round < maxRounds; round++) {
        const entries = ids.map(uid => ({ uid, solve: (players[uid].times || [])[round] }));
        if (entries.some(e => !e.solve)) break;
        const ranked = entries
            .map(e => ({ uid: e.uid, time: effSolveTime(e.solve) }))
            .sort((a, b) => a.time - b.time);
        resolvedRounds++;
        if (!ranked.length || ranked[0].time === Infinity) continue;
        if (ranked[1] && ranked[1].time === ranked[0].time) continue;
        scores[ranked[0].uid] = (scores[ranked[0].uid] || 0) + 1;
    }
    return { scores, resolvedRounds };
}

function computeInfiniteLeader(players) {
    const ranked = Object.entries(players || {}).map(([uid, p]) => {
        const times = p.times || [];
        const bestAo = bestRollingAo5(times);
        const bestSingle = times.length ? Math.min(...times.map(effSolveTime)) : Infinity;
        return {
            uid,
            bestAo,
            bestSingle
        };
    }).filter(x => x.bestAo != null || x.bestSingle < Infinity);
    if (!ranked.length) return null;
    ranked.sort((a, b) => {
        const av = a.bestAo == null ? Infinity : a.bestAo;
        const bv = b.bestAo == null ? Infinity : b.bestAo;
        if (av !== bv) return av - bv;
        return a.bestSingle - b.bestSingle;
    });
    if (ranked.length > 1) {
        const a0 = ranked[0].bestAo == null ? Infinity : ranked[0].bestAo;
        const a1 = ranked[1].bestAo == null ? Infinity : ranked[1].bestAo;
        if (a0 === a1 && ranked[0].bestSingle === ranked[1].bestSingle) return 'tie';
    }
    return ranked[0].uid;
}

export function computeWinner(players, battle = {}) {
    if ((battle.mode || 'ao5') === 'sets') {
        const target = Math.max(1, parseInt(battle.target, 10) || 3);
        const { scores } = computeSetScores(players);
        const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (!ranked.length || ranked[0][1] < target) return null;
        if (ranked[1] && ranked[1][1] === ranked[0][1]) return 'tie';
        return ranked[0][0];
    }
    if ((battle.mode || 'ao5') === 'infinite') {
        return computeInfiniteLeader(players);
    }
    const completed = Object.entries(players).filter(([_, p]) => p.finished && p.times && p.times.length >= 5);
    if (!completed.length) return null;
    const ranked = completed.map(([uid, p]) => ({ uid, avg: ao5(p.times) }))
        .sort((a, b) => (a.avg === Infinity ? 1e9 : a.avg) - (b.avg === Infinity ? 1e9 : b.avg));
    if (ranked[0].avg === Infinity) return 'all-dnf';
    if (ranked.length > 1 && ranked[1].avg === ranked[0].avg) return 'tie';
    return ranked[0].uid;
}
