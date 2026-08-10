// Form Strip (lalork-website#116) — ported from Enter's FormStrip.tsx so the
// conductor sees the same energy arc + playhead the ensemble sees. Contour is
// the skeleton's normalized [x, y] breakpoints (0–1); position is the current
// event's beat over the piece's total beats. No contour = no strip.

const VIEW_W = 100
const VIEW_H = 20
const PAD_Y = 2

export default function FormStrip({ contour, position }) {
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

  return (
    <div className="portal__form-strip" aria-label="Piece form">
      <span className="portal__bay-label">Form</span>
      <svg
        className="portal__form-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
      >
        <polyline
          className="portal__form-contour"
          points={points}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        {playheadX != null && (
          <line
            className="portal__form-playhead"
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={VIEW_H}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  )
}
