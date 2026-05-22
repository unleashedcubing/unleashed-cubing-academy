// ============================================================================
// Stackmat (Speed Stacks Pro Timer) audio-jack decoder.
// ----------------------------------------------------------------------------
// Protocol summary (Speed Stacks Gen 3/4):
//   - Serial signal over the audio cable, 1200 baud, 8-N-1.
//   - 9-byte frame:   [status] [M] [SS_hi] [SS_lo] [CC_hi] [CC_lo] [checksum] CR LF
//     status: 'I'(idle) 'A'(armed) ' '(running) 'S'(stopped) 'C'(complete)
//     time:   M=minute (1 ASCII digit), SS=seconds, CC=centiseconds.
//   - Polarity (which audio sign means logical 1) varies per cable/jack;
//     we detect it from a stream of valid frames.
//
// Approach:
//   getUserMedia → AudioContext → ScriptProcessorNode (4096-sample chunks).
//   Per sample, take sign as a bit. Search for start/stop bit boundaries at
//   the known baud rate, decode bytes, scan for valid 9-byte frames using
//   the [data...][0x0D][0x0A] tail as anchor.
// ============================================================================

export async function startStackmat({ onSolve, onStatus, onError } = {}) {
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
            }
        });
    } catch (e) {
        if (onError) onError('Microphone permission denied or unavailable.');
        throw e;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const SR  = ctx.sampleRate;
    const SPB = SR / 1200;          // samples per bit
    const FRAME_SAMPLES = Math.ceil(SPB * 10);  // 10 bits per byte (start+8+stop)

    // Circular bit buffer of recent samples (binary 0/1, polarity unresolved).
    // We keep ~50 bytes worth so we can find a 9-byte frame.
    const MAX_BITS = Math.floor(SPB * 10 * 50);
    const bits = new Int8Array(MAX_BITS);
    let writeIdx = 0;
    let polarity = +1;   // +1: positive sample = bit 1. Flipped if we keep failing.
    let consecutiveFailures = 0;
    let lastStatus = null;
    let lastSolveMs = -1;

    const proc = ctx.createScriptProcessor(4096, 1, 1);
    src.connect(proc);
    proc.connect(ctx.destination);

    proc.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            const v = data[i] * polarity;
            // Use a small dead-zone so silence doesn't oscillate.
            const bit = v > 0.02 ? 1 : (v < -0.02 ? 0 : bits[(writeIdx - 1 + MAX_BITS) % MAX_BITS]);
            bits[writeIdx] = bit;
            writeIdx = (writeIdx + 1) % MAX_BITS;
        }

        const frame = tryFindFrame(bits, writeIdx, SPB);
        if (frame) {
            consecutiveFailures = 0;
            if (onStatus && frame.status !== lastStatus) {
                onStatus(frame.status);
                lastStatus = frame.status;
            }
            // A "complete" or "stopped" status holds the final time. We record once.
            const stoppedish = frame.status === 'S' || frame.status === 'C';
            if (stoppedish && frame.ms > 0 && frame.ms !== lastSolveMs) {
                lastSolveMs = frame.ms;
                if (onSolve) onSolve(frame.ms / 1000);
            }
            // Reset solve-deduplication when we leave stopped state.
            if (!stoppedish && lastSolveMs !== -1 && frame.status === 'I') lastSolveMs = -1;
        } else {
            consecutiveFailures++;
            // After ~2 seconds without a valid frame, try flipping polarity.
            if (consecutiveFailures > Math.floor(SR / 4096 * 2)) {
                polarity = -polarity;
                consecutiveFailures = 0;
            }
        }
    };

    return {
        stop() {
            try { proc.disconnect(); } catch (e) {}
            try { src.disconnect(); } catch (e) {}
            try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
            try { ctx.close(); } catch (e) {}
        }
    };
}

// ---- Helpers ----

// Sample the given bit position (relative to the byte's start bit) from the
// circular buffer.
function sampleBit(buf, baseIdx, bitOffset, spb, totalLen) {
    const idx = (baseIdx + Math.round(bitOffset * spb)) % totalLen;
    return buf[idx < 0 ? idx + totalLen : idx];
}

// Decode one byte starting at startIdx (which is the start bit, must be 0).
// Returns -1 if framing is invalid.
function decodeByteAt(buf, startIdx, spb, totalLen) {
    if (sampleBit(buf, startIdx, 0.5, spb, totalLen) !== 0) return -1;
    let byte = 0;
    for (let b = 0; b < 8; b++) {
        if (sampleBit(buf, startIdx, 1.5 + b, spb, totalLen) === 1) byte |= (1 << b);
    }
    if (sampleBit(buf, startIdx, 9.5, spb, totalLen) !== 1) return -1;
    return byte;
}

// Walk the most recent ~50 bytes back through the circular buffer and look
// for a valid 9-byte Stackmat frame ending at the latest CR LF.
function tryFindFrame(buf, writeIdx, spb) {
    const totalLen = buf.length;
    const bytesPerFrame = 9;
    const sampleSpan = Math.floor(spb * 10 * (bytesPerFrame + 1));

    // Scan recent window for the LF (0x0A) preceded by CR (0x0D), then back up
    // 9 bytes and verify the rest of the frame.
    for (let back = sampleSpan; back >= Math.floor(spb * 10 * bytesPerFrame); back--) {
        const startIdx = (writeIdx - back + totalLen) % totalLen;
        const b8 = decodeByteAt(buf, startIdx + 8 * Math.round(spb * 10) | 0, spb, totalLen);
        // Cheap sanity check before decoding the whole frame:
        if (b8 !== 0x0A) continue;

        const bytes = new Array(9);
        let ok = true;
        for (let n = 0; n < 9; n++) {
            const bi = (startIdx + n * Math.round(spb * 10)) % totalLen;
            const v = decodeByteAt(buf, bi, spb, totalLen);
            if (v < 0) { ok = false; break; }
            bytes[n] = v;
        }
        if (!ok) continue;
        if (bytes[7] !== 0x0D || bytes[8] !== 0x0A) continue;

        const status = String.fromCharCode(bytes[0]);
        if (' IASC'.indexOf(status) < 0) continue;
        const m  = bytes[1] - 0x30;
        const s1 = bytes[2] - 0x30, s2 = bytes[3] - 0x30;
        const c1 = bytes[4] - 0x30, c2 = bytes[5] - 0x30;
        if ([m, s1, s2, c1, c2].some(x => x < 0 || x > 9)) continue;

        const seconds = m * 60 + s1 * 10 + s2 + c1 / 10 + c2 / 100;
        return { status, ms: Math.round(seconds * 1000) };
    }
    return null;
}
