// Conductor "musical direction" control — ported from the Scale Navigator
// Dashboard's ensemble workspace (scale-navigator-dashboard
// src/components/Workspace/RoomView/DirectionPanel.js, #416) so conducting
// feels identical in both apps.
//
// A direction is ONE freeform string, like a score expression marking
// ("Adagio, molto espressivo"). The category groups below only organize the
// preset picker — they are not a data schema. Chips append to the draft;
// committing writes the single string to the room doc's flat `direction`
// field (the LIVE channel, lalork-website#114): Set replaces the whole set,
// Clear empties it. Piece playback writes scoreDirection and never touches
// this field, so typed cues survive every harmony rebroadcast.

import { useState } from 'react'

const PRESET_GROUPS = [
  { label: 'Tempo', presets: ['Adagio', 'Lento', 'Rubato', 'Accelerando'] },
  { label: 'Dynamics', presets: ['pp', 'ff', 'Swelling', 'Dying away'] },
  { label: 'Mood', presets: ['Sparse', 'Pointillistic', 'Drone', 'Pulse'] },
  {
    label: 'Articulation',
    presets: ['Sustained', 'No attacks', 'Leave space', 'Short attacks'],
  },
]

export default function DirectionPanel({ direction, onSet, onClear }) {
  const [draft, setDraft] = useState('')

  // Append a preset, first evicting any sibling from the same category (one
  // term per type) and any duplicate of the preset itself. Freeform terms
  // (not in the group's preset list) always survive.
  const appendPreset = (preset, group) => {
    setDraft((prev) => {
      const evict = group.presets.map((p) => p.toLowerCase())
      const kept = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((term) => !evict.includes(term.toLowerCase()))
      return [...kept, preset].join(', ')
    })
  }

  const commit = () => {
    const value = draft.trim()
    if (!value) return
    onSet(value)
    setDraft('')
  }

  return (
    <div className="direction-panel">
      <div className="direction-panel-label">Direction</div>
      <div className="direction-panel-sublabel">
        Score-style instruction broadcast to every player&apos;s screen
      </div>

      {direction ? (
        <div className="direction-current-row">
          <div className="direction-current">{direction}</div>
          <button className="direction-clear" onClick={onClear}>
            ✕ Clear
          </button>
        </div>
      ) : (
        <div className="direction-none">No direction set</div>
      )}

      {PRESET_GROUPS.map((group) => (
        <div className="direction-group" key={group.label}>
          <span className="direction-group-label">{group.label}</span>
          <div className="direction-chips">
            {group.presets.map((preset) => (
              <button
                className="direction-chip"
                key={preset}
                onClick={() => appendPreset(preset, group)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="direction-input-row">
        <input
          className="direction-input"
          type="text"
          value={draft}
          maxLength={120}
          placeholder='e.g. "Adagio — sparse, leave space" or "a la Philip Glass"'
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
        <button
          className="direction-set"
          onClick={commit}
          disabled={!draft.trim()}
        >
          Set
        </button>
      </div>
    </div>
  )
}
