// ============================================================================
// Smart Cube (Bluetooth)
//
// GAN cubes use gan-web-bluetooth because it supports the encrypted Gen2,
// Gen3, and Gen4 protocols used by the iCarry family. Other brands continue to
// use cubing.js's multi-brand smart-puzzle adapter.
// ============================================================================

const GAN_MODULE_URL = 'https://esm.sh/gan-web-bluetooth@3.0.2?bundle&target=es2022';
const CUBING_BLUETOOTH_URL = 'https://cdn.cubing.net/v0/js/cubing/bluetooth';

function normalizeMacAddress(value) {
    const compact = String(value || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (compact.length !== 12) return null;
    return compact.match(/.{2}/g).join(':');
}

function macStorageKey(device) {
    const id = String(device?.id || device?.name || 'gan-cube').replace(/[^a-z0-9_-]/gi, '_');
    return `uc_gan_mac_${id}`;
}

function readableError(error, provider) {
    const message = String(error?.message || error || '').trim();
    if (error?.name === 'NotFoundError' || error?.name === 'AbortError') {
        return provider === 'gan'
            ? 'Pairing was cancelled or Chrome could not see the GAN cube. Close csTimer, CubeStation, and other cube tabs, wake the cube with a turn, then retry.'
            : 'Pairing was cancelled or no compatible cube was selected. Wake the cube and try again.';
    }
    if (/unable to determine cube mac/i.test(message)) {
        return 'Chrome could not read the GAN cube address. Retry and enter the cube MAC when asked.';
    }
    if (/gatt|network|already.*(use|connect)|connection.*(failed|lost)|connect/i.test(message)) {
        return 'The cube is already in use or Chrome lost its Bluetooth link. Disconnect it from every other tab or app, wake it with a turn, then retry.';
    }
    if (/wrong or unsupported cube|target ble services/i.test(message)) {
        return 'Chrome found the device, but it did not expose a supported GAN cube service. Make sure the cube, not a watch or timer, was selected.';
    }
    if (error?.name === 'SecurityError') {
        return 'Bluetooth permission was blocked. Allow Bluetooth for this site in Chrome, then retry.';
    }
    return message || 'Could not connect to this smart cube.';
}

async function ensureBluetooth(onError) {
    if (!navigator.bluetooth) {
        const message = 'Web Bluetooth is not supported in this browser. Use Chrome, Edge, or Opera.';
        onError?.(message);
        throw new Error(message);
    }

    if (typeof navigator.bluetooth.getAvailability === 'function' &&
        !await navigator.bluetooth.getAvailability()) {
        const message = 'Bluetooth is unavailable on this device.';
        onError?.(message);
        throw new Error(message);
    }
}

async function connectGan(options) {
    const {
        onMove,
        onName,
        onError,
        onDisconnect,
        onBattery,
        requestMacAddress
    } = options;
    const { connectGanCube } = await import(GAN_MODULE_URL);

    const macProvider = async (device, isFallbackCall) => {
        const key = macStorageKey(device);
        const cached = normalizeMacAddress(localStorage.getItem(key));
        if (cached) return cached;
        if (!isFallbackCall || typeof requestMacAddress !== 'function') return null;

        const supplied = normalizeMacAddress(await requestMacAddress(device));
        if (supplied) localStorage.setItem(key, supplied);
        return supplied;
    };

    const connection = await connectGanCube(macProvider);
    const name = connection.deviceName || 'GAN Smart Cube';
    let detached = false;

    const subscription = connection.events$.subscribe({
        next(event) {
            if (detached) return;
            if (event?.type === 'MOVE' && event.move) {
                onMove?.(event.move, null, event);
            } else if (event?.type === 'BATTERY') {
                onBattery?.(event.batteryLevel);
            } else if (event?.type === 'DISCONNECT') {
                detached = true;
                onDisconnect?.();
            }
        },
        error(error) {
            if (detached) return;
            onError?.(readableError(error, 'gan'));
        }
    });

    onName?.(name);
    Promise.allSettled([
        connection.sendCubeCommand({ type: 'REQUEST_HARDWARE' }),
        connection.sendCubeCommand({ type: 'REQUEST_FACELETS' }),
        connection.sendCubeCommand({ type: 'REQUEST_BATTERY' })
    ]).catch(() => {});

    return {
        name,
        provider: 'gan',
        puzzle: connection,
        async disconnect() {
            if (detached) return;
            detached = true;
            subscription?.unsubscribe?.();
            try { await connection.disconnect(); } catch (_) {}
        }
    };
}

async function connectOther(options) {
    const { onMove, onName, onError, onDisconnect } = options;
    const { connectSmartPuzzle } = await import(CUBING_BLUETOOTH_URL);
    const puzzle = await connectSmartPuzzle();

    let name = 'Smart Cube';
    try {
        name = typeof puzzle?.name === 'function'
            ? await puzzle.name()
            : (puzzle?.name || puzzle?.deviceName || name);
    } catch (_) {}
    onName?.(name);

    let detached = false;
    let removeListener = null;

    function emitMove(event) {
        if (detached || !onMove) return;
        const algLeaf = event?.latestAlgLeaf || event?.algLeaf || event;
        const text = algLeaf && typeof algLeaf.toString === 'function'
            ? algLeaf.toString()
            : String(algLeaf || '');
        if (text) onMove(text, algLeaf, event);
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
            const handler = event => emitMove(event.detail || event);
            puzzle.addEventListener('move', handler);
            removeListener = () => puzzle.removeEventListener('move', handler);
        } else {
            throw new Error('Connected, but this cube does not provide a move stream.');
        }
    } catch (error) {
        console.error('Failed to attach move listener:', error);
        onError?.('Connected, but could not attach the move stream.');
    }

    try {
        const device = puzzle.device || puzzle.bluetoothDevice;
        device?.addEventListener?.('gattserverdisconnected', () => {
            if (detached) return;
            detached = true;
            onDisconnect?.();
        });
    } catch (_) {}

    return {
        name,
        provider: 'other',
        puzzle,
        disconnect() {
            if (detached) return;
            detached = true;
            try {
                removeListener?.();
                if (typeof puzzle.disconnect === 'function') puzzle.disconnect();
                else if (puzzle.device?.gatt?.connected) puzzle.device.gatt.disconnect();
            } catch (_) {}
        }
    };
}

export async function connectCube(options = {}) {
    const provider = options.provider === 'other' ? 'other' : 'gan';
    await ensureBluetooth(options.onError);

    try {
        return provider === 'gan'
            ? await connectGan(options)
            : await connectOther(options);
    } catch (error) {
        const message = readableError(error, provider);
        options.onError?.(message);
        const wrapped = new Error(message);
        wrapped.cause = error;
        throw wrapped;
    }
}
