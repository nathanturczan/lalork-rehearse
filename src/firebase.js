// src/firebase.js
// Copied from noteschordsscales — same Firebase project so ensembles are shared
// across the whole Scale Navigator ecosystem (NotesChordScales, Strudel bridge,
// Ableton bridge, Ensemble Jammer, and this rehearse app).
import firebase from "firebase/app";
import "firebase/auth";
import "firebase/firestore";
import { rehearsalLifecycleFields } from "./roomLifecycle.js";

// Hardcoded like the Enter app and strudel-scalenav: this config is public
// by design (security lives in Firestore rules), and env-var indirection
// only adds a way for deploys to silently break.
const firebaseConfig = {
  apiKey: "AIzaSyBiTTX24mBjypGdel2ARBx0UUvFQEaRDf4",
  authDomain: "scale-navigator-ensemble.firebaseapp.com",
  projectId: "scale-navigator-ensemble",
  storageBucket: "scale-navigator-ensemble.appspot.com",
  messagingSenderId: "156837833740",
  appId: "1:156837833740:web:ce00fcf2297f899f8b9229",
};

// Only initialize once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();

// --- Invisible guest identity ---
// No popup, no account: works in incognito, Brave, everywhere. The Firestore
// rules only let this identity write rooms it created itself, so it can
// never touch the live la-laptop-orchestra room. (Conducting the live room
// requires the room host's Google identity — see the live conductor section.)

export function ensureGuestAuth() {
  return new Promise((resolve, reject) => {
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      if (user) {
        resolve(user);
      } else {
        auth
          .signInAnonymously()
          .then((cred) => resolve(cred.user))
          .catch(reject);
      }
    });
  });
}

// --- Live conductor mode (host backdoor) ---
// Opening the app with ?room=<roomId> (e.g. ?room=la-laptop-orchestra) puts
// it in live conductor mode: instead of the anonymous guest + private
// rehearsal room, the broadcaster signs in with Google and targets that room
// directly. Firestore rules still enforce hostId == auth.uid, so this only
// works for the account that owns the room — for everyone else the app just
// shows "not the host" and broadcasts nothing.

export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });
}

export function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  // If a guest session exists, signInWithPopup simply replaces it.
  return auth.signInWithPopup(provider).then((cred) => cred.user);
}

// Check up front that this identity can actually conduct the room, so a
// wrong account fails with one clear message instead of a rejected write
// on every broadcast.
export async function verifyRoomHost(roomId, user) {
  const snap = await db.collection("rooms").doc(roomId).get();
  if (!snap.exists) {
    return { ok: false, reason: `Room "${roomId}" does not exist.` };
  }
  if (snap.data().hostId !== user.uid) {
    return {
      ok: false,
      reason: `This account (${user.email || "guest"}) is not the host of "${roomId}".`,
    };
  }
  return { ok: true };
}

// --- Private rehearsal room ---
// Each browser gets its own auto-created room (rehearse-xxxxxx), remembered
// in localStorage. The "rehearse-" prefix is what makes the Strudel badge
// show REHEARSAL instead of LIVE.

const ROOM_STORAGE_KEY = "rehearse_room_id";

function newRoomId() {
  return "rehearse-" + Math.random().toString(36).slice(2, 8);
}

function roomDoc(user) {
  return {
    roomName: "Private Rehearsal",
    hostId: user.uid,
    hostName: "Rehearse app",
    bpm: 60,
    chordData: null,
    scaleData: null,
    // Anticipation contract (lalork-website#117): next-harmony is broadcast
    // exactly this many ms before it commits. Receivers time animations and
    // scheduling off this promise. Runtime-tunable per room.
    anticipationMs: 2000,
    createdAt: Date.now(),
    // roomType/lastActiveAt/expiresAt: marks the room unlisted and eligible
    // for Firestore TTL deletion once it goes inactive (#17).
    ...rehearsalLifecycleFields(firebase.firestore.Timestamp),
  };
}

export async function ensureRehearsalRoom(user) {
  const saved = localStorage.getItem(ROOM_STORAGE_KEY);
  if (saved) {
    const ref = db.collection("rooms").doc(saved);
    const snap = await ref.get();
    if (snap.exists && snap.data().hostId === user.uid) {
      return { roomId: saved };
    }
    if (!snap.exists) {
      // Room was cleaned up: recreate it under the same id so any snippet
      // the user already saved keeps working.
      await ref.set(roomDoc(user));
      return { roomId: saved };
    }
    // Room exists but belongs to a different (old) identity: start fresh.
  }

  const roomId = newRoomId();
  await db.collection("rooms").doc(roomId).set(roomDoc(user));
  localStorage.setItem(ROOM_STORAGE_KEY, roomId);
  return { roomId };
}

/**
 * Best-effort update of the ensemble room's shared state.
 *
 * Channel independence (lalork-website#114): Harmony | Direction | Form are
 * separate channels — a write to one never mutates another. This function is
 * the HARMONY + SCORE-DIRECTION writer (piece playback). It NEVER touches
 * `direction`, which belongs exclusively to the live conductor
 * (setLiveDirection below). This split is the fix for the "blue flash, gone"
 * bug where playback rebroadcasts wiped typed cues.
 */
