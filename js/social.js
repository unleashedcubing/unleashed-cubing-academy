import { fbSync } from './firebase-sync.js';

const STUN_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const remoteAudio = typeof Audio !== 'undefined' ? new Audio() : null;
if (remoteAudio) {
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
}

let activeCall = null;

function requireDb() {
    if (!fbSync.enabled) throw new Error('Cloud sync is not configured. Edit firebase-config.js.');
    const user = fbSync.getUser();
    if (!user) throw new Error('Sign in with Google to use Social.');
    return { user, db: fbSync.db(), fs: fbSync.fs() };
}

function nowMs() { return Date.now(); }

function normalizeCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function friendCodeFromUid(uid) {
    return normalizeCode(uid).slice(0, 8);
}

function dmChatId(a, b) {
    return ['dm2', a, b].sort().join('_');
}

async function ensureMySocialProfile() {
    const { user, db, fs } = requireDb();
    const ref = fs.doc(db, 'socialUsers', user.uid);
    // Keep a previously shared code stable if the user changes their Google name.
    const existing = await fs.getDoc(ref);
    const savedCode = existing.exists() ? normalizeCode(existing.data()?.friendCode) : '';
    const payload = {
        displayName: user.displayName || user.email || 'Cubing Friend',
        photoURL: user.photoURL || '',
        friendCode: savedCode || friendCodeFromUid(user.uid),
        lowerName: String(user.displayName || user.email || 'Cubing Friend').toLowerCase(),
        isOnline: true,
        lastSeenAt: nowMs(),
        updatedAt: fs.serverTimestamp()
    };
    await fs.setDoc(ref, payload, { merge: true });
    return { uid: user.uid, ...payload };
}

async function setPresence(isOnline) {
    if (!fbSync.enabled) return;
    const user = fbSync.getUser();
    if (!user) return;
    const db = fbSync.db();
    const fs = fbSync.fs();
    try {
        await fs.setDoc(fs.doc(db, 'socialUsers', user.uid), {
            isOnline: !!isOnline,
            lastSeenAt: nowMs(),
            updatedAt: fs.serverTimestamp()
        }, { merge: true });
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
        setPresence(document.visibilityState === 'visible').catch(() => {});
    });
    window.addEventListener('beforeunload', () => {
        setPresence(false).catch(() => {});
    });
}

fbSync.onUserChange((user) => {
    if (user) ensureMySocialProfile().catch(() => {});
});

async function getSocialProfile(uid) {
    const { db, fs } = requireDb();
    const snap = await fs.getDoc(fs.doc(db, 'socialUsers', uid));
    return snap.exists() ? { uid, ...snap.data() } : { uid, displayName: 'Cubing Friend', photoURL: '', friendCode: friendCodeFromUid(uid), isOnline: false };
}

async function getProfiles(uids) {
    return Promise.all((uids || []).map(uid => getSocialProfile(uid)));
}

export async function sendFriendRequestByCode(rawCode) {
    const { user, db, fs } = requireDb();
    const code = normalizeCode(rawCode);
    if (!code) throw new Error('Enter a friend code.');
    await ensureMySocialProfile();
    const q = fs.query(fs.collection(db, 'socialUsers'), fs.where('friendCode', '==', code));
    const snap = await fs.getDocs(q);
    const matches = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    if (matches.some(item => item.uid === user.uid)) throw new Error("That's your own friend code.");
    const match = matches[0];
    if (!match) throw new Error('Friend code not found. Ask your friend to sign in once and copy their code from Social.');
    const existingFriend = await fs.getDoc(fs.doc(db, 'users', user.uid, 'friends', match.uid));
    if (existingFriend.exists()) {
        // Repair friendships created while older rules only permitted one side to write.
        await Promise.all([
            fs.setDoc(fs.doc(db, 'users', match.uid, 'friends', user.uid), { uid: user.uid, since: fs.serverTimestamp(), sinceMs: nowMs() }, { merge: true }).catch(() => {}),
            ensureDirectChat(match.uid).catch(() => {})
        ]);
        return { alreadyFriends: true, target: match };
    }
    const reqId = `${user.uid}_${match.uid}`;
    try {
        await fs.setDoc(fs.doc(db, 'friendRequests', reqId), {
            fromUid: user.uid,
            toUid: match.uid,
            status: 'pending',
            createdAt: fs.serverTimestamp(),
            createdAtMs: nowMs()
        }, { merge: true });
    } catch (error) {
        if (error && /permission|denied/i.test(error.message || error.code || '')) {
            throw new Error('That request is already pending, or your Firestore rules need to be published.');
        }
        throw error;
    }
    return { target: match };
}

