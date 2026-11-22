// Display name for custom harmony (a chord or scale defined in the piece's
// sketchpad). Its key ("customchord_farben_02", "df_para_lydian") cannot be
// parsed into a name, so the label comes from the same scaleInfo/chordInfo
// payload that is broadcast, formatted the way Enter formats it: root, then
// the payload's name. Returns null for registry harmony (no payload, or
// isCustom false), which keeps its key-derived name. A caller that already
// knows how the root is spelled (a scale key's root token) passes rootLabel.

const PC_NAMES = [
  'C', 'C♯', 'D', 'E♭', 'E', 'F',
  'F♯', 'G', 'A♭', 'A', 'B♭', 'B',
]

export function customLabel(info, rootLabel = null) {
  if (!info || !info.isCustom) return null
  // A fractional (24-EDO) root has no name in this table: name only
  const root =
    rootLabel ||
    (Number.isInteger(info.root) ? PC_NAMES[((info.root % 12) + 12) % 12] : '')
  return `${root} ${info.name || ''}`.trim() || null
}
