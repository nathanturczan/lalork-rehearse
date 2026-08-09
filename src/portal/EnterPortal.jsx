// Enter Portal — LALORK Enter's live scale/chord/tempo panel, ported from
// scale-navigator-dashboard's Tablature instrument version
// (src/components/Workspace/Tablature/instruments/portal/EnterPortal.js).
//
// Differences from the Dashboard version, dictated by the rehearse context:
// - Data arrives as KEY STRINGS (scaleKey "a_diatonic", chordKey "d_M7-0")
//   from the skeleton/sketchpad, so entries/chord objects are derived from
//   the keys themselves. No chord voicings exist here, so the
//   getChordSpelling branch is dropped (roots spell via PC_NAMES).
// - The NEXT slots are always populated: the skeleton knows the next event,
//   so the portal permanently previews it (Enter only previews during
//   anticipation).
// - Swap-in animation fires whenever the committed scale/chord key changes,
//   sliding in from the Next slot's last geometry.
// - BPM comes in as a plain prop (the rehearse app is the host that
//   generates it — no room subscription, no redux, no window.__bpm).
// - Direction box shows the union of the LIVE conductor channel and the
//   piece's baked scoreDirection (website#114) — the same union the ensemble
//   sees on Enter, so the conductor previews their own broadcast.

import React, { useLayoutEffect, useRef, useState } from 'react'
import { getNodeColor } from './colors'
import DirectionField from './DirectionField'

import diatonicSvg from './shapes/diatonic.svg'
import harmonicMajorSvg from './shapes/harmonic_major.svg'
import harmonicMinorSvg from './shapes/harmonic_minor.svg'
import hexatonicSvg from './shapes/hexatonic.svg'
import octatonicSvg from './shapes/octatonic.svg'

import './EnterPortal.css'

// ---------------------------------------------------------------------------
// Key parsing (rehearse-specific): keys → entry / chord objects
// ---------------------------------------------------------------------------

const ROOT_PCS = {
  c: 0, cs: 1, df: 1, d: 2, ds: 3, ef: 3, e: 4, f: 5,
  fs: 6, gf: 6, g: 7, gs: 8, af: 8, a: 9, as: 10, bf: 10, b: 11,
}

function scaleEntryFromKey(key) {
  if (!key) return null
  const parts = key.split('_')
  if (ROOT_PCS[parts[0]] != null) {
    return { root: ROOT_PCS[parts[0]], scale_class: parts.slice(1).join('_') }
  }
  // Symmetric scales (no root token): trailing digits pick the transposition
  const last = parts[parts.length - 1]
  if (/^\d+$/.test(last)) {
    return { root: Number(last) % 12, scale_class: parts.slice(0, -1).join('_') }
  }
  return { root: 0, scale_class: key }
}

function chordFromKey(key) {
  if (!key) return null
  const [rootToken, ...rest] = key.split('_')
  const pc = ROOT_PCS[rootToken]
  if (pc == null) return null
  return { root: pc, chord_type: rest.join('_') }
}

// ---------------------------------------------------------------------------
// Name formatting (ported unchanged from the Dashboard EnterPortal)
// ---------------------------------------------------------------------------

const PC_NAMES = [
  'C', 'C\u266F', 'D', 'E\u266D', 'E', 'F',
  'F\u266F', 'G', 'A\u266D', 'A', 'B\u266D', 'B',
]

const PITCH_TOKENS = new Set([
  'a', 'b', 'c', 'd', 'e', 'f', 'g',
  'as', 'bs', 'cs', 'ds', 'es', 'fs', 'gs',
])

function mapSharp(r) {
  switch (r) {
    case 'as': return 'B\u266D'
    case 'bs': return 'B\u266F'
    case 'cs': return 'D\u266D'
    case 'ds': return 'E\u266D'
    case 'es': return 'E\u266F'
    case 'fs': return 'F\u266F'
    case 'gs': return 'A\u266D'
    default:
      return r ? r.charAt(0).toUpperCase() + r.slice(1) : ''
  }
}