export async function acceptFriendRequest(requestId) {
    const { user, db, fs } = requireDb();
    const ref = fs.doc(db, 'friendRequests', requestId);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) throw new Error('Friend request not found.');
    const req = snap.data();
    if (req.toUid !== user.uid && req.fromUid !== user.uid) throw new Error('Not allowed.');
    const otherUid = req.fromUid === user.uid ? req.toUid : req.fromUid;
    // Persist acceptance before creating both friend-list entries.
    await fs.setDoc(ref, { status: 'accepted', acceptedAt: fs.serverTimestamp(), acceptedAtMs: nowMs() }, { merge: true });
    await Promise.all([
        fs.setDoc(fs.doc(db, 'users', user.uid, 'friends', otherUid), { uid: otherUid, since: fs.serverTimestamp(), sinceMs: nowMs() }, { merge: true }),
        fs.setDoc(fs.doc(db, 'users', otherUid, 'friends', user.uid), { uid: user.uid, since: fs.serverTimestamp(), sinceMs: nowMs() }, { merge: true }),
        ensureDirectChat(otherUid)
    ]);
    return otherUid;
}

export async function declineFriendRequest(requestId) {
    const { user, db, fs } = requireDb();
    const ref = fs.doc(db, 'friendRequests', requestId);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) return;
    const req = snap.data();
    if (req.toUid !== user.uid && req.fromUid !== user.uid) throw new Error('Not allowed.');
    await fs.setDoc(ref, { status: 'declined', declinedAt: fs.serverTimestamp(), declinedAtMs: nowMs() }, { merge: true });
}

export async function removeFriend(friendUid) {
    const { user, db, fs } = requireDb();
    await Promise.all([
        fs.deleteDoc(fs.doc(db, 'users', user.uid, 'friends', friendUid)).catch(() => {}),
        fs.deleteDoc(fs.doc(db, 'users', friendUid, 'friends', user.uid)).catch(() => {})
    ]);
}

export async function ensureDirectChat(friendUid) {
    const { user, db, fs } = requireDb();
    const chatId = dmChatId(user.uid, friendUid);
    const ref = fs.doc(db, 'chats', chatId);
    await fs.setDoc(ref, {
        type: 'dm',
        memberIds: [user.uid, friendUid]
    }, { merge: true });
    return chatId;
}

export async function sendDirectMessage(friendUid, text, kind = 'text') {
    const { user, db, fs } = requireDb();
    const message = String(text || '').trim();
    if (!message) throw new Error('Type a message first.');
    const chatId = await ensureDirectChat(friendUid);
    const msgRef = fs.doc(fs.collection(db, 'chats', chatId, 'messages'));
    await Promise.all([
        fs.setDoc(msgRef, {
            authorUid: user.uid,
            authorName: user.displayName || user.email || 'You',
            text: message,
            kind,
            createdAt: fs.serverTimestamp(),
            createdAtMs: nowMs()
        }),
        fs.setDoc(fs.doc(db, 'chats', chatId), {
            lastMessage: message,
            lastMessageAtMs: nowMs(),
            lastSenderUid: user.uid
        }, { merge: true })
    ]);
    return chatId;
}

export function listenSocialHub(onUpdate) {
    const { user, db, fs } = requireDb();
    let friends = [];
    let incoming = [];
    let outgoing = [];
    let invites = [];

    const emit = async () => {
        const friendIds = friends.map(item => item.id);
        const profiles = await getProfiles(friendIds);
        const profileMap = new Map(profiles.map(p => [p.uid, p]));
        const hydrateRequest = async (item, isIncoming) => {
            const otherUid = isIncoming ? item.fromUid : item.toUid;
            return { id: item.id, ...item, profile: await getSocialProfile(otherUid) };
        };
        const hydrateInvite = async (item) => ({
            id: item.id,
            ...item,
            fromProfile: await getSocialProfile(item.fromUid)
        });
        onUpdate({
            me: await getSocialProfile(user.uid),
            friends: friends.map(item => ({ id: item.id, ...item, profile: profileMap.get(item.id) })).sort((a, b) => {
                const ao = a.profile?.isOnline ? 1 : 0;
                const bo = b.profile?.isOnline ? 1 : 0;
                if (ao !== bo) return bo - ao;
                return String(a.profile?.displayName || '').localeCompare(String(b.profile?.displayName || ''));
            }),
            incoming: await Promise.all(incoming.map(item => hydrateRequest(item, true))),
            outgoing: await Promise.all(outgoing.map(item => hydrateRequest(item, false))),
            invites: (await Promise.all(invites.map(hydrateInvite))).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
        });
    };

    const unsubs = [
        fs.onSnapshot(fs.collection(db, 'users', user.uid, 'friends'), (snap) => {
            friends = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            emit().catch(() => {});
        }),
        fs.onSnapshot(fs.query(fs.collection(db, 'friendRequests'), fs.where('toUid', '==', user.uid)), (snap) => {
            incoming = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.status === 'pending');
            emit().catch(() => {});
        }),
        fs.onSnapshot(fs.query(fs.collection(db, 'friendRequests'), fs.where('fromUid', '==', user.uid)), (snap) => {
            outgoing = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.status === 'pending');
            emit().catch(() => {});
        }),
        fs.onSnapshot(fs.query(fs.collection(db, 'battleInvites'), fs.where('toUid', '==', user.uid)), (snap) => {
            invites = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.status === 'pending');
            emit().catch(() => {});
        })
    ];
    emit().catch(() => {});
    return () => unsubs.forEach(unsub => { try { unsub(); } catch (_) {} });
}

