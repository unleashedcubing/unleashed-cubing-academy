// Stackmat audio decoder. Stackmat timers send an inverted 1200-baud,
// 8-N-1 serial stream through the selected audio input.

const BAUD = 1200;
const AUDIO_CONSTRAINTS = {
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: false,
    channelCount: 1
};

export async function listAudioInputs({ requestPermission = false } = {}) {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    let permissionStream = null;
    if (requestPermission) {
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        let index = 0;
        return devices
            .filter(device => device.kind === 'audioinput')
            .map(device => {
                index++;
                return {
                    id: device.deviceId,
                    label: device.label || `Audio input ${index}`
                };
            });
    } finally {
        permissionStream?.getTracks().forEach(track => track.stop());
    }
}

export function decodeStackmatFrame(bytes) {
    if (!Array.isArray(bytes) || (bytes.length !== 9 && bytes.length !== 10)) return null;
    if (bytes[bytes.length - 2] !== 0x0d || bytes[bytes.length - 1] !== 0x0a) return null;

    const status = String.fromCharCode(bytes[0]);
    if (!/^[ SILRCA]$/.test(status)) return null;

    const digits = bytes.slice(1, -3).map(value => value - 0x30);
    if (digits.some(value => value < 0 || value > 9)) return null;
    const checksum = 64 + digits.reduce((sum, value) => sum + value, 0);
    if (checksum !== bytes[bytes.length - 3]) return null;

    const minuteMs = digits[0] * 60_000;
    const secondMs = (digits[1] * 10 + digits[2]) * 1_000;
    const fractionMs = bytes.length === 10
        ? (digits[3] * 100 + digits[4] * 10 + digits[5])
        : (digits[3] * 100 + digits[4] * 10);
    return { status, ms: minuteMs + secondMs + fractionMs, precisionMs: bytes.length === 10 ? 1 : 10 };
}

export async function startStackmat({ deviceId = '', onSolve, onStatus, onSignal, onError } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
        const error = new Error('Audio input is not supported in this browser.');
        onError?.(error.message);
        throw error;
    }

    const audio = {
        ...AUDIO_CONSTRAINTS,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {})
    };
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (error) {
        const message = error?.name === 'OverconstrainedError'
            ? 'That audio input is no longer available. Choose another input.'
            : 'Microphone access was denied or the selected audio input is unavailable.';
        onError?.(message);
        throw new Error(message);
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Web Audio is not supported in this browser.');
    }

    const context = new AudioContextClass();
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(1024, 1, 1);
    const silentOutput = context.createGain();
    silentOutput.gain.value = 0;
    source.connect(processor);
    processor.connect(silentOutput);
    silentOutput.connect(context.destination);

    const samplesPerBit = context.sampleRate / BAUD;
    const powerSmoothing = 0.001 / samplesPerBit;
    let power = 1;
    let lastLogic = 0;
    let samplesAtLevel = 0;
    let idleLogic = 0;
    let lastBit = 0;
    let bitRunLength = 0;
    let bitBuffer = [];
    let byteBuffer = [];
    let lastFrameMs = 0;
    let sawRunning = false;
    let lastSolveMs = -1;
    let lastSignalUpdate = 0;
    let distortion = 1;

    function emitFrame(frame) {
        const increasing = frame.ms > lastFrameMs;
        if (increasing) sawRunning = true;
        const derivedStatus = increasing ? ' ' : frame.status;
        onStatus?.(derivedStatus, frame);

        if (sawRunning && frame.status === 'S' && frame.ms > 0 && frame.ms !== lastSolveMs) {
            lastSolveMs = frame.ms;
            sawRunning = false;
            onSolve?.(frame.ms / 1000, frame);
        }
        if (frame.status === 'I' && frame.ms === 0) {
            sawRunning = false;
            lastSolveMs = -1;
        }
        lastFrameMs = frame.ms;
    }

    function inspectByteBuffer() {
        if (byteBuffer.length > 10) byteBuffer = byteBuffer.slice(-10);
        for (const length of [9, 10]) {
            if (byteBuffer.length < length) continue;
            const candidate = byteBuffer.slice(-length);
            const frame = decodeStackmatFrame(candidate);
            if (frame) {
                emitFrame(frame);
                byteBuffer = [];
                return;
            }
        }
    }

    function appendBit(bit) {
        bitBuffer.push(bit);
        if (bit === lastBit) bitRunLength++;
        else {
            lastBit = bit;
            bitRunLength = 1;
        }

        if (bitRunLength > 10) {
            idleLogic = bit;
            bitBuffer = [];
            byteBuffer = [];
            return;
        }
        if (bitBuffer.length < 10) return;

        if (bitBuffer[0] === idleLogic || bitBuffer[9] !== idleLogic) {
            bitBuffer.shift();
            return;
        }
        let value = 0;
        for (let index = 8; index > 0; index--) {
            value = (value << 1) | (bitBuffer[index] === idleLogic ? 1 : 0);
        }
        byteBuffer.push(value);
        bitBuffer = [];
        inspectByteBuffer();
    }

    function flushLevel() {
        const runBits = Math.max(1, Math.round(samplesAtLevel / samplesPerBit));
        for (let index = 0; index < runBits; index++) appendBit(lastLogic);
        samplesAtLevel -= runBits * samplesPerBit;
    }

    processor.onaudioprocess = event => {
        const input = event.inputBuffer.getChannelData(0);
        for (let index = 0; index < input.length; index++) {
            const sample = input[index];
            const samplePower = sample * sample;
            power = Math.max(0.0001, power + (samplePower - power) * powerSmoothing);
            const normalized = sample / Math.sqrt(power);

            let logic = lastLogic;
            if (normalized > 0.35) logic = 1;
            else if (normalized < -0.35) logic = 0;

            if (logic !== lastLogic && samplesAtLevel > samplesPerBit * 0.55) {
                flushLevel();
                lastLogic = logic;
                samplesAtLevel = 0;
            } else if (samplesAtLevel > samplesPerBit * 2) {
                appendBit(lastLogic);
                samplesAtLevel -= samplesPerBit;
            }
            samplesAtLevel++;

            const expected = lastLogic ? 1 : -1;
            const error = normalized - expected;
            distortion = Math.max(0.0001, distortion + (error * error - distortion) * powerSmoothing);
        }

        const now = performance.now();
        if (now - lastSignalUpdate > 250) {
            lastSignalUpdate = now;
            onSignal?.({
                power,
                noise: Math.min(1, distortion),
                active: power > 0.0002
            });
        }
    };

    const track = stream.getAudioTracks()[0];
    return {
        deviceId: track?.getSettings?.().deviceId || deviceId,
        label: track?.label || 'Audio input',
        stop() {
            processor.onaudioprocess = null;
            try { source.disconnect(); } catch (_) {}
            try { processor.disconnect(); } catch (_) {}
            try { silentOutput.disconnect(); } catch (_) {}
            stream.getTracks().forEach(item => item.stop());
            context.close().catch(() => {});
        }
    };
}
