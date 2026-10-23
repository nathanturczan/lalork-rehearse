// --- Harmony Payload v2 chordInfo for custom chords --------------------------
// A sketchpad node may define its chord inline (node.custom.chord: the shape the
// Dashboard exports, and the idiom-engine walk's cartridges use for chords the
// registry does not have, e.g. plain triads). Its chord id (customchord_...) is
// meaningless to receivers on its own, so the broadcast must carry the notes:
//   { id, name, root, pitchClasses, voicing, isCustom: true }
// with id === chordData (receivers only trust a payload whose id matches the
// legacy key). Registry chords return null: receivers resolve those themselves.
// Pitch classes and voicings may be half-step fractional (24-EDO cartridges).

export function customChordsOf(sketchpad) {
  const out = {}
  for (const n of sketchpad?.nodes || []) {
    if (n?.chord && n.custom && n.custom.chord) out[n.chord] = n.custom.chord
  }
  return out
}

export function buildChordInfo(chordKey, customChords) {
  if (!chordKey || !customChords) return null
  const c = customChords[chordKey]
  if (!c || !Array.isArray(c.pitchClasses)) return null
  return {
    id: chordKey,
    name: c.name || 'custom',
    root: typeof c.root === 'number' ? c.root : null,
    pitchClasses: [...c.pitchClasses],
    voicing: Array.isArray(c.voicing) ? [...c.voicing] : null,
    isCustom: true,
  }
}
