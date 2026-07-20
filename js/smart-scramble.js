function parseMove(moveText) {
    const raw = String(moveText || '').trim().replace(/\s+/g, '');
    const match = raw.match(/^([URFDLB](?:w)?)(2)?(')?$/i);
    if (!match) return null;
    return {
        base: match[1].toUpperCase(),
        direction: match[3] ? -1 : 1,
        quarterTurns: match[2] ? 2 : 1
    };
}

function displayMove(move) {
    const base = move.base.endsWith('W')
        ? move.base.slice(0, -1) + 'w'
        : move.base;
    return base + (move.quarterTurns === 2 ? '2' : '') + (move.direction < 0 ? "'" : '');
}

function inverseQuarterTurn(move) {
    const inverse = {
        base: move.base,
        direction: move.direction * -1,
        quarterTurns: 1
    };
    return { text: displayMove(inverse), move: inverse };
}

function sameQuarterTurn(expected, incoming) {
    return expected?.base === incoming.base && expected.direction === incoming.direction;
}

export function createScrambleTracker(scramble) {
    const tokens = String(scramble || '').trim().split(/\s+/).filter(Boolean).map(text => ({
        text,
        move: parseMove(text),
        progress: 0,
        directionLock: 0
    }));
    return { tokens, corrections: [], index: 0, hadMismatch: false };
}

export function advanceScrambleTracker(tracker, moveText) {
    if (!tracker) return tracker;
    const incomingMoves = String(moveText || '').trim().split(/\s+/).filter(Boolean);

    incomingMoves.forEach(rawMove => {
        const incoming = parseMove(rawMove);
        if (!incoming) {
            tracker.hadMismatch = true;
            return;
        }

        for (let turn = 0; turn < incoming.quarterTurns; turn++) {
            const correction = tracker.corrections[0];
            if (correction) {
                if (sameQuarterTurn(correction.move, incoming)) {
                    tracker.corrections.shift();
                } else {
                    tracker.hadMismatch = true;
                    tracker.corrections.unshift(inverseQuarterTurn(incoming));
                }
                continue;
            }

            const token = tracker.tokens[tracker.index];
            if (!token?.move) {
                tracker.hadMismatch = true;
                tracker.corrections.unshift(inverseQuarterTurn(incoming));
                continue;
            }

            const sameFace = token.move.base === incoming.base;
            let sameDirection = token.move.direction === incoming.direction;
            if (sameFace && token.move.quarterTurns === 2) {
                if (!token.directionLock) token.directionLock = incoming.direction;
                sameDirection = token.directionLock === incoming.direction;
            }

            if (!sameFace || !sameDirection) {
                tracker.hadMismatch = true;
                tracker.corrections.unshift(inverseQuarterTurn(incoming));
                continue;
            }

            token.progress += 1;
            if (token.progress >= token.move.quarterTurns) tracker.index += 1;
        }
    });

    return tracker;
}

export function completeScrambleTracker(tracker) {
    if (!tracker) return tracker;
    tracker.tokens.forEach(token => {
        token.progress = token.move?.quarterTurns || 1;
    });
    tracker.index = tracker.tokens.length;
    tracker.corrections = [];
    return tracker;
}

export function scrambleTrackerComplete(tracker) {
    return !!tracker && tracker.index >= tracker.tokens.length && tracker.corrections.length === 0;
}
