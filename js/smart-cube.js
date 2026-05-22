// ============================================================================
// Smart Cube (Bluetooth) — wraps cubing.js's connectSmartPuzzle.
// Supports GAN, GiiKER, GoCube, MoYu (via the cubing.js BLE module).
//
// Browser support: Web Bluetooth — Chrome / Edge / Opera (desktop & Android).
// Safari and iOS do NOT support Web Bluetooth.
// ============================================================================

import { connectSmartPuzzle } from "https://cdn.cubing.net/js/cubing/bluetooth";

export async function connectCube({ onMove, onSolved, onName, onError, onDisconnect } = {}) {
    if (!navigator.bluetooth) {
        const msg = 'Web Bluetooth is not supported in this browser. Use Chrome, Edge, or Opera.';
        if (onError) onError(msg);
        throw new Error(msg);
    }

    let puzzle;
    try {
        puzzle = await connectSmartPuzzle();
    } catch (e) {
        if (onError) onError(e.message || String(e));
        throw e;
    }

    const name = (puzzle && (puzzle.name || puzzle.deviceName)) || 'Smart Cube';
    if (onName) onName(name);

    // cubing.js's smart puzzles expose moves through varying APIs across versions.
    // Try the modern listener pattern first, then fall back.
    let detached = false;
    let listenerHandle = null;

    function emitMove(moveObj) {
        if (detached || !onMove) return;
        const str = (moveObj && typeof moveObj.toString === 'function') ? moveObj.toString() : String(moveObj);
        onMove(str);
    }

    try {
        // Modern: addAlgLeafListener({ onAlgLeaf(move) })
        if (typeof puzzle.addAlgLeafListener === 'function') {
            listenerHandle = puzzle.addAlgLeafListener({
                onAlgLeaf: (move) => emitMove(move)
            });
        } else if (typeof puzzle.addMoveListener === 'function') {
            listenerHandle = puzzle.addMoveListener((m) => emitMove(m));
        } else if (puzzle.eventEmitter && typeof puzzle.eventEmitter.addEventListener === 'function') {
            const handler = (ev) => emitMove(ev.detail && (ev.detail.latestMove || ev.detail.move) || ev.detail);
            puzzle.eventEmitter.addEventListener('move', handler);
            listenerHandle = () => puzzle.eventEmitter.removeEventListener('move', handler);
        } else if (typeof puzzle.addEventListener === 'function') {
            const handler = (ev) => emitMove(ev.detail || ev);
            puzzle.addEventListener('move', handler);
            listenerHandle = () => puzzle.removeEventListener('move', handler);
        } else {
            console.warn('Smart puzzle has no recognised move listener API:', puzzle);
            if (onError) onError('Connected, but this cube\'s move-streaming API is unfamiliar to this build of cubing.js. Moves will not be tracked.');
        }
    } catch (e) {
        console.error('Failed to attach move listener:', e);
        if (onError) onError('Connected, but could not attach move listener: ' + (e.message || e));
    }

    // Optional disconnect detection (where available)
    try {
        const device = puzzle.device || puzzle.bluetoothDevice;
        if (device && typeof device.addEventListener === 'function') {
            device.addEventListener('gattserverdisconnected', () => {
                detached = true;
                if (onDisconnect) onDisconnect();
            });
        }
    } catch (e) {}

    return {
        name,
        puzzle,
        disconnect() {
            detached = true;
            try {
                if (typeof listenerHandle === 'function') listenerHandle();
                if (puzzle.disconnect) puzzle.disconnect();
                else if (puzzle.device && puzzle.device.gatt && puzzle.device.gatt.disconnect) puzzle.device.gatt.disconnect();
            } catch (e) {}
            if (onDisconnect) onDisconnect();
        }
    };
}
