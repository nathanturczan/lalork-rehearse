// Form Strip (lalork-website#116) — ported from Enter's FormStrip.tsx so the
// conductor sees the same energy arc + playhead the ensemble sees. Contour is
// the skeleton's normalized [x, y] breakpoints (0–1); position comes from the
// video clock (sampled at 4 Hz) with an event-resolution fallback. Sections
// are the harmonic-state boundaries (0–1), drawn as dashed verticals in the
// same style as the panel border. No contour = no strip.
//
// Glyphs (lalork#7): Kahn-style texture patches — the same renderer as
// Enter's, so the conductor previews exactly the graphic score the ensemble
// sees. Each patch is an absolutely-positioned SVG over the strip:
// envelope (clipPath) × procedural texture (seeded) × fit (squash = texture
// stretches with the box, crop = intrinsic cell size, top cropped).
//
// The playhead animates via a CSS transform (translateX in user units), NOT
// x1/x2 — SVG line geometry attributes aren't CSS-animatable, so transitions
// on them silently do nothing and the playhead teleports.

import { useId } from 'react'

const VIEW_W = 100
const VIEW_H = 20
const PAD_Y = 2

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// Deterministic PRNG so patch textures are stable across renders.
const makeRng = (seed) => {
  let s = (seed || 1) >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const PATCH_VIEW = 100

function envelopeShape(envelope) {
  switch (envelope) {
    case 'wedge': // builds left → right (crescendo)
      return <polygon points="0,100 100,0 100,100" />
    case 'ramp': // decays left → right
      return <polygon points="0,0 0,100 100,100" />
    case 'dome':
      return <path d="M 0 100 C 15 12, 85 12, 100 100 Z" />
    case 'column':
    default:
      return <rect x={0} y={0} width={PATCH_VIEW} height={PATCH_VIEW} />
  }
}

// Procedural texture marks inside the 100×100 patch box. All white; opacity
// variation carries the depth. Deterministic per seed.
function textureMarks(texture, density, seed) {
  const rnd = makeRng(seed)
  const d = clamp01(density)
  const els = []
  // non-scaling-stroke means this width is in screen pixels regardless of
  // how the patch is squashed — 2px reads confidently at every strip size.
  const stroke = {
    fill: 'none',
    stroke: '#fff',
    strokeWidth: 2,
    vectorEffect: 'non-scaling-stroke',
  }
  switch (texture) {
    case 'stipple': {
      const n = Math.round(30 + d * 150)
      for (let i = 0; i < n; i++) {
        els.push(
          <circle
            key={i}
            cx={rnd() * 100}
            cy={rnd() * 100}
            r={1.2 + rnd() * 2}
            fill="#fff"
            opacity={0.3 + rnd() * 0.6}
          />
        )
      }
      break
    }
    case 'bubbles': {
      const n = Math.round(6 + d * 26)
      for (let i = 0; i < n; i++) {
        els.push(
          <circle
            key={i}
            cx={rnd() * 100}
            cy={rnd() * 100}
            r={2 + rnd() * 6}
            {...stroke}
            opacity={0.35 + rnd() * 0.5}
          />
        )
      }
      break
    }
    case 'hatch': {
      const n = Math.round(12 + d * 50)
      for (let i = 0; i < n; i++) {
        const cx = rnd() * 100
        const cy = rnd() * 100
        const len = 6 + rnd() * 10
        els.push(
          <line
            key={i}
            x1={cx - len / 2}
            y1={cy + len / 2}
            x2={cx + len / 2}
            y2={cy - len / 2}
            {...stroke}
            opacity={0.35 + rnd() * 0.5}
          />
        )
      }
      break
    }
    case 'zigzag': {
      const rows = Math.round(2 + d * 5)
      for (let r = 0; r < rows; r++) {
        const y = ((r + 0.5) / rows) * 100
        const amp = 3 + rnd() * 5
        const step = 5 + rnd() * 6
        const pts = []
        let up = true
        for (let x = 0; x <= 100; x += step) {
          pts.push(`${x},${y + (up ? -amp : amp)}`)
          up = !up
        }
        els.push(
          <polyline
            key={r}
            points={pts.join(' ')}
            {...stroke}
            opacity={0.5 + rnd() * 0.4}
          />
        )
      }
      break
    }
    case 'chevron': {
      const n = Math.round(8 + d * 40)
      for (let i = 0; i < n; i++) {
        const cx = rnd() * 100
        const cy = rnd() * 100
        const s = 3 + rnd() * 4
        els.push(
          <polyline
            key={i}
            points={`${cx - s},${cy + s} ${cx},${cy - s} ${cx + s},${cy + s}`}
            {...stroke}
            opacity={0.4 + rnd() * 0.5}
          />
        )
      }
      break
    }
    case 'comb': {
      // Teeth rise from the baseline, jittered heights — Nancarrow-ish.
      const n = Math.round(10 + d * 50)
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * 100
        const hgt = 100 * (0.45 + rnd() * 0.55)
        els.push(
          <line
            key={i}
            x1={x}
            y1={100}
            x2={x}
            y2={100 - hgt}
            {...stroke}
            opacity={0.4 + rnd() * 0.5}
          />
        )
      }
      break
    }
    case 'steps': {
      // Staircase step-lines (Eno, Music for Airports 1/1).
      const n = Math.round(4 + d * 14)
      for (let i = 0; i < n; i++) {
        let x = rnd() * 75
        let y = 10 + rnd() * 80
        const pts = [`${x},${y}`]
        const segs = 3 + Math.floor(rnd() * 3)
        for (let s = 0; s < segs; s++) {
          x += 4 + rnd() * 8
          pts.push(`${x},${y}`)
          y += (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 7)
          pts.push(`${x},${y}`)
        }
        els.push(
          <polyline
            key={i}
            points={pts.join(' ')}
            {...stroke}
            opacity={0.4 + rnd() * 0.5}
          />
        )
      }
      break
    }
  }
  return els
}

