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

export function createScrambleTracker(scramble) {
    const tokens = String(scramble || '').trim().split(/\s+/).filter(Boolean).map(text => ({
        text,
        move: parseMove(text),
        progress: 0,
        directionLock: 0
    }));
    return { tokens, index: 0, hadMismatch: false };
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
            const token = tracker.tokens[tracker.index];
            if (!token?.move) {
                tracker.hadMismatch = true;
                continue;
            }

            const sameFace = token.move.base === incoming.base;
            let sameDirection = token.move.direction === incoming.direction;
            if (token.move.quarterTurns === 2) {
                if (!token.directionLock) token.directionLock = incoming.direction;
                sameDirection = token.directionLock === incoming.direction;
            }

            if (!sameFace || !sameDirection) {
                tracker.hadMismatch = true;
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
    return tracker;
}

export function scrambleTrackerComplete(tracker) {
    return !!tracker && tracker.index >= tracker.tokens.length;
}
