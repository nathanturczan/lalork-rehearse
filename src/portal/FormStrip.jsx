// Form Strip (lalork-website#116) — ported from Enter's FormStrip.tsx so the
// conductor sees the same energy arc + playhead the ensemble sees. Contour is
// the skeleton's normalized [x, y] breakpoints (0–1); position comes from the
// video clock (sampled at 4 Hz) with an event-resolution fallback. Sections
// are the harmonic-state boundaries (0–1), drawn as dashed verticals in the
// same style as the panel border. No contour = no strip.
//
// The playhead animates via a CSS transform (translateX in user units), NOT
// x1/x2 — SVG line geometry attributes aren't CSS-animatable, so transitions
// on them silently do nothing and the playhead teleports.

const VIEW_W = 100
const VIEW_H = 20
const PAD_Y = 2

export default function FormStrip({ contour, position, sections }) {
  if (!contour || contour.length < 2) return null

  const clamp01 = (v) => Math.min(1, Math.max(0, v))
  const points = contour
    .map(([x, y]) => {
      const px = clamp01(x) * VIEW_W
      const py = PAD_Y + (1 - clamp01(y)) * (VIEW_H - PAD_Y * 2)
      return `${px},${py}`
    })
    .join(' ')
  const playheadX = position != null ? clamp01(position) * VIEW_W : null
  const sectionXs = Array.isArray(sections)
    ? [...new Set(sections.filter((x) => typeof x === 'number' && x > 0 && x < 1))]
    : []

  return (
    <div className="portal__form-strip" aria-label="Piece form">
      <span className="portal__bay-label">Form</span>
      <svg
        className="portal__form-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
      >
        {sectionXs.map((x) => (
          <line
            key={x}
            className="portal__form-section"
            x1={x * VIEW_W}
            y1={0}
            x2={x * VIEW_W}
            y2={VIEW_H}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline
          className="portal__form-contour"
          points={points}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        {playheadX != null && (
          <line
            className="portal__form-playhead"
            x1={0}
            y1={0}
            x2={0}
            y2={VIEW_H}
            style={{ transform: `translateX(${playheadX}px)` }}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  )
}
