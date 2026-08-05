// Run with: node --test src/roomLifecycle.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rehearsalLifecycleFields,
  REHEARSAL_EXPIRY_DAYS,
} from "./roomLifecycle.js";

// Fake of firebase.firestore.Timestamp — records the millis it was built from
// and is a distinct class so we can assert the fields are NOT plain numbers
// (Firestore TTL ignores Number fields).
class FakeTimestamp {
  constructor(ms) {
    this.ms = ms;
  }
  static fromMillis(ms) {
    return new FakeTimestamp(ms);
  }
}

const DAY = 24 * 60 * 60 * 1000;

test("tags the room as a rehearsal room", () => {
  const f = rehearsalLifecycleFields(FakeTimestamp, 1000);
  assert.equal(f.roomType, "rehearsal");
});

test("lastActiveAt is a Timestamp at now", () => {
  const f = rehearsalLifecycleFields(FakeTimestamp, 5000);
  assert.ok(f.lastActiveAt instanceof FakeTimestamp);
  assert.equal(f.lastActiveAt.ms, 5000);
});

test("expiresAt is a Timestamp 30 days out by default", () => {
  const now = 1_750_000_000_000;
  const f = rehearsalLifecycleFields(FakeTimestamp, now);
  assert.ok(f.expiresAt instanceof FakeTimestamp);
  assert.equal(f.expiresAt.ms, now + REHEARSAL_EXPIRY_DAYS * DAY);
  assert.equal(REHEARSAL_EXPIRY_DAYS, 30);
});

test("expiry window is configurable", () => {
  const now = 1_750_000_000_000;
  const f = rehearsalLifecycleFields(FakeTimestamp, now, 7);
  assert.equal(f.expiresAt.ms, now + 7 * DAY);
});

test("never emits plain-number timestamps (TTL would ignore them)", () => {
  const f = rehearsalLifecycleFields(FakeTimestamp, Date.now());
  assert.notEqual(typeof f.lastActiveAt, "number");
  assert.notEqual(typeof f.expiresAt, "number");
});
