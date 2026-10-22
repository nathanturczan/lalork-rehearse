#!/usr/bin/env node
// Import a cartridge from the canonical songs repo into pieces/.
//
// Usage: node scripts/import-piece.mjs <songDir> <pieceId>
//   e.g. node scripts/import-piece.mjs ~/Github/songs/again again
//
// Reads  <songDir>/sketchpad_<pieceId>.json + <songDir>/skeleton_<pieceId>.json
// Writes pieces/<pieceId>_sketchpad.json    + pieces/<pieceId>.json
//
// Transforms:
// - Node scale display strings -> machine keys ("F diatonic" -> "f_diatonic",
//   "Db para_lydian" -> "df_para_lydian")
// - Custom `scales` block keys -> the same machine keys, so nodes resolve
// - Skeleton gains `title` from the sketchpad `name`
// Chord codes are already machine codes and pass through untouched.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_TOKENS = {
  'c': 'c', 'c#': 'cs', 'db': 'df', 'd': 'd', 'd#': 'ds', 'eb': 'ef',
  'e': 'e', 'f': 'f', 'f#': 'fs', 'gb': 'gf', 'g': 'g', 'g#': 'gs',
  'ab': 'af', 'a': 'a', 'a#': 'as', 'bb': 'bf', 'b': 'b'
};

function normalizeScaleKey(display) {
  if (typeof display !== 'string' || !display.trim()) {
    throw new Error(`Bad scale reference: ${JSON.stringify(display)}`);
  }
  const trimmed = display.trim();
  // Already a machine key? (starts with a valid root token + underscore)
  const machineMatch = trimmed.match(/^(c|cs|df|d|ds|ef|e|f|fs|gf|g|gs|af|a|as|bf|b)_[a-z0-9_]+$/);
  if (machineMatch) return trimmed;
  // The symmetric scales' registry ids carry no root token (octatonic_3, hexatonic_2, whole_tone_1)
  if (/^(octatonic|hexatonic|whole_tone)_\d+$/.test(trimmed)) return trimmed;

  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) throw new Error(`Cannot parse scale reference "${display}"`);
  const rootName = trimmed.slice(0, spaceIdx).toLowerCase();
  const token = ROOT_TOKENS[rootName];
  if (!token) throw new Error(`Unknown root "${trimmed.slice(0, spaceIdx)}" in scale "${display}"`);
  const scaleClass = trimmed.slice(spaceIdx + 1).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return `${token}_${scaleClass}`;
}

function main() {
  const [songDir, pieceId] = process.argv.slice(2);
  if (!songDir || !pieceId) {
    console.error('Usage: node scripts/import-piece.mjs <songDir> <pieceId>');
    process.exit(1);
  }

  const srcDir = resolve(songDir);
  const sketchpadSrc = join(srcDir, `sketchpad_${pieceId}.json`);
  const skeletonSrc = join(srcDir, `skeleton_${pieceId}.json`);
  for (const p of [sketchpadSrc, skeletonSrc]) {
    if (!existsSync(p)) {
      console.error(`Missing source file: ${p}`);
      process.exit(1);
    }
  }

  const sketchpad = JSON.parse(readFileSync(sketchpadSrc, 'utf8'));
  const skeleton = JSON.parse(readFileSync(skeletonSrc, 'utf8'));

  // Normalize custom scales block keys to machine keys.
  const scaleKeyMap = new Map(); // original display key -> machine key
  let scalesOut;
  if (sketchpad.scales) {
    scalesOut = {};
    for (const [displayKey, def] of Object.entries(sketchpad.scales)) {
      const machineKey = normalizeScaleKey(displayKey);
      scaleKeyMap.set(displayKey, machineKey);
      scalesOut[machineKey] = def;
    }
  }

  // Normalize node scale references.
  const nodesOut = (sketchpad.nodes || []).map((node) => {
    const machineKey = scaleKeyMap.get(node.scale) ?? normalizeScaleKey(node.scale);
    return { ...node, scale: machineKey };
  });

  const sketchpadOut = { ...sketchpad, nodes: nodesOut };
  if (scalesOut) sketchpadOut.scales = scalesOut;

  const skeletonOut = {
    title: skeleton.title ?? sketchpad.name ?? pieceId,
    ...skeleton
  };

  // Validate: every skeleton event state must resolve to a node.
  const nodeIds = new Set(nodesOut.map((n) => n.id));
  for (const ev of skeletonOut.events || []) {
    if (!nodeIds.has(ev.state)) {
      console.error(`Skeleton event at time ${ev.time} references unknown node "${ev.state}"`);
      process.exit(1);
    }
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const sketchpadDst = join(repoRoot, 'pieces', `${pieceId}_sketchpad.json`);
  const skeletonDst = join(repoRoot, 'pieces', `${pieceId}.json`);
  writeFileSync(sketchpadDst, JSON.stringify(sketchpadOut, null, 2) + '\n');
  writeFileSync(skeletonDst, JSON.stringify(skeletonOut, null, 2) + '\n');

  const scaleKeys = [...new Set(nodesOut.map((n) => n.scale))];
  console.log(`Wrote ${sketchpadDst}`);
  console.log(`Wrote ${skeletonDst}`);
  console.log(`Scale keys: ${scaleKeys.join(', ')}`);
  if (scalesOut) console.log(`Custom scales: ${Object.keys(scalesOut).join(', ')}`);
}

main();
