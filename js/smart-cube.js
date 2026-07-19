// ============================================================================
// Smart Cube (Bluetooth) — wraps cubing.js's connectSmartPuzzle.
//
// Browser support: Web Bluetooth — Chrome / Edge / Opera (desktop & Android).
// Safari and iOS do NOT support Web Bluetooth.
// ============================================================================

import { connectSmartPuzzle } from "https://cdn.cubing.net/v0/js/cubing/bluetooth";

function readableError(error) {
    const message = String(error?.message || error || '').trim();
    if (error?.name === 'NotFoundError') {
        return 'No supported cube was selected. Wake and turn the cube, then try again.';
    }
    if (/network|gatt|connect/i.test(message)) {
        return 'The cube was found but could not connect. Remove it from saved Bluetooth devices, wake it, and retry.';
    }
    return message || 'Could not connect to this smart cube.';
}

export async function connectCube({ onMove, onSolved, onName, onError, onDisconnect } = {}) {
    if (!navigator.bluetooth) {
        const msg = 'Web Bluetooth is not supported in this browser. Use Chrome, Edge, or Opera.';
        if (onError) onError(msg);
        throw new Error(msg);
    }

    if (typeof navigator.bluetooth.getAvailability === 'function' &&
        !await navigator.bluetooth.getAvailability()) {
        const msg = 'Bluetooth is unavailable on this device.';
        if (onError) onError(msg);
        throw new Error(msg);
    }

    let puzzle;
    try {
        puzzle = await connectSmartPuzzle();
    } catch (e) {
        const msg = readableError(e);
        if (onError) onError(msg);
        throw new Error(msg);
    }

    let name = 'Smart Cube';
    try {
        name = typeof puzzle?.name === 'function'
            ? await puzzle.name()
            : (puzzle?.name || puzzle?.deviceName || name);
    } catch (_) {}
    if (onName) onName(name);

    let detached = false;
    let removeListener = null;

    function emitMove(event) {
        if (detached || !onMove) return;
        const algLeaf = event?.latestAlgLeaf || event?.algLeaf || event;
        const str = algLeaf && typeof algLeaf.toString === 'function' ? algLeaf.toString() : String(algLeaf || '');
        if (str) onMove(str, algLeaf, event);
    }

    try {
        if (typeof puzzle.addAlgLeafListener === 'function') {
            const listener = event => emitMove(event);
            puzzle.addAlgLeafListener(listener);
            removeListener = () => puzzle.removeAlgLeafListener?.(listener);
        } else if (typeof puzzle.addMoveListener === 'function') {
            const listener = event => emitMove(event);
            const handle = puzzle.addMoveListener(listener);
            removeListener = typeof handle === 'function'
                ? handle
                : () => puzzle.removeMoveListener?.(listener);
        } else if (typeof puzzle.addEventListener === 'function') {
            const handler = ev => emitMove(ev.detail || ev);
            puzzle.addEventListener('move', handler);
            removeListener = () => puzzle.removeEventListener('move', handler);
        } else {
            throw new Error('Connected, but this cube does not provide a move stream.');
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
                removeListener?.();
                if (typeof puzzle.disconnect === 'function') puzzle.disconnect();
                else if (puzzle.device?.gatt?.connected) puzzle.device.gatt.disconnect();
            } catch (e) {}
            if (onDisconnect) onDisconnect();
        }
    };
}
