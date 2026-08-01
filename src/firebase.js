// src/firebase.js
// Copied from noteschordsscales — same Firebase project so ensembles are shared
// across the whole Scale Navigator ecosystem (NotesChordScales, Strudel bridge,
// Ableton bridge, Ensemble Jammer, and this rehearse app).
import firebase from "firebase/app";
import "firebase/auth";
import "firebase/firestore";

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
// never touch the live la-laptop-orchestra room.

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
    createdAt: Date.now(),
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
 */
export async function updateEnsembleState({
  roomId,
  bpm,
  chordKey,
  scaleKey,
  direction,
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
  if (typeof direction === "string" || direction === null) {
    patch.direction = direction || null;
  }

  if (!Object.keys(patch).length) return;

  patch.updatedAt = Date.now();

  await db.collection("rooms").doc(roomId).update(patch);
}
