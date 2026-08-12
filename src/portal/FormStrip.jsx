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

import { useEffect, useId, useRef, useState } from 'react'

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
function textureMarks(texture, density, seed, tilt = 0, aspect = 1) {
  const rnd = makeRng(seed)
  const d = clamp01(density)
  const els = []
  // Aspect compensation: the patch SVG stretches non-uniformly (preserve-
  // AspectRatio="none"), which squashes pictorial shapes. Shapes that must
  // read true (moon, clouds, stars, rook) are drawn round in user space and
  // pre-compressed horizontally about their own center; the viewBox stretch
  // then undoes the compression and they render round in pixels.
  const xs = 1 / Math.max(aspect, 0.0001)
  const unsquish = (cx) =>
    `translate(${cx.toFixed(2)} 0) scale(${xs.toFixed(4)} 1) translate(${(-cx).toFixed(2)} 0)`
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
    case 'thread': {
      // The Watcher's Thread (Wagner): one thin persistent line at a height
      // encoding the current common tone (`tilt` = y, patch units from the
      // top). Ghost-faint (~0.1) and alive: it morphs straight -> sine ->
      // triangle -> square -> pulse -> straight on a slow loop. SMIL
      // interpolates between equal-length point lists, so all waveforms
      // sample the same x positions; square/pulse jumps become steep
      // near-vertical segments, which reads exactly like a scope trace.
      const y = tilt || 50
      const AMP = 5
      const cycles = 3
      const N = 96
      const flat = []
      const sine = []
      const tri = []
      const sq = []
      const pulse = []
      for (let i = 0; i <= N; i++) {
        const x = ((i / N) * 100).toFixed(1)
        const p = (i / N) * cycles
        const sv = Math.sin(p * Math.PI * 2)
        const tv = 4 * Math.abs(p - Math.floor(p + 0.5)) - 1
        const qv = sv >= 0 ? 1 : -1
        const pv = p - Math.floor(p) < 0.18 ? 1 : -1
        flat.push(`${x},${y}`)
        sine.push(`${x},${(y - AMP * sv).toFixed(1)}`)
        tri.push(`${x},${(y - AMP * tv).toFixed(1)}`)
        sq.push(`${x},${(y - AMP * qv).toFixed(1)}`)
        pulse.push(`${x},${(y - AMP * pv).toFixed(1)}`)
      }
      const F = flat.join(' ')
      els.push(
        <polyline key="thread" points={F} {...stroke} opacity={0.1}>
          <animate
            attributeName="points"
            calcMode="spline"
            keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
            values={`${F};${sine.join(' ')};${tri.join(' ')};${sq.join(' ')};${pulse.join(' ')};${F}`}
            keyTimes="0;0.2;0.4;0.6;0.8;1"
            dur={`${(26 + rnd() * 10).toFixed(1)}s`}
            begin={`-${(rnd() * 30).toFixed(1)}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.12;0.06;0.12"
            dur={`${(5 + rnd() * 4).toFixed(2)}s`}
            begin={`-${(rnd() * 5).toFixed(2)}s`}
            repeatCount="indefinite"
          />
        </polyline>
      )
      break
    }
    case 'moon': {
      // Crescent moon, upper sky: outer arc + wider inner return arc. Slow
      // glow pulse and a barely perceptible drift across the night.
      const cx = 58 + rnd() * 10
      const cy = 22 + rnd() * 12
      const r = 11 + d * 9
      // Inner return arc only slightly larger than the outer radius: the
      // closer it is to r, the deeper the scoop. 1.05 leaves a thin waist
      // (~0.27r) — a true crescent, not an upper-case D.
      const crescent = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r * 1.05} ${r * 1.05} 0 0 0 ${cx} ${cy - r} Z`
      els.push(
        // 2x horizontal stretch on top of the aspect compensation (Nathan's
        // call): wide crescent, same height.
        <g
          key="moon"
          transform={`translate(${cx.toFixed(2)} 0) scale(${(2 * xs).toFixed(4)} 1) translate(${(-cx).toFixed(2)} 0)`}
        >
          <path d={crescent} {...stroke} opacity={0.85}>
            <animate
              attributeName="opacity"
              values="0.85;0.6;0.85"
              dur={`${(7 + rnd() * 4).toFixed(2)}s`}
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
              values="-2 0;2 0.8;-2 0"
              dur="40s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )
      break
    }
    case 'clouds': {
      // Puffy, super simple clouds: one closed bumpy OUTLINE per cloud (no
      // fill) — sample points around a wide ellipse with radius jitter, join
      // them with outward-bulging arcs. Dissolving is the patch's fadeOut:
      // night sky giving way to the stars.
      const n = Math.round(2 + d * 4)
      for (let i = 0; i < n; i++) {
        // Even horizontal slots (one cloud per lane, small jitter) so they
        // spread across the sky instead of bunching, and a big slow
        // left-right sail so the drift actually reads.
        const cx = ((i + 0.25 + rnd() * 0.5) / n) * 100
        const cy = 14 + rnd() * 24 // upper sky — clouds ride the top of the cell
        const ry = 9 + rnd() * 8
        const rx = ry * (2.0 + rnd() * 0.8)
        const op = 0.5 + rnd() * 0.35
        const drift = (14 + rnd() * 16) * (rnd() < 0.5 ? 1 : -1)
        const bumps = 9 + Math.floor(rnd() * 4)
        const pts = []
        for (let k = 0; k < bumps; k++) {
          const a = (k / bumps) * Math.PI * 2
          const jit = 0.8 + rnd() * 0.35
          pts.push([cx + Math.cos(a) * rx * jit, cy + Math.sin(a) * ry * jit])
        }
        let dPath = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
        for (let k = 1; k <= bumps; k++) {
          const [px, py] = pts[k - 1]
          const [x, y] = pts[k % bumps]
          const r = Math.hypot(x - px, y - py) * 0.62
          dPath += ` A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`
        }
        dPath += ' Z'
        els.push(
          <g key={i} transform={unsquish(cx)} opacity={op}>
            <path d={dPath} {...stroke}>
              <animateTransform
                attributeName="transform"
                type="translate"
                calcMode="spline"
                keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
                values={`${(-drift).toFixed(1)} 0;${drift.toFixed(1)} 0;${(-drift).toFixed(1)} 0`}
                dur={`${(10 + rnd() * 10).toFixed(2)}s`}
                begin={`-${(rnd() * 12).toFixed(2)}s`}
                repeatCount="indefinite"
              />
            </path>
          </g>
        )
      }
      break
    }
    case 'stars': {
      // Actual star polygons — pentagrams and heptagrams — twinkling, some
      // rotating almost imperceptibly. D&D fantasy night sky.
      // supralinear top end: ambient patches (d~0.35) stay sparse (~9),
      // d=1.0 = a packed night sky (~52 stars in one box)
      const n = Math.round(4 + d * 14 + Math.pow(d, 8) * 34)
      for (let i = 0; i < n; i++) {
        const cx = 4 + rnd() * 92
        const cy = 6 + rnd() * 80
        const spikes = rnd() < 0.6 ? 5 : 7
        const R = 2 + rnd() * 4.5
        const rIn = R * 0.42
        const rot0 = rnd() * Math.PI
        const pts = []
        for (let k = 0; k < spikes * 2; k++) {
          const rad = k % 2 === 0 ? R : rIn
          const a = rot0 + (k * Math.PI) / spikes
          pts.push(`${(cx + rad * Math.sin(a)).toFixed(1)},${(cy - rad * Math.cos(a)).toFixed(1)}`)
        }
        const op = 0.35 + rnd() * 0.6
        const filled = rnd() < 0.4
        els.push(
          <g key={i} transform={unsquish(cx)}>
            <polygon
              points={pts.join(' ')}
              {...(filled ? { fill: '#fff' } : stroke)}
              {...(filled ? {} : { strokeWidth: 1.5 })}
              opacity={op}
            >
              <animate
                attributeName="opacity"
                values={`${op.toFixed(2)};${(op * 0.2).toFixed(2)};${op.toFixed(2)}`}
                dur={`${(2 + rnd() * 4).toFixed(2)}s`}
                begin={`-${(rnd() * 4).toFixed(2)}s`}
                repeatCount="indefinite"
              />
              {rnd() < 0.5 && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values={`0 ${cx.toFixed(1)} ${cy.toFixed(1)};360 ${cx.toFixed(1)} ${cy.toFixed(1)}`}
                  dur={`${(25 + rnd() * 30).toFixed(0)}s`}
                  repeatCount="indefinite"
                />
              )}
            </polygon>
          </g>
        )
      }
      break
    }
    case 'bell': {
      // A bell strike: expanding concentric rings blooming from one point,
      // sfz -> pp (ring grows as it fades), staggered echoes. Watchtower.
      const cx = 30 + rnd() * 40
      const cy = 35 + rnd() * 25
      const rings = 3
      const CYCLE = 4.5
      for (let i = 0; i < rings; i++) {
        els.push(
          <circle key={i} cx={cx} cy={cy} r={4} {...stroke} strokeWidth={2.5} opacity={0}>
            <animate
              attributeName="r"
              calcMode="spline"
              keySplines="0.2 0 0.4 1"
              values={`4;${(30 + d * 24).toFixed(0)}`}
              dur={`${CYCLE}s`}
              begin={`${(i * 0.7).toFixed(1)}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.95;0"
              keyTimes="0;0.08;1"
              dur={`${CYCLE}s`}
              begin={`${(i * 0.7).toFixed(1)}s`}
              repeatCount="indefinite"
            />
          </circle>
        )
      }
      els.push(<circle key="clapper" cx={cx} cy={cy} r={1.6} fill="#fff" opacity={0.9} />)
      break
    }
    case 'frost': {
      // Quiet-but-glassy: tiny glitter pinned to the TOP of the strip while
      // the contour lies on the floor. High, cold, faint.
      const n = Math.round(40 + d * 120)
      for (let i = 0; i < n; i++) {
        const op = 0.25 + rnd() * 0.55
        els.push(
          <circle key={i} cx={rnd() * 100} cy={rnd() * 26} r={0.5 + rnd() * 1} fill="#fff" opacity={op}>
            <animate
              attributeName="opacity"
              values={`${op.toFixed(2)};${(op * 0.1).toFixed(2)};${op.toFixed(2)}`}
              dur={`${(0.7 + rnd() * 1.6).toFixed(2)}s`}
              begin={`-${(rnd() * 2).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </circle>
        )
      }
      break
    }
    case 'rook': {
      // Chess rook / watchtower, outline only — Brangäne's post. Stands on
      // the floor of the patch, crenellated top, still except for a slow
      // watchfire breathe. density scales the tower. Sits right-of-center
      // in its box (right of the moon it watches).
      const cx = 66 + rnd() * 24
      const s = 0.75 + d * 0.45
      const P = [
        [-18, 100], [-18, 90], [-12, 84], [-12, 40], [-18, 40], [-18, 22],
        [-11, 22], [-11, 29], [-4, 29], [-4, 22], [4, 22], [4, 29],
        [11, 29], [11, 22], [18, 22], [18, 40], [12, 40], [12, 84],
        [18, 90], [18, 100],
      ]
      const dPath =
        P.map(
          ([lx, ly], k) =>
            `${k === 0 ? 'M' : 'L'} ${(cx + lx * s).toFixed(1)} ${(100 - (100 - ly) * s).toFixed(1)}`
        ).join(' ') + ' Z'
      els.push(
        <g key="rook" transform={unsquish(cx)}>
          <path d={dPath} {...stroke} opacity={0.8}>
            <animate
              attributeName="opacity"
              values="0.8;0.55;0.8"
              dur={`${(8 + rnd() * 5).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </path>
        </g>
      )
      break
    }
    case 'wisps': {
      // Will-o'-wisps: glowing lights that TRAVEL on slow meandering loops
      // (every other dot texture twinkles in place). The dream of love as
      // lights that lead astray; each pulse a harp pluck.
      // density is a count knob with a supralinear top end: d=0.2 ~ 7
      // ambient lights, d=1.0 = MAXIMUM OVERDRIVE (~140 wisps in one box)
      const n = Math.round(2 + d * 26 + Math.pow(d, 8) * 112)
      for (let i = 0; i < n; i++) {
        const x0 = 10 + rnd() * 80
        const y0 = 22 + rnd() * 56
        const w1x = (rnd() - 0.5) * 56
        const w1y = (rnd() - 0.5) * 40
        const w2x = (rnd() - 0.5) * 56
        const w2y = (rnd() - 0.5) * 40
        const path =
          `M ${x0.toFixed(1)} ${y0.toFixed(1)} ` +
          `C ${(x0 + w1x).toFixed(1)} ${(y0 + w1y).toFixed(1)}, ${(x0 + w2x).toFixed(1)} ${(y0 + w1y).toFixed(1)}, ${(x0 + w2x * 0.6).toFixed(1)} ${(y0 + w2y).toFixed(1)} ` +
          `C ${(x0 + w2x * 0.2).toFixed(1)} ${(y0 + w2y * 0.5).toFixed(1)}, ${(x0 - w1x * 0.5).toFixed(1)} ${(y0 - w1y * 0.6).toFixed(1)}, ${x0.toFixed(1)} ${y0.toFixed(1)}`
        const op = 0.5 + rnd() * 0.4
        els.push(
          <g key={i} opacity={op}>
            {/* circles ride at the group origin; the scale-only wrap keeps
                them round after the viewBox stretch */}
            <g transform={`scale(${xs.toFixed(4)} 1)`}>
              <circle cx={0} cy={0} r={4} fill="#fff" opacity={0.22} />
              <circle cx={0} cy={0} r={1.5} fill="#fff" />
            </g>
            <animate
              attributeName="opacity"
              values={`${op.toFixed(2)};${(op * 0.25).toFixed(2)};${op.toFixed(2)}`}
              dur={`${(2 + rnd() * 2.5).toFixed(2)}s`}
              begin={`-${(rnd() * 3).toFixed(2)}s`}
              repeatCount="indefinite"
            />
            <animateMotion
              path={path}
              dur={`${(16 + rnd() * 16).toFixed(1)}s`}
              begin={`-${(rnd() * 20).toFixed(1)}s`}
              repeatCount="indefinite"
            />
          </g>
        )
      }
      break
    }
    case 'comet': {
      // One shooting star, unmissable: a heptagram ({7/3} star polygon)
      // head with a long three-strand tail, dark most of the loop, then a
      // slow bright streak down through the box. "lacht".
      const DUR = 10
      const x0 = 12 + rnd() * 30
      const dx = 30 + rnd() * 18
      const dy = 130
      const len = Math.hypot(dx, dy)
      const ux = dx / len
      const uy = dy / len
      const TAIL = 46
      const R = 7
      const hp = []
      for (let k = 0; k < 7; k++) {
        // connect every 3rd vertex of a heptagon = unicursal {7/3} star
        const a = ((k * 3) % 7) * ((Math.PI * 2) / 7) - Math.PI / 2
        hp.push(`${(R * Math.cos(a)).toFixed(2)},${(R * Math.sin(a)).toFixed(2)}`)
      }
      els.push(
        <g key="comet" opacity={0}>
          <line
            x1={(-ux * TAIL).toFixed(1)}
            y1={(-uy * TAIL).toFixed(1)}
            x2={0}
            y2={0}
            {...stroke}
            strokeWidth={2.5}
            opacity={0.85}
          />
          <line
            x1={(-ux * TAIL * 0.72 - uy * 4).toFixed(1)}
            y1={(-uy * TAIL * 0.72 + ux * 4).toFixed(1)}
            x2={0}
            y2={0}
            {...stroke}
            strokeWidth={1.5}
            opacity={0.5}
          />
          <line
            x1={(-ux * TAIL * 0.72 + uy * 4).toFixed(1)}
            y1={(-uy * TAIL * 0.72 - ux * 4).toFixed(1)}
            x2={0}
            y2={0}
            {...stroke}
            strokeWidth={1.5}
            opacity={0.5}
          />
          <g transform={`scale(${xs.toFixed(4)} 1)`}>
            <polygon points={hp.join(' ')} fill="#fff" fillRule="evenodd" opacity={0.95} />
            <polygon points={hp.join(' ')} {...stroke} strokeWidth={1.5} />
          </g>
          <animate
            attributeName="opacity"
            values="0;0;1;1;0"
            keyTimes="0;0.72;0.75;0.95;1"
            dur={`${DUR}s`}
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            values={`${x0.toFixed(0)} -20;${x0.toFixed(0)} -20;${(x0 + dx).toFixed(0)} ${dy - 20}`}
            keyTimes="0;0.72;1"
            dur={`${DUR}s`}
            repeatCount="indefinite"
          />
        </g>
      )
      break
    }
    case 'briar': {
      // A thorned vine drawing itself left → right (stroke-dashoffset),
      // thorns popping in as the tip passes them. Growth = the crescendo
      // (gesteigert). Regrows each loop — quick draw (~6s), long hold.
      const DUR = 14
      const GROW = 0.45
      const segs = 9 + Math.round(d * 5)
      const pts = []
      for (let k = 0; k <= segs; k++) {
        const x = 2 + (k / segs) * 96
        const y = 55 + Math.sin(k * 1.9) * 15 + (rnd() - 0.5) * 12
        pts.push([x, y])
      }
      let vine = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
      for (let k = 1; k < segs; k++) {
        const mx = (pts[k][0] + pts[k + 1][0]) / 2
        const my = (pts[k][1] + pts[k + 1][1]) / 2
        vine += ` Q ${pts[k][0].toFixed(1)} ${pts[k][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
      }
      els.push(
        <path
          key="vine"
          d={vine}
          {...stroke}
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100}
          opacity={0.85}
        >
          <animate
            attributeName="stroke-dashoffset"
            values="100;0;0"
            keyTimes={`0;${GROW};1`}
            dur={`${DUR}s`}
            repeatCount="indefinite"
          />
        </path>
      )
      for (let k = 1; k < segs; k++) {
        const [x, y] = pts[k]
        const up = k % 2 === 0 ? -1 : 1
        const t = (k / segs) * GROW
        // long hooked thorn: curves out and away from the vine
        const L = 12 + rnd() * 6
        const thorn = `M ${x.toFixed(1)} ${y.toFixed(1)} Q ${(x + 2).toFixed(1)} ${(y + up * L * 0.55).toFixed(1)} ${(x + 5.5).toFixed(1)} ${(y + up * L).toFixed(1)}`
        els.push(
          <path
            key={`th${k}`}
            d={thorn}
            {...stroke}
            strokeWidth={1.5}
            opacity={0}
          >
            <animate
              attributeName="opacity"
              values="0;0;0.9;0.9"
              keyTimes={`0;${t.toFixed(3)};${Math.min(t + 0.04, 1).toFixed(3)};1`}
              dur={`${DUR}s`}
              repeatCount="indefinite"
            />
          </path>
        )
      }
      break
    }
    case 'sleepers': {
      // Sleeping eyes in PAIRS — two eyes to a sleeper, and each pair
      // always opens/closes TOGETHER. Once per loop a pair snaps open for
      // a moment — "Schlimmes": dread as eyes opening in the dark. Pairs
      // are staggered so at most one face wakes at a time.
      const DUR = 16
      const T0 = 0.7
      const T1 = 0.82
      const nPairs = Math.max(1, Math.round(1 + d * 1.6))
      for (let p = 0; p < nPairs; p++) {
        const pcx = Number((14 + ((p + 0.5) / nPairs) * 72 + (rnd() - 0.5) * 6).toFixed(1))
        const ey = Number((52 + rnd() * 14).toFixed(1))
        const w = 10
        const beginOff = `-${(p * 6.1 + rnd()).toFixed(1)}s`
        const eyeXs = [pcx - 14, pcx + 14]
        const lids = eyeXs.map((ex, i) => (
          <g key={i}>
            <path
              d={`M ${(ex - w).toFixed(1)} ${ey} Q ${ex.toFixed(1)} ${(ey + 8).toFixed(1)} ${(ex + w).toFixed(1)} ${ey}`}
              {...stroke}
            />
            <line x1={ex - 5} y1={ey + 5.5} x2={ex - 7} y2={ey + 10} {...stroke} strokeWidth={1.5} />
            <line x1={ex} y1={ey + 7.5} x2={ex} y2={ey + 12} {...stroke} strokeWidth={1.5} />
            <line x1={ex + 5} y1={ey + 5.5} x2={ex + 7} y2={ey + 10} {...stroke} strokeWidth={1.5} />
          </g>
        ))
        const opens = eyeXs.map((ex, i) => (
          <g key={i}>
            <path
              d={`M ${(ex - w).toFixed(1)} ${ey} Q ${ex.toFixed(1)} ${(ey - 8).toFixed(1)} ${(ex + w).toFixed(1)} ${ey} Q ${ex.toFixed(1)} ${(ey + 8).toFixed(1)} ${(ex - w).toFixed(1)} ${ey} Z`}
              {...stroke}
            />
            <circle cx={ex} cy={ey} r={2.4} fill="#fff" />
          </g>
        ))
        els.push(
          // outer g = aspect compensation only; the breathe translate lives
          // on an inner g (animateTransform REPLACES a static transform, so
          // they must not share an element)
          <g key={p} transform={unsquish(pcx)} opacity={0.85}>
            <g>
              <g>
                {lids}
                <animate
                  attributeName="opacity"
                  calcMode="discrete"
                  values="1;0;1"
                  keyTimes={`0;${T0};${T1}`}
                  dur={`${DUR}s`}
                  begin={beginOff}
                  repeatCount="indefinite"
                />
              </g>
              <g opacity={0}>
                {opens}
                <animate
                  attributeName="opacity"
                  calcMode="discrete"
                  values="0;1;0"
                  keyTimes={`0;${T0};${T1}`}
                  dur={`${DUR}s`}
                  begin={beginOff}
                  repeatCount="indefinite"
                />
              </g>
              <animateTransform
                attributeName="transform"
                type="translate"
                calcMode="spline"
                keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
                values="0 -1;0 1;0 -1"
                dur={`${(5 + rnd() * 3).toFixed(2)}s`}
                begin={`-${(rnd() * 4).toFixed(2)}s`}
                repeatCount="indefinite"
              />
            </g>
          </g>
        )
      }
      break
    }
    case 'runes': {
      // Angular sigils fading in one at a time and HOLDING (fill=freeze) —
      // the unbroken common-tone chain made visible. "ahnt". Neutral
      // letters only: fehu, uruz, raido, kenaz, gebo, wunjo.
      const RUNES = [
        [[[0, 16], [0, 0]], [[0, 3], [8, 0]], [[0, 9], [8, 5]]], // fehu
        [[[0, 16], [0, 0], [8, 6], [8, 16]]], // uruz
        [[[0, 16], [0, 0]], [[0, 0], [7, 4], [0, 8]], [[0, 8], [8, 16]]], // raido
        [[[6, 0], [0, 8], [6, 16]]], // kenaz (torch)
        [[[0, 0], [8, 16]], [[8, 0], [0, 16]]], // gebo
        [[[0, 16], [0, 0]], [[0, 0], [7, 4], [0, 8]]], // wunjo
      ]
      // Set like TYPE, not scribbles: uniform size, one shared baseline,
      // even letter advance across the box. Letters still carve themselves
      // in one at a time and hold — an inscription being written.
      const n = Math.round(5 + d * 5)
      const s = 1.7
      // tilt picks the baseline row (default 34): glyphs run
      // capTop .. capTop + 16*s, so a second patch with tilt ~62 sets a
      // second line of type under the first. The second row waits for the
      // first row to finish carving before it starts.
      const capTop = tilt || 34
      const startDelay = tilt && tilt > 34 ? 26 : 1.5
      for (let i = 0; i < n; i++) {
        const shape = RUNES[Math.floor(rnd() * RUNES.length) % RUNES.length]
        const cx = 4 + ((i + 0.5) / n) * 92
        const op = 0.75 + rnd() * 0.2
        els.push(
          <g key={i} transform={unsquish(cx)} opacity={0}>
            {shape.map((poly, j) => (
              <polyline
                key={j}
                points={poly
                  .map(([lx, ly]) => `${(cx + (lx - 4) * s).toFixed(1)},${(capTop + ly * s).toFixed(1)}`)
                  .join(' ')}
                {...stroke}
              />
            ))}
            <animate
              attributeName="opacity"
              values={`0;${op.toFixed(2)}`}
              begin={`${(startDelay + i * 2.2).toFixed(1)}s`}
              dur="2s"
              fill="freeze"
            />
          </g>
        )
      }
      break
    }
    case 'lantern': {
      // The Hermit's lantern, BIG: outline cage with a 3x3 window-pane
      // grid, peaked cap, ring handle, glowing flickering flame. "Einsam
      // wachend" — the lone watcher's light. Stands on the floor, dead
      // center of its box.
      const cx = 50
      const s = 0.55 + d * 0.3
      const lift = 20 // raised off the floor — hangs higher in the box
      const X = (lx) => Number((cx + lx * s).toFixed(1))
      const Y = (ly) => Number((100 - (100 - ly) * s - lift).toFixed(1))
      const body = `M ${X(-13)} ${Y(90)} L ${X(-13)} ${Y(54)} Q ${X(-13)} ${Y(48)} ${X(-7)} ${Y(48)} L ${X(7)} ${Y(48)} Q ${X(13)} ${Y(48)} ${X(13)} ${Y(54)} L ${X(13)} ${Y(90)} Z`
      const cap = `M ${X(-10)} ${Y(48)} L ${X(0)} ${Y(36)} L ${X(10)} ${Y(48)}`
      els.push(
        <g key="lantern" transform={unsquish(cx)} opacity={0.95}>
          {/* window mullions: 2 vertical + 2 horizontal = 3x3 panes */}
          <line x1={X(-4.5)} y1={Y(49)} x2={X(-4.5)} y2={Y(89)} {...stroke} strokeWidth={1.6} />
          <line x1={X(4.5)} y1={Y(49)} x2={X(4.5)} y2={Y(89)} {...stroke} strokeWidth={1.6} />
          <line x1={X(-13)} y1={Y(62)} x2={X(13)} y2={Y(62)} {...stroke} strokeWidth={1.6} />
          <line x1={X(-13)} y1={Y(76)} x2={X(13)} y2={Y(76)} {...stroke} strokeWidth={1.6} />
          <path d={body} {...stroke} />
          <path d={cap} {...stroke} />
          {/* ring handle */}
          <circle cx={X(0)} cy={Y(28)} r={7 * s} {...stroke} />
          {/* ground line */}
          <line x1={X(-18)} y1={Y(96)} x2={X(18)} y2={Y(96)} {...stroke} />
          {/* flame: soft glow + bright core, fast flicker */}
          <circle cx={X(0)} cy={Y(69)} r={9.5 * s} fill="#fff" opacity={0.25}>
            <animate
              attributeName="opacity"
              values="0.25;0.1;0.22;0.08;0.25"
              dur={`${(1.6 + rnd()).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </circle>
          <circle cx={X(0)} cy={Y(69)} r={5 * s} fill="#fff" opacity={0.95}>
            <animate
              attributeName="opacity"
              values="0.95;0.5;0.85;0.45;0.95"
              dur={`${(1.6 + rnd()).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </circle>
          {/* light rays emanating outward: radial lines that expand and
              fade in a repeating pulse, centered on the flame */}
          <g transform={`translate(${X(0)} ${Y(69)})`}>
            <g>
              {Array.from({ length: 8 }, (_, k) => {
                const a = (k / 8) * Math.PI * 2 - Math.PI / 2
                const r1 = 17 * s
                const r2 = 40 * s
                return (
                  <line
                    key={`ray-${k}`}
                    x1={(Math.cos(a) * r1).toFixed(1)}
                    y1={(Math.sin(a) * r1).toFixed(1)}
                    x2={(Math.cos(a) * r2).toFixed(1)}
                    y2={(Math.sin(a) * r2).toFixed(1)}
                    {...stroke}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                )
              })}
              <animateTransform
                attributeName="transform"
                type="scale"
                values="0.7;1.35"
                dur="2.4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.85;0"
                dur="2.4s"
                repeatCount="indefinite"
              />
            </g>
          </g>
          <animate
            attributeName="opacity"
            values="0.95;0.8;0.95"
            dur={`${(9 + rnd() * 4).toFixed(2)}s`}
            repeatCount="indefinite"
          />
        </g>
      )
      break
    }
    case 'rose': {
      // A small rose high in the box, seen from above: a scalloped ring of
      // petals around an inward spiral bloom. Gentle glow-breathe only —
      // it just appears, quietly, at the top.
      const cx = 40 + rnd() * 20
      const cy = 16
      const R = 7 + d * 5
      const petals = 5
      const opts = []
      for (let k = 0; k < petals; k++) {
        const a = (k / petals) * Math.PI * 2 - Math.PI / 2
        opts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R])
      }
      let outline = `M ${opts[0][0].toFixed(1)} ${opts[0][1].toFixed(1)}`
      for (let k = 1; k <= petals; k++) {
        const [x, y] = opts[k % petals]
        outline += ` A ${(R * 0.75).toFixed(1)} ${(R * 0.75).toFixed(1)} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`
      }
      outline += ' Z'
      // spiral of shrinking semicircles, all the same sweep = rose heart
      const rr = [R * 0.55, R * 0.36, R * 0.2, R * 0.08]
      let spiral = `M ${(cx + rr[0]).toFixed(1)} ${cy}`
      for (let k = 0; k < rr.length - 1; k++) {
        const rMid = ((rr[k] + rr[k + 1]) / 2).toFixed(1)
        const endX = (cx + (k % 2 === 0 ? -rr[k + 1] : rr[k + 1])).toFixed(1)
        spiral += ` A ${rMid} ${rMid} 0 0 0 ${endX} ${cy}`
      }
      // stem: wiggly chain of alternating Q-bends from bloom to root crown,
      // with pointed leaves sprouting from the upper joints
      const rootY = 86
      const topY = cy + R
      const nSeg = 4
      const wig = 5 + rnd() * 2.5
      let stem = `M ${cx.toFixed(1)} ${topY.toFixed(1)}`
      const joints = []
      let py = topY
      for (let k = 0; k < nSeg; k++) {
        const ny = topY + ((k + 1) / nSeg) * (rootY - topY)
        const side = k % 2 === 0 ? 1 : -1
        const qx = cx + side * wig
        const qy = (py + ny) / 2
        const nx = k === nSeg - 1 ? cx : cx + side * wig * 0.4
        stem += ` Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`
        joints.push([nx, ny, side])
        py = ny
      }
      // leaves: pointed lens shapes off the first two joints, alternating
      // sides, tips angled slightly upward
      const leaves = joints.slice(0, 2).map(([jx, jy, side]) => {
        const L = 10 + rnd() * 3
        const tx = jx + side * L
        const ty = jy - 3 - rnd() * 2
        return (
          `M ${jx.toFixed(1)} ${jy.toFixed(1)}` +
          ` Q ${(jx + side * L * 0.45).toFixed(1)} ${(jy - 5.5).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}` +
          ` Q ${(jx + side * L * 0.5).toFixed(1)} ${(jy + 2.5).toFixed(1)} ${jx.toFixed(1)} ${jy.toFixed(1)} Z`
        )
      })
      // roots: forks spreading down-and-out from the stem base
      const roots = []
      const nRoots = 4
      for (let k = 0; k < nRoots; k++) {
        const spread = (k - (nRoots - 1) / 2) * (7 + rnd() * 3)
        const dip = 8 + rnd() * 5
        roots.push(
          `M ${cx.toFixed(1)} ${rootY} Q ${(cx + spread * 0.5).toFixed(1)} ${(rootY + dip * 0.4).toFixed(1)} ${(cx + spread).toFixed(1)} ${(rootY + dip).toFixed(1)}`
        )
      }
      els.push(
        <g key="rose" transform={unsquish(cx)} opacity={0.9}>
          <path d={outline} {...stroke} />
          <path d={spiral} {...stroke} strokeWidth={1.6} />
          <path d={stem} {...stroke} />
          {leaves.map((lf, k) => (
            <path key={`leaf-${k}`} d={lf} {...stroke} strokeWidth={1.6} />
          ))}
          {roots.map((r, k) => (
            <path key={k} d={r} {...stroke} strokeWidth={1.5} />
          ))}
          <animate
            attributeName="opacity"
            values="0.9;0.65;0.9"
            dur={`${(6 + rnd() * 4).toFixed(2)}s`}
            repeatCount="indefinite"
          />
        </g>
      )
      break
    }
    case 'semitone': {
      // The semitone of dread: two faint rungs and one bright dot that steps
      // up a half-step and back. E -> E#. "Schlimmes." Nobody will
      // consciously see it.
      const yLo = 58
      const yHi = 50
      const x0 = 38 + rnd() * 24
      els.push(
        <line key="lo" x1={x0 - 7} y1={yLo} x2={x0 + 7} y2={yLo} {...stroke} strokeWidth={1} opacity={0.3} />,
        <line key="hi" x1={x0 - 7} y1={yHi} x2={x0 + 7} y2={yHi} {...stroke} strokeWidth={1} opacity={0.3} />,
        <circle key="dot" cx={x0} cy={yLo} r={2.4} fill="#fff" opacity={0.9}>
          <animate
            attributeName="cy"
            calcMode="discrete"
            values={`${yLo};${yHi};${yLo}`}
            keyTimes="0;0.5;0.94"
            dur="7s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.9;1;0.9"
            keyTimes="0;0.5;1"
            dur="7s"
            repeatCount="indefinite"
          />
        </circle>
      )
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
    case 'rain': {
      // Foreground rain (susana_nico): long bright streaks falling straight
      // down, each drop on its own clock — continuous downpour, never a
      // group flash. The streak starts fully above the box (y in [-len, 0])
      // and translates past the bottom, so entry and exit are seamless.
      const n = Math.round(25 + d * 150)
      for (let i = 0; i < n; i++) {
        const x = rnd() * 100
        const len = 8 + rnd() * 8
        const op = 0.5 + rnd() * 0.4
        const dur = 1.6 + rnd() * 1.0
        els.push(
          <line key={i} x1={x} y1={-len} x2={x} y2={0} {...stroke} opacity={op}>
            <animateTransform
              attributeName="transform"
              type="translate"
              from="0 0"
              to={`0 ${(100 + len).toFixed(1)}`}
              dur={`${dur.toFixed(2)}s`}
              begin={`-${(rnd() * dur).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </line>
        )
      }
      break
    }
    case 'rainBack': {
      // Background rain layer: shorter, fainter, thinner, slower drops —
      // the parallax distance behind 'rain'.
      const n = Math.round(35 + d * 190)
      for (let i = 0; i < n; i++) {
        const x = rnd() * 100
        const len = 3 + rnd() * 4
        const op = 0.12 + rnd() * 0.2
        const dur = 3.5 + rnd() * 2.5
        els.push(
          <line
            key={i}
            x1={x}
            y1={-len}
            x2={x}
            y2={0}
            {...stroke}
            strokeWidth={1}
            opacity={op}
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              from="0 0"
              to={`0 ${(100 + len).toFixed(1)}`}
              dur={`${dur.toFixed(2)}s`}
              begin={`-${(rnd() * dur).toFixed(2)}s`}
              repeatCount="indefinite"
            />
          </line>
        )
      }
      break
    }
    case 'pool': {
      // Pooling water: ripples. Each mark starts as a point and widens
      // symmetrically from its center while fading out (rain hitting the
      // pool), on its own clock. x1/x2 are SMIL-animatable line geometry.
      const n = Math.round(14 + d * 70)
      for (let i = 0; i < n; i++) {
        const cx = 3 + rnd() * 94
        const y = 15 + rnd() * 80
        const half = (2.5 + rnd() * 4.5) / 2
        const op = 0.35 + rnd() * 0.4
        const dur = 2.2 + rnd() * 2.8
        const begin = `-${(rnd() * dur).toFixed(2)}s`
        const timing = {
          dur: `${dur.toFixed(2)}s`,
          begin,
          repeatCount: 'indefinite',
        }
        els.push(
          <line key={i} x1={cx} y1={y} x2={cx} y2={y} {...stroke} opacity={op}>
            <animate
              attributeName="x1"
              values={`${cx.toFixed(1)};${(cx - half).toFixed(1)}`}
              {...timing}
            />
            <animate
              attributeName="x2"
              values={`${cx.toFixed(1)};${(cx + half).toFixed(1)}`}
              {...timing}
            />
            <animate
              attributeName="opacity"
              values={`${op.toFixed(2)};${op.toFixed(2)};0`}
              keyTimes="0;0.3;1"
              {...timing}
            />
          </line>
        )
      }
      break
    }
    case 'stairs': {
      // Upward staircases (susana_nico ostinato): right-angular rise/run
      // lines, sitting behind the rain. Drawn square in user space and
      // aspect-compensated (unsquish) so the right angles read as stairs at
      // any patch width. Each stair gets its own horizontal slot (jittered,
      // never overlapping — two stairs on top of each other stop reading as
      // stairs). ALL stairs ascend left→right (Nathan: upward only, no
      // downward staircases). ~40% are escalators: translated along their
      // own period vector so the loop is seamless and the motion reads as
      // riding up the incline.
      const n = Math.round(6 + d * 22)
      for (let i = 0; i < n; i++) {
        const escalator = rnd() < 0.4
        const dir = 1 // every stair ascends left→right
        const segs = 3 + Math.floor(rnd() * 2)
        const rise = 14 + rnd() * 8 // uniform within a stair (seamless loop)
        const run = 11 + rnd() * 8
        let x = 0
        let y = 96 - rnd() * 22
        const pts = [`${x.toFixed(1)},${y.toFixed(1)}`]
        for (let s = 0; s < segs; s++) {
          y -= rise
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
          x += dir * run
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
        }
        y -= rise * 0.6 // final rise
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
        // Slot i of n with small jitter: guarantees horizontal separation.
        const cx = ((i + 0.35 + rnd() * 0.3) / n) * 100
        const op = 0.5 + rnd() * 0.4
        const stepDur = 2.2 + rnd() * 1.6
        els.push(
          <g key={i} transform={unsquish(cx)} opacity={op}>
            <polyline
              points={pts.join(' ')}
              {...stroke}
              transform={`translate(${(cx - x / 2).toFixed(1)} 0)`}
            >
              {escalator && (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  additive="sum"
                  from="0 0"
                  to={`${(dir * run).toFixed(1)} ${(-rise).toFixed(1)}`}
                  dur={`${stepDur.toFixed(2)}s`}
                  begin={`-${(rnd() * stepDur).toFixed(2)}s`}
                  repeatCount="indefinite"
                />
              )}
            </polyline>
          </g>
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
  // Measure the patch's rendered pixel aspect so pictorial textures (moon,
  // clouds, stars, rook) can counter the non-uniform viewBox stretch and
  // draw true-round shapes. Updates on window resize via ResizeObserver.
  const svgRef = useRef(null)
  const [aspect, setAspect] = useState(3)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setAspect(r.width / r.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
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
      ref={svgRef}
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
          patch.tilt ?? 0,
          aspect
        )}
      </g>
    </svg>
  )
}

export default function FormStrip({ contour, position, sections, glyphs }) {
  // Unique clipPath id prefix — duplicate SVG ids on one page would make
  // every strip clip with the first instance's shapes.
  const patchIdPrefix = useId()

  const patches = Array.isArray(glyphs)
    ? glyphs.filter((g) => g && g.type === 'patch')
    : []
  // A contour is no longer required (lalork#7): glyphs-only pieces (e.g.
  // susana_nico's rain strip) draw the strip with sections + playhead and no
  // energy-arc polyline. Nothing at all still renders nothing.
  const hasContour = Boolean(contour && contour.length >= 2)
  if (!hasContour && !patches.length) return null

  const points = hasContour
    ? contour
        .map(([x, y]) => {
          const px = clamp01(x) * VIEW_W
          const py = PAD_Y + (1 - clamp01(y)) * (VIEW_H - PAD_Y * 2)
          return `${px},${py}`
        })
        .join(' ')
    : ''
  const playheadX = position != null ? clamp01(position) * VIEW_W : null
  const sectionXs = Array.isArray(sections)
    ? [...new Set(sections.filter((x) => typeof x === 'number' && x > 0 && x < 1))]
    : []

  return (
    <div className="portal__form-strip" aria-label="Piece form">
      {/* "Form" bay label removed (Nathan: it was in the way of the glyphs
          at the left edge — the lantern lives in cell 1 now). */}
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
          {hasContour && (
            <polyline
              className="portal__form-contour"
              points={points}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          )}
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