function PatchSvg({ patch, clipId }) {
  const h = clamp01(patch.h ?? 0.6)
  const fit = patch.fit ?? 'squash'
  return (
    <svg
      className={`portal__patch${
        patch.anim ? ` portal__patch--${patch.anim}` : ''
      }`}
      style={{
        left: `${clamp01(patch.x) * 100}%`,
        width: `${clamp01(patch.w) * 100}%`,
        height: `${h * 100}%`,
        // Desynchronize neighbors: same anim, different phase.
        animationDelay: `-${((patch.seed ?? 1) % 13) * 0.37}s`,
      }}
      viewBox={`0 0 ${PATCH_VIEW} ${PATCH_VIEW}`}
      preserveAspectRatio={fit === 'crop' ? 'xMidYMax slice' : 'none'}
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          {envelopeShape(patch.envelope ?? 'column')}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {textureMarks(patch.texture ?? 'stipple', patch.density ?? 0.5, patch.seed ?? 1)}
      </g>
    </svg>
  )
}

export default function FormStrip({ contour, position, sections, glyphs }) {
  // Unique clipPath id prefix — duplicate SVG ids on one page would make
  // every strip clip with the first instance's shapes.
  const patchIdPrefix = useId()

  if (!contour || contour.length < 2) return null

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
  const patches = Array.isArray(glyphs)
    ? glyphs.filter((g) => g && g.type === 'patch')
    : []

  return (
    <div className="portal__form-strip" aria-label="Piece form">
      <span className="portal__bay-label">Form</span>
      {/* portal__form-canvas: positioning context so the glyph overlay tracks
          the SVG box exactly (the outer strip has padding + label). */}
      <div className="portal__form-canvas">
        {/* Glyph layer (lalork#7): HTML overlay rather than the strip SVG
            because that SVG stretches non-uniformly (preserveAspectRatio=
            "none") and would smear the textures. */}
        {patches.length > 0 && (
          <div className="portal__form-glyphs" aria-hidden="true">
            {patches.map((p, i) => (
              <PatchSvg key={i} patch={p} clipId={`${patchIdPrefix}-clip-${i}`} />
            ))}
          </div>
        )}
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
    </div>
  )
}
