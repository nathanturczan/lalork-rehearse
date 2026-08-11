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
const PAD_Y = 0

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
// variation carries the depth. Deterministic per seed. `tilt` (patch units of
// vertical drop across the box, positive = downhill) only affects 'lines'.
function textureMarks(texture, density, seed, tilt = 0) {
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
      // Each dot twinkles on its own clock: radius swell + opacity sparkle.
      const n = Math.round(30 + d * 150)
      for (let i = 0; i < n; i++) {
        const r0 = 1.2 + rnd() * 2
        const op = 0.3 + rnd() * 0.6
        const dur = (1.2 + rnd() * 2.8).toFixed(2)
        els.push(
          <circle key={i} cx={rnd() * 100} cy={rnd() * 100} r={r0} fill="#fff" opacity={op}>
            <animate
              attributeName="opacity"
              values={`${op.toFixed(2)};${(op * 0.15).toFixed(2)};${op.toFixed(2)}`}
              dur={`${dur}s`}
              begin={`-${(rnd() * 3).toFixed(2)}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values={`${r0.toFixed(2)};${(r0 * 1.7).toFixed(2)};${r0.toFixed(2)}`}
              dur={`${(2 + rnd() * 3).toFixed(2)}s`}
              begin={`-${(rnd() * 4).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </circle>
        )
      }
      break
    }
    case 'bubbles': {
      // Every bubble rises on its own: cy climbs, cx wobbles, fades at the
      // surface and respawns below — a real bubble column, not a group bob.
      const n = Math.round(6 + d * 26)
      for (let i = 0; i < n; i++) {
        const cx = rnd() * 100
        const cy = 30 + rnd() * 70
        const r = 2 + rnd() * 6
        const op = 0.35 + rnd() * 0.5
        const climb = 25 + rnd() * 35
        const dur = (3 + rnd() * 5).toFixed(2)
        // cy climb + opacity fade share one begin so the loop wrap (bubble
        // teleporting back down) always happens at zero opacity.
        const begin = `-${(rnd() * 6).toFixed(2)}s`
        els.push(
          <circle key={i} cx={cx} cy={cy} r={r} {...stroke} opacity={op}>
            <animate
              attributeName="cy"
              values={`${cy.toFixed(1)};${(cy - climb).toFixed(1)}`}
              dur={`${dur}s`}
              begin={begin}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values={`0;${op.toFixed(2)};${op.toFixed(2)};0`}
              keyTimes="0;0.15;0.75;1"
              dur={`${dur}s`}
              begin={begin}
              repeatCount="indefinite"
            />
            <animate
              attributeName="cx"
              values={`${cx.toFixed(1)};${(cx + 2 + rnd() * 3).toFixed(1)};${cx.toFixed(1)};${(cx - 2 - rnd() * 3).toFixed(1)};${cx.toFixed(1)}`}
              dur={`${(2 + rnd() * 3).toFixed(2)}s`}
              begin={`-${(rnd() * 3).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </circle>
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
    case 'rects': {
      // Glitchy right angles: filled squares, outlined rects, elbow strokes.
      // Each mark glitches independently: discrete opacity stutter + discrete
      // position jumps — no easing anywhere, pure digital.
      const n = Math.round(8 + d * 40)
      for (let i = 0; i < n; i++) {
        const cx = rnd() * 92
        const cy = rnd() * 92
        const kind = rnd()
        const op = 0.35 + rnd() * 0.55
        const glitch = (
          <>
            <animate
              attributeName="opacity"
              calcMode="discrete"
              values={`${op.toFixed(2)};${(op * 0.2).toFixed(2)};${op.toFixed(2)};${(op * 0.6).toFixed(2)};${op.toFixed(2)}`}
              keyTimes="0;0.08;0.2;0.55;0.62"
              dur={`${(0.9 + rnd() * 2.2).toFixed(2)}s`}
              begin={`-${(rnd() * 2).toFixed(2)}s`}
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              calcMode="discrete"
              values={`0 0;${(1 + rnd() * 2).toFixed(1)} 0;0 0;${(-1 - rnd() * 2).toFixed(1)} ${(rnd() * 1.5).toFixed(1)};0 0`}
              dur={`${(1.3 + rnd() * 2.5).toFixed(2)}s`}
              begin={`-${(rnd() * 3).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </>
        )
        if (kind < 0.4) {
          const s = 2 + rnd() * 5
          els.push(
            <rect key={i} x={cx} y={cy} width={s} height={s} fill="#fff" opacity={op}>
              {glitch}
            </rect>
          )
        } else if (kind < 0.75) {
          els.push(
            <rect key={i} x={cx} y={cy} width={4 + rnd() * 14} height={3 + rnd() * 10} {...stroke} opacity={op}>
              {glitch}
            </rect>
          )
        } else {
          // right-angle elbow
          const a = 4 + rnd() * 9
          const pts =
            rnd() < 0.5
              ? `${cx},${cy} ${cx + a},${cy} ${cx + a},${cy + a}`
              : `${cx},${cy + a} ${cx},${cy} ${cx + a},${cy}`
          els.push(
            <polyline key={i} points={pts} {...stroke} opacity={op}>
              {glitch}
            </polyline>
          )
        }
      }
      break
    }
    case 'lines': {
      // Choral-pad horizontals, each voice undulating on its own slow wave
      // (spline-eased vertical drift, staggered phases — lerp, not flash).
      const rows = Math.round(3 + d * 12)
      for (let r = 0; r < rows; r++) {
        const y = ((r + 0.5) / rows) * 100 + (rnd() - 0.5) * 6
        const drift = 1.5 + rnd() * 3
        els.push(
          <line
            key={r}
            x1={0}
            y1={y - tilt / 2}
            x2={100}
            y2={y + tilt / 2}
            {...stroke}
            opacity={0.35 + rnd() * 0.5}
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
              values={`0 ${(-drift).toFixed(1)};0 ${drift.toFixed(1)};0 ${(-drift).toFixed(1)}`}
              dur={`${(3.5 + rnd() * 4).toFixed(2)}s`}
              begin={`-${(rnd() * 5).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </line>
        )
      }
      break
    }
    case 'triangles': {
      // Big, bright, unmistakable — the 2:24 "woah" marks. Each one leaps:
      // spline-eased hop with a flash at the top of the jump.
      const n = Math.round(4 + d * 18)
      for (let i = 0; i < n; i++) {
        const cx = 6 + rnd() * 88
        const cy = 20 + rnd() * 65
        const s = 6 + rnd() * 12
        const pts = `${cx},${cy - s} ${cx - s},${cy + s} ${cx + s},${cy + s}`
        const op = 0.6 + rnd() * 0.4
        const hop = 2.5 + rnd() * 4
        const dur = (1.4 + rnd() * 2.2).toFixed(2)
        const begin = `-${(rnd() * 3).toFixed(2)}s`
        const jump = (
          <>
            <animateTransform
              attributeName="transform"
              type="translate"
              calcMode="spline"
              keySplines="0.2 0 0.3 1;0.7 0 0.8 1"
              values={`0 0;0 ${(-hop).toFixed(1)};0 0`}
              dur={`${dur}s`}
              begin={begin}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values={`${op.toFixed(2)};1;${op.toFixed(2)}`}
              dur={`${dur}s`}
              begin={begin}
              repeatCount="indefinite"
            />
          </>
        )
        if (rnd() < 0.35) {
          els.push(
            <polygon key={i} points={pts} fill="#fff" opacity={op}>
              {jump}
            </polygon>
          )
        } else {
          els.push(
            <polygon key={i} points={pts} {...stroke} opacity={op}>
              {jump}
            </polygon>
          )
        }
      }
      break
    }
    case 'static': {
      // TV noise: a blizzard of tiny filled cells. density 1 ≈ overwhelming.
      // A third of the cells strobe on independent discrete clocks — enough
      // for full-field crawl without thousands of animation timelines.
      const n = Math.round(200 + d * 1400)
      for (let i = 0; i < n; i++) {
        const op = 0.2 + rnd() * 0.7
        els.push(
          <rect
            key={i}
            x={rnd() * 99}
            y={rnd() * 99}
            width={0.8 + rnd() * 1.8}
            height={0.8 + rnd() * 1.8}
            fill="#fff"
            opacity={op}
          >
            {i % 3 === 0 && (
              <animate
                attributeName="opacity"
                calcMode="discrete"
                values={`${op.toFixed(2)};0;${op.toFixed(2)};${(op * 0.3).toFixed(2)};${op.toFixed(2)}`}
                keyTimes="0;0.2;0.4;0.7;0.85"
                dur={`${(0.4 + rnd() * 1).toFixed(2)}s`}
                begin={`-${(rnd() * 1.5).toFixed(2)}s`}
                repeatCount="indefinite"
              />
            )}
          </rect>
        )
      }
      break
    }
    case 'fish': {
      // Little almond-bodied fish with a tail wedge. Each fish swims its own
      // lap — eased forward glide with a gentle vertical wander.
      const n = Math.round(2 + d * 10)
      for (let i = 0; i < n; i++) {
        const cx = 10 + rnd() * 80
        const cy = 12 + rnd() * 76
        const s = 4 + rnd() * 5
        const dir = rnd() < 0.5 ? 1 : -1 // 1 = nose to the right
        const nose = cx + dir * s
        const tail = cx - dir * s
        const tailTip = cx - dir * s * 1.7
        const body = `M ${tail} ${cy} Q ${cx} ${cy - s * 0.6} ${nose} ${cy} Q ${cx} ${cy + s * 0.6} ${tail} ${cy}`
        const op = 0.4 + rnd() * 0.5
        const swim = (dir * (8 + rnd() * 12)).toFixed(1)
        const bob = ((rnd() - 0.5) * 5).toFixed(1)
        els.push(
          <g key={i} opacity={op}>
            <path d={body} {...stroke} />
            <polyline
              points={`${tailTip},${cy - s * 0.5} ${tail},${cy} ${tailTip},${cy + s * 0.5}`}
              {...stroke}
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
              values={`0 0;${swim} ${bob};0 0`}
              dur={`${(4 + rnd() * 5).toFixed(2)}s`}
              begin={`-${(rnd() * 6).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </g>
        )
      }
      break
    }
    case 'coral': {
      // Branches growing up from the seabed, each swaying in the current —
      // eased rotation anchored at its own root, like kelp.
      const n = Math.round(5 + d * 18)
      for (let i = 0; i < n; i++) {
        const x0 = rnd() * 100
        let x = x0
        let y = 100
        const pts = [`${x},${y}`]
        const segs = 3 + Math.floor(rnd() * 3)
        for (let s = 0; s < segs; s++) {
          x += (rnd() - 0.5) * 14
          y -= 10 + rnd() * 18
          pts.push(`${x},${y}`)
        }
        const op = 0.4 + rnd() * 0.5
        const lean = (1.5 + rnd() * 2.5).toFixed(1)
        els.push(
          <g key={i} opacity={op}>
            <polyline points={pts.join(' ')} {...stroke} />
            {rnd() < 0.5 && <circle cx={x} cy={y - 2} r={1.5 + rnd() * 2} fill="#fff" />}
            <animateTransform
              attributeName="transform"
              type="rotate"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
              values={`${-lean} ${x0.toFixed(1)} 100;${lean} ${x0.toFixed(1)} 100;${-lean} ${x0.toFixed(1)} 100`}
              dur={`${(3.5 + rnd() * 4).toFixed(2)}s`}
              begin={`-${(rnd() * 5).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </g>
        )
      }
      break
    }
    case 'fallingStars': {
      // Dots of different sizes twinkling like stars — then the whole sky
      // falls to the ground at once, rests, and resets. 8s shared cycle:
      // hold ~4.4s, gravity fall (ease-in), lie on the ground, snap back up.
      const n = Math.round(10 + d * 60)
      const CYCLE = '8s'
      for (let i = 0; i < n; i++) {
        const cx = rnd() * 100
        const cy = 4 + rnd() * 80
        const r0 = 0.8 + rnd() * 2.6
        const op = 0.35 + rnd() * 0.6
        els.push(
          <circle key={i} cx={cx} cy={cy} r={r0} fill="#fff" opacity={op}>
            <animate
              attributeName="cy"
              calcMode="spline"
              keySplines="0 0 1 1;0.55 0 1 0.45;0 0 1 1;0 0 1 1"
              values={`${cy.toFixed(1)};${cy.toFixed(1)};${(98 - r0).toFixed(1)};${(98 - r0).toFixed(1)};${cy.toFixed(1)}`}
              keyTimes="0;0.55;0.75;0.97;1"
              dur={CYCLE}
              begin="0s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values={`${op.toFixed(2)};${(op * 0.15).toFixed(2)};${op.toFixed(2)}`}
              dur={`${(0.8 + rnd() * 2.4).toFixed(2)}s`}
              begin={`-${(rnd() * 3).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </circle>
        )
      }
      break
    }
    case 'morphline': {
      // One horizontal line ~1/3 up from the bottom that morphs: straight →
      // sine wave → triangle wave → back, on a slow loop. SMIL interpolates
      // between point lists of equal length, so all three shapes sample the
      // same x positions. density nudges the wave frequency.
      const BASE = 67 // 0.33 up from the bottom of the 100-unit box
      const AMP = 14
      const cycles = 2 + Math.round(d * 2)
      const N = 96
      const flat = []
      const sine = []
      const tri = []
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * 100
        const p = (i / N) * cycles // phase in periods
        flat.push(`${x.toFixed(1)},${BASE}`)
        sine.push(`${x.toFixed(1)},${(BASE - AMP * Math.sin(p * Math.PI * 2)).toFixed(1)}`)
        // triangle wave, same period + amplitude, -1..1
        const t = 4 * Math.abs(p - Math.floor(p + 0.5)) - 1
        tri.push(`${x.toFixed(1)},${(BASE - AMP * t).toFixed(1)}`)
      }
      const F = flat.join(' ')
      const S = sine.join(' ')
      const T = tri.join(' ')
      els.push(
        <polyline key="morph" points={F} {...stroke} strokeWidth={3} opacity={0.9}>
          <animate
            attributeName="points"
            calcMode="spline"
            keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
            values={`${F};${S};${T};${S};${F}`}
            keyTimes="0;0.28;0.5;0.72;1"
            dur="12s"
            repeatCount="indefinite"
          />
        </polyline>
      )
      break
    }
    case 'dashes': {
      // Deep space: horizontal dashes of different lengths drifting at
      // different speeds — parallax starfield, plus the odd slow twinkle.
      const n = Math.round(3 + d * 26)
      for (let i = 0; i < n; i++) {
        const x = rnd() * 82
        const y = 6 + rnd() * 88
        const len = 3 + rnd() * 18
        const op = 0.3 + rnd() * 0.6
        const drift = ((rnd() - 0.5) * 14).toFixed(1)
        els.push(
          <line key={i} x1={x} y1={y} x2={x + len} y2={y} {...stroke} opacity={op}>
            <animateTransform
              attributeName="transform"
              type="translate"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
              values={`0 0;${drift} 0;0 0`}
              dur={`${(6 + rnd() * 8).toFixed(2)}s`}
              begin={`-${(rnd() * 10).toFixed(2)}s`}
              repeatCount="indefinite"
            />
            {rnd() < 0.4 && (
              <animate
                attributeName="opacity"
                values={`${op.toFixed(2)};${(op * 0.25).toFixed(2)};${op.toFixed(2)}`}
                dur={`${(3 + rnd() * 4).toFixed(2)}s`}
                begin={`-${(rnd() * 5).toFixed(2)}s`}
                repeatCount="indefinite"
              />
            )}
          </line>
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
  // Crossfade support (lalork#7): patches may overlap in time; fadeIn/fadeOut
  // are fractions of the patch width over which alpha ramps from/to zero,
  // done with a horizontal gradient mask so marks dissolve mid-stroke.
  // Patch-level opacity ALSO rides the mask (not the element's opacity)
  // because the anim keyframes animate element opacity and would stomp it.
  const alpha = patch.opacity == null ? 1 : clamp01(patch.opacity)
  const fadeIn = clamp01(patch.fadeIn ?? 0)
  const fadeOut = clamp01(patch.fadeOut ?? 0)
  const solid = alpha < 1 ? `rgba(0,0,0,${alpha})` : 'black'
  const mask =
    fadeIn > 0 || fadeOut > 0 || alpha < 1
      ? `linear-gradient(to right, transparent 0%, ${solid} ${(fadeIn * 100).toFixed(1)}%, ${solid} ${((1 - fadeOut) * 100).toFixed(1)}%, transparent 100%)`
      : null
  return (
    <svg
      className={`portal__patch${
        patch.anim ? ` portal__patch--${patch.anim}` : ''
      }`}
      style={{
        left: `${clamp01(patch.x) * 100}%`,
        width: `${clamp01(patch.w) * 100}%`,
        height: `${h * 100}%`,
        ...(mask ? { WebkitMaskImage: mask, maskImage: mask } : null),
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
        {textureMarks(
          patch.texture ?? 'stipple',
          patch.density ?? 0.5,
          patch.seed ?? 1,
          patch.tilt ?? 0
        )}
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
