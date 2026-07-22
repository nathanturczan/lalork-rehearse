// src/firebase.js
// Copied from noteschordsscales — same Firebase project so ensembles are shared
// across the whole Scale Navigator ecosystem (NotesChordScales, Strudel bridge,
// Ableton bridge, Ensemble Jammer, and this rehearse app).
import firebase from "firebase/app";
import "firebase/auth";
import "firebase/firestore";

// Keep these env var names in sync with your Vercel / .env.local setup
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Only initialize once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();

const googleProvider = new firebase.auth.GoogleAuthProvider();

// --- Auth hook ---

import { useEffect, useState } from "react";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      setInitializing(false);
    });
    return () => unsub();
  }, []);

  return { user, initializing };
}

// --- One-shot Google sign-in (uses popup - works with WKWebView on Firebase v8) ---

export async function signInWithGoogle() {
  try {
    const result = await auth.signInWithPopup(googleProvider);
    return result.user;
  } catch (err) {
    console.error("Google sign-in error:", err);
    throw err;
  }
}

export async function signOut() {
  await auth.signOut();
}

// --- Ensemble helpers (Firestore) ---

/**
 * Create a new ensemble "room" document in the shared `rooms` collection.
 */
export async function createEnsembleRoom({ roomName, hostUser }) {
  const trimmed = (roomName || "").trim();

  if (!trimmed) {
    throw new Error("Room name is required");
  }
  if (!hostUser || !hostUser.uid) {
    throw new Error("Host user is required");
  }

  const docRef = await db.collection("rooms").add({
    roomName: trimmed,
    hostId: hostUser.uid,
    hostName: hostUser.displayName || hostUser.email || "Unknown host",
    bpm: 60,
    chordData: null,
    scaleData: null,
    createdAt: Date.now(),
  });

  return { roomId: docRef.id };
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

/**
 * Fetch all ensemble rooms where the given user is the host.
 */
export async function getUserHostedRooms(userId) {
  if (!userId) return [];

  const snapshot = await db
    .collection("rooms")
    .where("hostId", "==", userId)
    .get();

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}