export function listenDirectChat(friendUid, onUpdate) {
    const { user, db, fs } = requireDb();
    const chatId = dmChatId(user.uid, friendUid);
    let chat = { id: chatId, memberIds: [user.uid, friendUid] };
    let messages = [];
    let call = null;
    let unsubChat = null;
    let unsubMsgs = null;
    let unsubCall = null;
    let attachedCallId = null;
    let stopped = false;

    const emit = async () => onUpdate({
        chatId,
        chat,
        messages,
        call,
        friend: await getSocialProfile(friendUid),
        me: await getSocialProfile(user.uid)
    });

    const attachCall = (callId) => {
        if ((callId || null) === attachedCallId) return;
        if (unsubCall) { try { unsubCall(); } catch (_) {} }
        unsubCall = null;
        attachedCallId = callId || null;
        call = null;
        if (!callId) {
            emit().catch(() => {});
            return;
        }
        unsubCall = fs.onSnapshot(
            fs.doc(db, 'chats', chatId, 'calls', callId),
            (snap) => {
                call = snap.exists() ? { id: callId, ...snap.data() } : null;
                emit().catch(() => {});
            },
            (error) => console.error('Voice call listener failed:', error)
        );
    };

    ensureDirectChat(friendUid).then(() => {
        if (stopped) return;
        unsubChat = fs.onSnapshot(
            fs.doc(db, 'chats', chatId),
            (snap) => {
                chat = snap.exists() ? { id: chatId, ...snap.data() } : { id: chatId, memberIds: [user.uid, friendUid] };
                attachCall(chat.currentCallId || null);
                emit().catch(() => {});
            },
            (error) => console.error('Direct chat listener failed:', error)
        );
        unsubMsgs = fs.onSnapshot(
            fs.query(fs.collection(db, 'chats', chatId, 'messages'), fs.orderBy('createdAtMs', 'asc'), fs.limitToLast(80)),
            (snap) => {
                messages = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                emit().catch(() => {});
            },
            (error) => console.error('Message listener failed:', error)
        );
    }).catch((error) => console.error('Direct chat setup failed:', error));

    emit().catch(() => {});
    return () => {
        stopped = true;
        if (unsubChat) try { unsubChat(); } catch (_) {}
        if (unsubMsgs) try { unsubMsgs(); } catch (_) {}
        if (unsubCall) try { unsubCall(); } catch (_) {}
    };
}

export async function createBattleInvite(friendUid, battleInfo) {
    const { user, db, fs } = requireDb();
    const inviteRef = fs.doc(fs.collection(db, 'battleInvites'));
    await fs.setDoc(inviteRef, {
        fromUid: user.uid,
        toUid: friendUid,
        battleCode: battleInfo.code,
        puzzle: battleInfo.puzzle || '333',
        mode: battleInfo.mode || 'ao5',
        target: battleInfo.target || null,
        status: 'pending',
        createdAt: fs.serverTimestamp(),
        createdAtMs: nowMs()
    });
    return inviteRef.id;
}

export async function acceptBattleInvite(inviteId) {
    const { user, db, fs } = requireDb();
    const ref = fs.doc(db, 'battleInvites', inviteId);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) throw new Error('Battle invite not found.');
    const invite = snap.data();
    if (invite.toUid !== user.uid) throw new Error('This invite is not for you.');
    await fs.setDoc(ref, { status: 'accepted', acceptedAt: fs.serverTimestamp(), acceptedAtMs: nowMs() }, { merge: true });
    return invite;
}

export async function declineBattleInvite(inviteId) {
    const { user, db, fs } = requireDb();
    const ref = fs.doc(db, 'battleInvites', inviteId);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) return;
    const invite = snap.data();
    if (invite.toUid !== user.uid) throw new Error('This invite is not for you.');
    await fs.setDoc(ref, { status: 'declined', declinedAt: fs.serverTimestamp(), declinedAtMs: nowMs() }, { merge: true });
}

