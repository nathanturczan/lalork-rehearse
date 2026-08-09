// Direction Field — the conductor's direction as a scatter of terms, ported
// from LALORK Enter (enter/src/components/DirectionField.tsx, website#63/#114)
// so the rehearse portal previews exactly what the ensemble sees.
//
// Each term (comma-separated chip of the direction string) gets a random
// coordinate when it is BORN (first appears) and keeps it for as long as it
// stays in the direction — so a change reads as "these stayed, those changed".
// Random-on-birth only, never random-on-render.
//
// Two channels, one field (website#114): `direction` carries the conductor's
// LIVE typed cues, `scoreDirection` the piece's baked markings. The field
// renders their UNION — live chips at full weight, score chips dimmed —
// deduped with live winning.

import { useEffect, useRef, useState } from 'react'

const X_MIN = 25
const X_MAX = 75
const Y_MIN = 24
const Y_MAX = 76

/** How long arriving chips pulse and departing chips linger as ghosts. */
const TRANSITION_MS = 2000

function parseChips(direction) {
  return direction
    ? Array.from(
        new Set(
          direction
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      )
    : []
}

// Best-candidate sampling: of N random points, keep the one farthest from
// every existing chip. Horizontal distance counts for less because the
// chips themselves are wide.
function randomPosition(existing) {
  let best = { x: (X_MIN + X_MAX) / 2, y: (Y_MIN + Y_MAX) / 2 }
  let bestScore = -1
  for (let i = 0; i < 60; i++) {
    const x = X_MIN + Math.random() * (X_MAX - X_MIN)
    const y = Y_MIN + Math.random() * (Y_MAX - Y_MIN)
    let score = Infinity
    for (const p of existing) {
      const dx = (x - p.x) / 2 // require ~2x more horizontal separation
      const dy = y - p.y
      score = Math.min(score, dx * dx + dy * dy)
    }
    if (score > bestScore) {
      bestScore = score
      best = { x, y }
    }
  }
  return best
}

/** Union of both channels, deduped with live winning. */
function unionChips(direction, scoreDirection) {
  const live = parseChips(direction)
  const score = parseChips(scoreDirection).filter((c) => !live.includes(c))
  return [...live, ...score]
}

export default function DirectionField({ direction, scoreDirection = null }) {
  const liveChips = parseChips(direction)
  const chips = unionChips(direction, scoreDirection)

  // Short transition window after each direction change: newcomers pulse
  // as incoming, departed chips linger at their spot as outgoing ghosts.
  const [transition, setTransition] = useState(null)
  const prevChipsRef = useRef(chips)

  useEffect(() => {
    const prev = prevChipsRef.current
    const next = unionChips(direction, scoreDirection)
    prevChipsRef.current = next
    const arriving = next.filter((c) => !prev.includes(c))
    const departing = prev.filter((c) => !next.includes(c))
    if (arriving.length === 0 && departing.length === 0) return
    setTransition({ arriving, departing })
    const t = setTimeout(() => setTransition(null), TRANSITION_MS)
    return () => clearTimeout(t)
  }, [direction, scoreDirection])

  // Departed chips stay visible (as outgoing ghosts) until the window ends.
  const departing = transition?.departing ?? []
  const visible = [...chips, ...departing.filter((c) => !chips.includes(c))]

  // Coordinates persist across renders and direction changes; prune only
  // the chips that are gone, then assign birth coordinates to newcomers.
  const positionsRef = useRef({})
  const positions = positionsRef.current
  Object.keys(positions).forEach((name) => {
    if (!visible.includes(name)) delete positions[name]
  })
  visible.forEach((name) => {
    if (!positions[name]) {
      positions[name] = randomPosition(Object.values(positions))
    }
  })

  // Channel of record per chip, remembered so a departing score chip stays
  // dim while it ghosts out (it's no longer in either channel by then).
  const originRef = useRef({})
  Object.keys(originRef.current).forEach((name) => {
    if (!visible.includes(name)) delete originRef.current[name]
  })
  chips.forEach((name) => {
    originRef.current[name] = liveChips.includes(name) ? 'live' : 'score'
  })

  const stateClass = (chip) => {
    const score =
      originRef.current[chip] === 'score' ? ' portal__direction-chip--score' : ''
    if (!transition) return score
    if (transition.arriving.includes(chip)) {
      return `${score} portal__direction-chip--incoming note--incoming`
    }
    if (transition.departing.includes(chip)) {
      return `${score} note--outgoing`
    }
    return score
  }

  if (visible.length === 0) return null

  return (
    <div className="portal__direction-field">
      {visible.map((chip) => (
        // Outer span owns the position transform; inner span owns the state
        // animation (note--outgoing animates transform: scale(), which would
        // otherwise clobber the centering translate).
        <span
          key={chip}
          className="portal__direction-pos"
          style={{
            left: `${positions[chip].x}%`,
            top: `${positions[chip].y}%`,
          }}
        >
          <span className={`portal__direction-chip${stateClass(chip)}`}>
            {chip}
          </span>
        </span>
      ))}
    </div>
  )
}