export async function updateEnsembleState({
  roomId,
  bpm,
  chordKey,
  scaleKey,
  scoreDirection,
  nextChordKey,
  nextScaleKey,
  live = false,
}) {
  if (!roomId) return;

  const patch = {};

  if (typeof bpm === "number" && !Number.isNaN(bpm)) {
    patch.bpm = bpm;
  }
  if (typeof chordKey === "string" || chordKey === null) {
    patch.chordData = chordKey || null;
    // This app doesn't produce Harmony Payload v2 chordInfo; delete any
    // stale chordInfo left by another host (e.g. Dashboard) so receivers
    // don't keep playing an old voicing that no longer matches chordData.
    patch.chordInfo = firebase.firestore.FieldValue.delete();
  }
  if (typeof scaleKey === "string" || scaleKey === null) {
    patch.scaleData = scaleKey || null;
    patch.scaleInfo = firebase.firestore.FieldValue.delete();
  }
  // Baked directions from the score (skeleton events). Written every event
  // change; the live `direction` channel is deliberately left alone.
  if (typeof scoreDirection === "string" || scoreDirection === null) {
    patch.scoreDirection = scoreDirection || null;
  }
  // Planned next harmony (lalork-website#112): receivers show these in their
  // Next slots between transitions. ALWAYS written when passed — explicit
  // null (no next event) must overwrite a stale value, never linger.
  if (typeof nextChordKey === "string" || nextChordKey === null) {
    patch.nextChordData = nextChordKey || null;
  }
  if (typeof nextScaleKey === "string" || nextScaleKey === null) {
    patch.nextScaleData = nextScaleKey || null;
  }

  if (!Object.keys(patch).length) return;

  patch.updatedAt = Date.now();

  // Broadcaster keep-alive: every harmony write from this app refreshes the
  // TTL window. Deliberately NOT done when a listener joins by code — a
  // stranger opening an old rehearsal code must not keep a dead room alive
  // (and Firestore rules only allow the host to write here anyway).
  // Also backfills roomType/expiresAt onto rooms created before #17.
  //
  // NEVER stamped in live conductor mode: tagging la-laptop-orchestra with
  // roomType "rehearsal" + expiresAt would put the live room on the
  // Firestore TTL chopping block.
  if (!live) {
    Object.assign(patch, rehearsalLifecycleFields(firebase.firestore.Timestamp));
  }

  await db.collection("rooms").doc(roomId).update(patch);
}

// --- Live direction channel (lalork-website#114, rehearse#11) ---
// `direction` = LIVE conductor cues only, typed by a human mid-piece.
// Protocol: Set replaces the entire live set, Clear writes null. Playback
// never touches this field, so typed cues survive every harmony rebroadcast.
// Receivers display the union of `direction` + `scoreDirection`.
export async function setLiveDirection(roomId, direction, live = false) {
  if (!roomId) return;
  const patch = {
    direction: (typeof direction === "string" && direction.trim()) || null,
    updatedAt: Date.now(),
  };
  if (!live) {
    Object.assign(patch, rehearsalLifecycleFields(firebase.firestore.Timestamp));
  }
  await db.collection("rooms").doc(roomId).update(patch);
}

// --- Form channel (lalork-website#116, rehearse#12) ---
// formContour: normalized [x, y] breakpoints (0–1) describing the piece's
// energy arc; formSections: normalized x positions (0–1, exclusive) of the
// harmonic-state boundaries, drawn as dashed verticals. Both written once on
// piece load. Resets formPosition to 0 — still a form-channel-only write.
export async function setFormContour(roomId, contour, sections, live = false) {
  if (!roomId) return;
  // Firestore rejects nested arrays, so the [x, y] tuples cross the wire as
  // {x, y} maps; receivers (enter useRoomHarmony) convert back to tuples.
  // formSections is a flat number array, which Firestore accepts as-is.
  const points = Array.isArray(contour)
    ? contour
        .filter((p) => Array.isArray(p) && p.length === 2)
        .map(([x, y]) => ({ x, y }))
    : [];
  const xs = Array.isArray(sections)
    ? sections.filter((x) => typeof x === "number" && x > 0 && x < 1)
    : [];
  const patch = {
    formContour: points.length ? points : null,
    formSections: xs.length ? xs : null,
    formPosition: 0,
    updatedAt: Date.now(),
  };
  if (!live) {
    Object.assign(patch, rehearsalLifecycleFields(firebase.firestore.Timestamp));
  }
  await db.collection("rooms").doc(roomId).update(patch);
}

// formPosition: 0–1 playhead along the contour. Caller throttles; this just
// clamps and writes.
export async function setFormPosition(roomId, position, live = false) {
  if (!roomId) return;
  if (typeof position !== "number" || !Number.isFinite(position)) return;
  const patch = {
    formPosition: Math.min(1, Math.max(0, position)),
    updatedAt: Date.now(),
  };
  if (!live) {
    Object.assign(patch, rehearsalLifecycleFields(firebase.firestore.Timestamp));
  }
  await db.collection("rooms").doc(roomId).update(patch);
}

// --- Anticipation contract backfill (lalork-website#117) ---
// Rooms created before the contract (including la-laptop-orchestra) get
// anticipationMs stamped once. Never overwrites an existing value — the
// field is runtime-tunable (edit in the Firestore console to retune).
export async function ensureAnticipationMs(roomId) {
  if (!roomId) return;
  const ref = db.collection("rooms").doc(roomId);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (typeof snap.data().anticipationMs === "number") return;
  await ref.update({ anticipationMs: 2000 });
}