function titleCaseWords(s) {
  if (!s) return ''
  return s
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function formatScaleName(scaleKey, entry) {
  const parts = (scaleKey || '').split('_')
  const hasRootToken = PITCH_TOKENS.has(parts[0])
  const classTokens = hasRootToken ? parts.slice(1) : parts
  const classLabel = titleCaseWords(entry?.scale_class || classTokens.join('_'))
  if (hasRootToken) {
    return `${mapSharp(parts[0])} ${classLabel}`.trim()
  }
  return classLabel
}

// Scale-class abbreviations for the NEXT slot (Enter's formatScaleNameShort).
const SCALE_CLASS_SHORT = [
  ['Harmonic Major', 'Harm Maj'],
  ['Harmonic Minor', 'Harm Min'],
  ['Whole Tone', 'WT'],
  ['Octatonic', 'Oct'],
  ['Diatonic', 'Dia'],
  ['Acoustic', 'Acou'],
  ['Hexatonic', 'Hex'],
]

function formatScaleNameShort(scaleKey, entry) {
  const full = formatScaleName(scaleKey, entry)
  for (const [long, short] of SCALE_CLASS_SHORT) {
    if (full.endsWith(long)) {
      return full.slice(0, full.length - long.length) + short
    }
  }
  return full
}

// Chord label from the derived chord object; no voicings in rehearse, so the
// root always spells from PC_NAMES.
function formatChordName(chord) {
  if (!chord) return '\u2014'
  const rootPc =
    typeof chord.root === 'number' ? ((chord.root % 12) + 12) % 12 : null
  let suffix = chord.chord_type || ''
  if (suffix.startsWith('_')) suffix = suffix.slice(1)
  const dashIdx = suffix.lastIndexOf('-')
  if (dashIdx > 0 && /^\d+$/.test(suffix.slice(dashIdx + 1))) {
    suffix = suffix.slice(0, dashIdx)
  }
  suffix = suffix.replace(/#/g, '\u266F').replace(/b/g, '\u266D')
  const root = rootPc != null ? PC_NAMES[rootPc] : ''
  return `${root}${suffix ? ' ' + suffix : ''}`.trim() || '\u2014'
}

// ---------------------------------------------------------------------------
// ScaleSymbol (ported unchanged; color from the Dashboard's canonical palette)
// ---------------------------------------------------------------------------

const MASK_SHAPES = {
  diatonic: diatonicSvg,
  harmonic_major: harmonicMajorSvg,
  harmonic_minor: harmonicMinorSvg,
  hexatonic: hexatonicSvg,
  octatonic: octatonicSvg,
}

function ScaleSymbol({ entry, size = 36 }) {
  const root = entry?.root ?? 0
  const scaleClass = entry?.scale_class || 'diatonic'
  const color = getNodeColor(root, scaleClass)
  const box = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
  }

  // Acoustic / whole tone use inline rects (special aspect ratios).
  if (scaleClass === 'acoustic') {
    return (
      <div style={box}>
        <svg viewBox="0 0 100 50" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <rect x="0" y="0" width="100" height="50" fill={color} />
        </svg>
      </div>
    )
  }
  if (scaleClass === 'whole_tone') {
    return (
      <div style={box}>
        <svg viewBox="0 0 50 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <rect x="0" y="0" width="50" height="100" fill={color} />
        </svg>
      </div>
    )
  }

  // Everything else masks a shape SVG; unknown classes fall back to the
  // diatonic heptagon.
  const shape = MASK_SHAPES[scaleClass] || diatonicSvg
  return (
    <div style={box}>
      <div
        key={scaleClass}
        style={{
          width: size,
          height: size,
          WebkitMaskImage: `url(${shape})`,
          maskImage: `url(${shape})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          background: color,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Swap-in animation + NEXT-slot label (ported unchanged)
// ---------------------------------------------------------------------------

const SWAP_ANIMATION_MS = 350

// FLIP swap-in: at commit, the freshly-promoted current element animates
// from the preview slot's geometry (and the incoming blue) to its natural
// place, size, and color.
function animateSwapIn(el, from) {
  if (!el || !from) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const to = el.getBoundingClientRect()
  if (!to.height) return
  const scale = from.height ? from.height / to.height : 1
  const styles = getComputedStyle(el)
  const incomingColor =
    styles.getPropertyValue('--note-incoming-color').trim() || '#6ab8ff'
  el.animate(
    [
      {
        transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`,
        color: incomingColor,
      },
      { transform: 'none', color: styles.color },
    ],
    { duration: SWAP_ANIMATION_MS, easing: 'cubic-bezier(0, 0, 0.2, 1)' }
  )
}

// NEXT-slot scale label: renders the full scale name and falls back to the
// abbreviation only when the slot can't fit it.
function NextScaleName({ scaleKey, entry }) {
  const ref = useRef(null)
  const [abbreviate, setAbbreviate] = useState(false)
  useLayoutEffect(() => {
    setAbbreviate(false)
  }, [scaleKey])
  useLayoutEffect(() => {
    const el = ref.current
    if (!abbreviate && el && el.scrollWidth > el.clientWidth) {
      setAbbreviate(true)
    }
  })
  const label = abbreviate
    ? formatScaleNameShort(scaleKey, entry)
    : formatScaleName(scaleKey, entry)
  return (
    <span className="portal__scale-next-name" ref={ref}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// The portal
// ---------------------------------------------------------------------------

export default function EnterPortal({
  scaleKey,
  chordKey,
  nextScaleKey,
  nextChordKey,
  bpm,
  direction = null,
  scoreDirection = null,
}) {
  const keyData = scaleEntryFromKey(scaleKey)
  const chord = chordFromKey(chordKey)
  const nextEntry = scaleEntryFromKey(nextScaleKey)
  const nextChord = chordFromKey(nextChordKey)

  const scaleRef = useRef(null)
  const scaleNextRef = useRef(null)
  const chordRef = useRef(null)
  const chordNextRef = useRef(null)
  const fromRects = useRef({ scale: null, chord: null })
  const lastCommitted = useRef({ scale: scaleKey, chord: chordKey })

  // When the committed keys change, slide/grow the promoted values in from
  // the Next slot's geometry as of the PREVIOUS render (where they were
  // previewing); then remember the Next slots' current geometry.
  useLayoutEffect(() => {
    if (scaleKey !== lastCommitted.current.scale) {
      animateSwapIn(scaleRef.current, fromRects.current.scale)
    }
    if (chordKey !== lastCommitted.current.chord) {
      animateSwapIn(chordRef.current, fromRects.current.chord)
    }
    lastCommitted.current = { scale: scaleKey, chord: chordKey }
    fromRects.current = {
      scale: scaleNextRef.current?.getBoundingClientRect() ?? null,
      chord: chordNextRef.current?.getBoundingClientRect() ?? null,
    }
  })

  return (
    <div className="enter-portal">
      <div className="portal__now portal__now--compact">
        <div className="portal__main">
          {/* SCALE group: the group heading shares the bay-label line. */}
          <div className="portal__group">
            <div className="portal__now-row">
              <div className="portal__bay portal__bay--now">
                <span className="portal__bay-label">
                  <span className="portal__group-label">Scale</span> Now
                </span>
                <div className="portal__scale" ref={scaleRef}>
                  <ScaleSymbol entry={keyData} size={36} />
                  <span className="portal__scale-name">
                    {keyData ? formatScaleName(scaleKey, keyData) : '\u2014'}
                  </span>
                </div>
              </div>
              <div className="portal__bay portal__bay--next">
                <span className="portal__bay-label">Next</span>
                <div className="portal__scale-next" ref={scaleNextRef}>
                  {nextScaleKey && (
                    <>
                      <ScaleSymbol entry={nextEntry} size={28} />
                      <NextScaleName scaleKey={nextScaleKey} entry={nextEntry} />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="portal__meta-row">
            {/* CHORD group: fixed-width slots so Tempo never moves. */}
            <div className="portal__group">
              <div className="portal__chord-row">
                <div className="portal__bay portal__bay--now">
                  <span className="portal__bay-label">
                    <span className="portal__group-label">Chord</span> Now
                  </span>
                  <span className="portal__chord-current" ref={chordRef}>
                    {formatChordName(chord)}
                  </span>
                </div>
                <div className="portal__bay">
                  <span className="portal__bay-label">Next</span>
                  <span className="portal__chord-next" ref={chordNextRef}>
                    {nextChord ? formatChordName(nextChord) : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="portal__group">
              <span className="portal__group-label">Tempo</span>
              <span className="portal__tempo">
                {bpm != null ? `${bpm} BPM` : '\u2014'}
              </span>
            </div>
          </div>
        </div>
        {/* Conductor's direction — reserved full-height column on the right,
            same fixture as Enter's portal (website#63/#114). */}
        <aside className="portal__direction-box">
          <span className="portal__bay-label">Direction</span>
          <DirectionField direction={direction} scoreDirection={scoreDirection} />
        </aside>
      </div>
    </div>
  )
}
