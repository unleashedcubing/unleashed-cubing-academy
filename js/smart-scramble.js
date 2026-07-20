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

function quarterTurnEntry(base, direction) {
    const move = { base, direction, quarterTurns: 1 };
    return { text: displayMove(move), move };
}

function prependCorrection(tracker, correction) {
    const base = correction.move.base;
    let runLength = 0;
    let turns = correction.move.direction;
    while (tracker.corrections[runLength]?.move?.base === base) {
        turns += tracker.corrections[runLength].move.direction;
        runLength += 1;
    }

    const normalized = ((turns % 4) + 4) % 4;
    const replacement = normalized === 0
        ? []
        : normalized === 1
            ? [quarterTurnEntry(base, 1)]
            : normalized === 2
                ? [quarterTurnEntry(base, 1), quarterTurnEntry(base, 1)]
                : [quarterTurnEntry(base, -1)];
    tracker.corrections.splice(0, runLength, ...replacement);
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
                    prependCorrection(tracker, inverseQuarterTurn(incoming));
                }
                continue;
            }

            const token = tracker.tokens[tracker.index];
            if (!token?.move) {
                tracker.hadMismatch = true;
                prependCorrection(tracker, inverseQuarterTurn(incoming));
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
                prependCorrection(tracker, inverseQuarterTurn(incoming));
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

export function scrambleCorrectionMoves(tracker) {
    const corrections = tracker?.corrections || [];
    const combined = [];
    for (let index = 0; index < corrections.length;) {
        const first = corrections[index].move;
        let turns = 0;
        let next = index;
        while (corrections[next]?.move?.base === first.base) {
            turns += corrections[next].move.direction;
            next += 1;
        }
        const normalized = ((turns % 4) + 4) % 4;
        if (normalized) {
            const move = {
                base: first.base,
                direction: normalized === 3 ? -1 : 1,
                quarterTurns: normalized === 2 ? 2 : 1
            };
            combined.push({ text: displayMove(move), move });
        }
        index = next;
    }
    return combined;
}
