// --- Harmony Payload v2 scaleInfo (tuning-aware contract) ---------------
// Every broadcast carries a self-describing scaleInfo object so receivers
// never depend on this app's lookup tables. Shape:
//   schemaVersion  2
//   id             machine scale key (must equal scaleData for freshness)
//   name           display name EXCLUDING root (receivers render "<root> <name>")
//   root           pitch class of root (0-11; symmetric scales use 0)
//   edo            divisions of the octave (12 for registry, 24 for e.g. Again)
//   pitchClasses   C-sorted absolute pitch classes; fractional values are
//                  exact EDO steps (1.5 = D half-flat in 24-EDO). CANONICAL.
//   scaleClass     registry scale class, or 'custom'
//   isCustom       true when defined by the sketchpad's scales block
//   degrees        [{step, spelling}] root-ordered; step counted in EDO
//                  divisions above root. Binds spellings to steps explicitly —
//                  NEVER pair pitchClasses (C-sorted) with spelling (root-
//                  ordered) positionally.
//
// Contract-locked: src/scaleInfo.test.js pins the exact Again payloads.
import ScaleRegistry from './scaleRegistry.js'

export const prettyScaleLabelFromKey = (key) => {
  if (!key) return '(unknown)'
  const [rootTokenRaw, ...rest] = key.split('_')
  const preferred = {
    c: 'C', cs: 'C#', df: 'Db', d: 'D', ds: 'Eb', ef: 'Eb',
    e: 'E', f: 'F', fs: 'F#', gf: 'Gb', g: 'G', gs: 'Ab',
    af: 'Ab', a: 'A', as: 'Bb', bf: 'Bb', b: 'B',
  }
  const rootPretty = preferred[rootTokenRaw.toLowerCase()]
  // Symmetric scales (whole_tone, octatonic, hexatonic) have no root prefix
  if (!rootPretty) return key.replace(/_/g, ' ')
  return `${rootPretty} ${rest.join(' ')}`
}

const PC_OF_ROOT_NAME = {
  c: 0, 'c#': 1, db: 1, d: 2, 'd#': 3, eb: 3, e: 4, f: 5, 'f#': 6,
  gb: 6, g: 7, 'g#': 8, ab: 8, a: 9, 'a#': 10, bb: 10, b: 11,
}

const titleCase = (s) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function buildScaleInfo(key, customScales) {
  if (!key) return null

  const custom = customScales?.[key]
  if (custom) {
    const pcs = Array.isArray(custom.pitchClasses)
      ? custom.pitchClasses
      : custom.pitch_classes
    if (!Array.isArray(pcs)) return null
    const root = custom.root ?? 0
    const edo = pcs.every(Number.isInteger) ? 12 : 24

    // Ecosystem convention (dashboard#372): name excludes the root; strip a
    // leading root token if it matches the declared root (avoids "F F ...").
    let name = custom.name || prettyScaleLabelFromKey(key)
    const rootMatch = name.match(/^([a-g][#♯b♭]?)\s+/i)
    if (
      rootMatch &&
      PC_OF_ROOT_NAME[
        rootMatch[1].toLowerCase().replace('♯', '#').replace('♭', 'b')
      ] === root
    ) {
      name = name.slice(rootMatch[0].length)
    }

    // degrees: root-ordered {step, spelling}. cents_above_root and spelling
    // are mutually aligned (both root-ordered); prefer cents when present,
    // otherwise derive steps by rotating the C-sorted pcs into root order.
    const spelling = Array.isArray(custom.spelling) ? custom.spelling : null
    const cents = Array.isArray(custom.cents_above_root)
      ? custom.cents_above_root
      : null
    let degrees = null
    if (cents) {
      degrees = cents.map((c, i) => ({
        step: Math.round(c / (1200 / edo)),
        spelling: spelling?.[i] ?? null,
      }))
    } else {
      const steps = pcs
        .map((pc) => (((pc - root) % 12) + 12) % 12)
        .sort((a, b) => a - b)
        .map((d) => Math.round(d * (edo / 12)))
      degrees = steps.map((step, i) => ({
        step,
        spelling: spelling?.[i] ?? null,
      }))
    }

    return {
      schemaVersion: 2,
      id: key,
      name,
      root,
      edo,
      pitchClasses: [...pcs],
      scaleClass: custom.scale_class || 'custom',
      isCustom: true,
      degrees,
    }
  }

  const entry = ScaleRegistry[key]
  if (!entry) return null
  return {
    schemaVersion: 2,
    id: key,
    name: titleCase(entry.scale_class),
    root: entry.root,
    edo: 12,
    pitchClasses: [...entry.pitch_classes],
    scaleClass: entry.scale_class,
    isCustom: false,
  }
}
