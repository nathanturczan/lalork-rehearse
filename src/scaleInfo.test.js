// Run with: node --test src/scaleInfo.test.js
//
// CONTRACT TESTS — Harmony Payload v2 scaleInfo (tuning-aware).
// The Again payloads below are golden: byte-for-byte what goes to Firestore.
// deepStrictEqual means any rounding of .5, reordering of arrays, or dropped
// field is a failure. Do not "fix" these expectations to match new output —
// changing them is a protocol change and every consumer (Enter portals,
// Dashboard, Ensemble Jammer) must be checked first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScaleInfo } from "./scaleInfo.js";
import { readFileSync } from "node:fs";

// The real cartridge, not a fixture copy: the shipped piece IS the contract.
const sketchpad = JSON.parse(
  readFileSync(new URL("../pieces/again_sketchpad.json", import.meta.url), "utf8")
);
const customScales = sketchpad.scales;

test("F Neutral-Minor: exact golden payload (24-EDO)", () => {
  assert.deepStrictEqual(buildScaleInfo("f_neutral_minor", customScales), {
    schemaVersion: 2,
    id: "f_neutral_minor",
    name: "Neutral-Minor", // root stripped (dashboard#372: name excludes root)
    root: 5,
    edo: 24,
    // C-sorted absolute; 1.5 and 6.5 are exact 24-EDO steps, never rounded
    pitchClasses: [0, 1.5, 3, 5, 6.5, 8, 10],
    scaleClass: "custom",
    isCustom: true,
    // Root-ordered; step in 24ths of an octave above F
    degrees: [
      { step: 0, spelling: "F" },
      { step: 3, spelling: "G half-flat" },
      { step: 6, spelling: "Ab" },
      { step: 10, spelling: "Bb" },
      { step: 14, spelling: "C" },
      { step: 17, spelling: "D half-flat" },
      { step: 20, spelling: "Eb" },
    ],
  });
});

test("Db Para-Lydian: exact golden payload (24-EDO)", () => {
  assert.deepStrictEqual(buildScaleInfo("df_para_lydian", customScales), {
    schemaVersion: 2,
    id: "df_para_lydian",
    name: "Para-Lydian",
    root: 1,
    edo: 24,
    pitchClasses: [0, 1, 3, 5, 6.5, 8, 10],
    scaleClass: "custom",
    isCustom: true,
    degrees: [
      { step: 0, spelling: "Db" },
      { step: 4, spelling: "Eb" },
      { step: 8, spelling: "F" },
      { step: 11, spelling: "G half-flat" },
      { step: 14, spelling: "Ab" },
      { step: 18, spelling: "Bb" },
      { step: 22, spelling: "C" },
    ],
  });
});

test("registry scale: exact golden payload (12-EDO, isCustom false)", () => {
  assert.deepStrictEqual(buildScaleInfo("f_diatonic", customScales), {
    schemaVersion: 2,
    id: "f_diatonic",
    name: "Diatonic",
    root: 5,
    edo: 12,
    pitchClasses: [0, 2, 4, 5, 7, 9, 10],
    scaleClass: "diatonic",
    isCustom: false,
  });
});

test("fractional pitch classes survive mod-12 style consumption", () => {
  const info = buildScaleInfo("f_neutral_minor", customScales);
  // The canonical representation must round-trip through the mod math
  // consumers actually use — this fails if anything upstream rounds.
  for (const pc of info.pitchClasses) {
    assert.strictEqual(((pc % 12) + 12) % 12, pc);
  }
  assert.ok(info.pitchClasses.includes(1.5));
  assert.ok(info.pitchClasses.includes(6.5));
});

test("unknown key returns null (never a fabricated payload)", () => {
  assert.strictEqual(buildScaleInfo("z_nonsense", customScales), null);
  assert.strictEqual(buildScaleInfo(null, customScales), null);
});
