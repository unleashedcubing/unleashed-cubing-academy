// ============================================================================
// Smart Cube (Bluetooth) — wraps cubing.js's connectSmartPuzzle.
// Supports GAN, GiiKER, GoCube, MoYu (via the cubing.js BLE module).
//
// Browser support: Web Bluetooth — Chrome / Edge / Opera (desktop & Android).
// Safari and iOS do NOT support Web Bluetooth.
// ============================================================================

import { connectSmartPuzzle } from "https://cdn.cubing.net/v0/js/cubing/bluetooth";

const SMART_CUBE_OPTIONAL_SERVICES = [
    'battery_service',
    'device_information',
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000fff6-0000-1000-8000-00805f9b34fb',
    '0000aadb-0000-1000-8000-00805f9b34fb',
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '0000fe59-0000-1000-8000-00805f9b34fb',
    '0000fe95-0000-1000-8000-00805f9b34fb'
];

async function connectSelectedDevice(device) {
    const attempts = [
        () => connectSmartPuzzle({ bluetoothDevice: device }),
        () => connectSmartPuzzle({ device }),
        () => connectSmartPuzzle(device)
    ];
    let lastError = null;
    for (const attempt of attempts) {
        try {
            return await attempt();
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error('Could not attach to the selected smart cube.');
}

async function connectWithBroadPicker() {
    const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SMART_CUBE_OPTIONAL_SERVICES
    });
    return connectSelectedDevice(device);
}

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
        try {
            puzzle = await connectWithBroadPicker();
        } catch (fallbackError) {
            const msg = fallbackError?.message || e?.message || String(fallbackError || e);
            if (onError) onError(msg);
            throw fallbackError || e;
        }
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
