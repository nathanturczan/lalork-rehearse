// src/roomLifecycle.js
// Lifecycle metadata for private rehearsal rooms (scale-navigator-bridge-m4l #17).
//
// Rooms created by this app are tagged roomType: "rehearsal" and carry a
// Firestore TTL field (expiresAt). Firestore's native TTL policy (enabled
// separately on the expiresAt field of the rooms collection) deletes the doc
// after it expires.
//
// REFRESH POLICY: only the active broadcaster (this app, writing harmony via
// updateEnsembleState) refreshes lastActiveAt/expiresAt. Listeners joining by
// code (Ensemble Jammer, Ableton Bridge, Strudel) must NOT keep a dead room
// alive. Firestore rules back this up: only the room's host can update it.
//
// IMPORTANT: expiresAt must be a Firestore Timestamp, not epoch millis —
// the native TTL policy silently ignores Number fields.

export const REHEARSAL_EXPIRY_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Fields to merge into a rehearsal room doc on creation and on every
 * broadcaster write.
 *
 * @param {{ fromMillis: (ms: number) => any }} Timestamp - the
 *   firebase.firestore.Timestamp class (injected so this stays testable
 *   without the Firebase SDK).
 * @param {number} [nowMs] - current time in epoch millis.
 * @param {number} [expiryDays] - days of inactivity before TTL deletion.
 */
export function rehearsalLifecycleFields(
  Timestamp,
  nowMs = Date.now(),
  expiryDays = REHEARSAL_EXPIRY_DAYS
) {
  return {
    roomType: "rehearsal",
    lastActiveAt: Timestamp.fromMillis(nowMs),
    expiresAt: Timestamp.fromMillis(nowMs + expiryDays * MS_PER_DAY),
  };
}