async function buildPeerConnection(chatId, callId, isCaller) {
    const { user, db, fs } = requireDb();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Voice chat is not supported in this browser.');
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const pc = new RTCPeerConnection(STUN_CONFIG);
    const remoteStream = new MediaStream();
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
        if (remoteAudio) {
            remoteAudio.srcObject = remoteStream;
            remoteAudio.play().catch(() => {});
        }
    };

    const offerCandidates = fs.collection(db, 'chats', chatId, 'calls', callId, 'offerCandidates');
    const answerCandidates = fs.collection(db, 'chats', chatId, 'calls', callId, 'answerCandidates');
    pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        fs.setDoc(fs.doc(isCaller ? offerCandidates : answerCandidates), event.candidate.toJSON())
            .catch((error) => console.error('ICE candidate write failed:', error));
    };

    activeCall = {
        chatId, callId, isCaller, pc, localStream, remoteStream,
        cleanup: [],
        userUid: user.uid
    };

    return { user, db, fs, pc, localStream, remoteStream, offerCandidates, answerCandidates };
}

async function teardownActiveCall(pushEnded = false) {
    if (!activeCall) return;
    const current = activeCall;
    activeCall = null;
    current.cleanup.forEach(unsub => { try { unsub(); } catch (_) {} });
    try { current.pc.close(); } catch (_) {}
    try { current.localStream.getTracks().forEach(track => track.stop()); } catch (_) {}
    if (remoteAudio) {
        try { remoteAudio.pause(); } catch (_) {}
        remoteAudio.srcObject = null;
    }
    if (pushEnded && fbSync.enabled && fbSync.getUser()) {
        const { db, fs } = requireDb();
        await Promise.all([
            fs.setDoc(fs.doc(db, 'chats', current.chatId, 'calls', current.callId), {
                status: 'ended',
                endedAtMs: nowMs(),
                endedByUid: fbSync.getUser().uid
            }, { merge: true }),
            fs.setDoc(fs.doc(db, 'chats', current.chatId), {
                currentCallId: null,
                currentCallState: null,
                currentCallFromUid: null
            }, { merge: true })
        ]).catch(() => {});
    }
}

export async function startVoiceCall(friendUid) {
    const { user, db, fs } = requireDb();
    const chatId = await ensureDirectChat(friendUid);
    if (activeCall) throw new Error('Finish the current voice chat first.');
    const callRef = fs.doc(fs.collection(db, 'chats', chatId, 'calls'));
    const callId = callRef.id;
    const { pc, offerCandidates, answerCandidates } = await buildPeerConnection(chatId, callId, true);

    activeCall.cleanup.push(
        fs.onSnapshot(fs.doc(db, 'chats', chatId, 'calls', callId), async (snap) => {
            const data = snap.exists() ? snap.data() : null;
            if (!data) return;
            if (data.status === 'ended') {
                teardownActiveCall(false).catch(() => {});
                return;
            }
            if (data.answer && !pc.currentRemoteDescription) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        }),
        fs.onSnapshot(answerCandidates, (snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
            });
        })
    );

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await fs.setDoc(callRef, {
        callerUid: user.uid,
        calleeUid: friendUid,
        offer: { type: offer.type, sdp: offer.sdp },
        status: 'ringing',
        createdAt: fs.serverTimestamp(),
        createdAtMs: nowMs()
    });
    await fs.setDoc(fs.doc(db, 'chats', chatId), {
        currentCallId: callId,
        currentCallState: 'ringing',
        currentCallFromUid: user.uid
    }, { merge: true });
    return { chatId, callId };
}

export async function acceptVoiceCall(chatId, callId) {
    const { user, db, fs } = requireDb();
    if (activeCall) throw new Error('Finish the current voice chat first.');
    const callRef = fs.doc(db, 'chats', chatId, 'calls', callId);
    const callSnap = await fs.getDoc(callRef);
    if (!callSnap.exists()) throw new Error('Voice call not found.');
    const callData = callSnap.data();
    const { pc, offerCandidates } = await buildPeerConnection(chatId, callId, false);
    activeCall.cleanup.push(
        fs.onSnapshot(offerCandidates, (snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
            });
        }),
        fs.onSnapshot(callRef, (snap) => {
            const data = snap.exists() ? snap.data() : null;
            if (data?.status === 'ended') teardownActiveCall(false).catch(() => {});
        })
    );
    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await fs.setDoc(callRef, {
        answer: { type: answer.type, sdp: answer.sdp },
        calleeUid: user.uid,
        status: 'active',
        acceptedAtMs: nowMs()
    }, { merge: true });
    await fs.setDoc(fs.doc(db, 'chats', chatId), {
        currentCallId: callId,
        currentCallState: 'active',
        currentCallFromUid: callData.callerUid || null
    }, { merge: true });
}

export async function endVoiceCall() {
    await teardownActiveCall(true);
}

export function activeVoiceCall() {
    return activeCall ? { chatId: activeCall.chatId, callId: activeCall.callId, isCaller: activeCall.isCaller } : null;
}
