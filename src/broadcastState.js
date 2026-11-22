// --- Broadcast state derived from the displayed event -----------------------
// The room must receive exactly what the conductor's portal shows, so the
// broadcast values are derived from the current event and its sketchpad node
// (the same lookup the display uses) instead of being stored separately.

// Direction format: comma-separated string of non-empty fields
// (same as noteschordsscales SkeletonPlayer)
export function directionText(event) {
  const dir = event?.direction
  if (dir && typeof dir === 'object') {
    const parts = [dir.marking, dir.lyric, dir.note].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : null
  }
  if (typeof dir === 'string') return dir || null
  return null
}

// Harmony keys for the room. A node without a chord (e.g. a tacet node), an
// event whose node is missing, and no event at all broadcast null: the
// portal shows a dash in each of those cases, and the room follows it.
export function harmonyBroadcast({ node, nextNode }) {
  return {
    chordKey: node?.chord || null,
    scaleKey: node?.scale || null,
    nextChordKey: nextNode?.chord || null,
    nextScaleKey: nextNode?.scale || null,
  }
}
