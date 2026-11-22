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

// Harmony keys for the room. A node without a chord (e.g. a tacet node) and
// an event whose node is missing broadcast null: the portal shows a dash in
// those cases, and the room follows it.
//
// Before any event has been selected the harmony fields are left out
// (undefined, which updateEnsembleState skips), so opening the app does not
// blank a room that already shows harmony (#23). Once this session has
// broadcast harmony, "no event" (a piece was just changed) is sent as null so
// the previous piece's harmony does not stay in the room.
export function harmonyBroadcast({ hasEvent, hasBroadcast, node, nextNode }) {
  if (!hasEvent && !hasBroadcast) return {}
  return {
    chordKey: node?.chord || null,
    scaleKey: node?.scale || null,
    nextChordKey: nextNode?.chord || null,
    nextScaleKey: nextNode?.scale || null,
  }
}
