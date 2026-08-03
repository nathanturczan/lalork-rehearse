import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  ensureGuestAuth,
  ensureRehearsalRoom,
  updateEnsembleState,
} from './firebase'
import EnterPortal from './portal/EnterPortal'

const BROADCAST_DEBOUNCE_MS = 100

// YouTube iframe API loader
function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT) {
      resolve(window.YT)
      return
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.body.appendChild(tag)
    window.onYouTubeIframeAPIReady = () => resolve(window.YT)
  })
}

// Copied from noteschordsscales SkeletonPlayer.jsx
const prettyChordLabelFromKey = (key) => {
  if (!key) return '(unknown)'
  const [rootTokenRaw, restRaw = ''] = key.split('_')

  const preferred = {
    c: 'C', cs: 'C#', df: 'Db', d: 'D', ds: 'Eb', ef: 'Eb',
    e: 'E', f: 'F', fs: 'F#', gf: 'Gb', g: 'G', gs: 'Ab',
    af: 'Ab', a: 'A', as: 'Bb', bf: 'Bb', b: 'B',
  }

  const rootPretty = preferred[rootTokenRaw.toLowerCase()] || rootTokenRaw
  let rest = restRaw.replace(/-\d+$/, '').replace(/_/g, ' ')

  return rest ? `${rootPretty} ${rest}` : rootPretty
}

const prettyScaleLabelFromKey = (key) => {
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

// Convert beat number to mm:ss given tempo
const beatsToTime = (beats, tempo) => {
  if (!tempo || beats == null) return '--:--'
  const seconds = (beats / tempo) * 60
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Narrow-screen detection (phone / small tablet)
function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia('(max-width: 700px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)')
    const onChange = (e) => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export default function App() {
  const isNarrow = useIsNarrow()
  const [skeleton, setSkeleton] = useState(null)
  const [sketchpad, setSketchpad] = useState(null)
  const [currentEvent, setCurrentEvent] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(-1)

  // Ensemble state: invisible guest identity + auto-created private room
  const [ensembleRoomId, setEnsembleRoomId] = useState(null)
  const [ensembleBpm, setEnsembleBpm] = useState(60)
  const [selectedChordKey, setSelectedChordKey] = useState(null)
  const [selectedScaleKey, setSelectedScaleKey] = useState(null)
  const [currentDirection, setCurrentDirection] = useState(null)
  const [ensembleError, setEnsembleError] = useState('')
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [roomIdCopied, setRoomIdCopied] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Broadcast lead: fire state changes this many ms EARLY relative to the video,
  // to absorb Firestore fan-out + client latency. Adjustable, persisted.
  const [leadMs, setLeadMs] = useState(() => {
    const saved = localStorage.getItem('rehearse_lead_ms')
    if (saved === null) return 400
    const parsed = Number(saved)
    return Number.isFinite(parsed) ? parsed : 400
  })
  useEffect(() => {
    localStorage.setItem('rehearse_lead_ms', String(leadMs))
  }, [leadMs])

  const playerRef = useRef(null)
  const intervalRef = useRef(null)
  const broadcastTimeoutRef = useRef(null)

  // Own volume control: YouTube's embed chrome no longer shows a volume slider
  const [volume, setVolume] = useState(100)
  const handleVolumeChange = (v) => {
    setVolume(v)
    const p = playerRef.current
    if (p?.setVolume) {
      p.setVolume(v)
      if (v > 0 && p.isMuted?.()) p.unMute?.()
    }
  }

  // Load skeleton + sketchpad
  useEffect(() => {
    fetch('/wagner_oneiric_warning.json')
      .then(res => res.json())
      .then(data => {
        setSkeleton(data)
        if (typeof data.tempo === 'number') setEnsembleBpm(data.tempo)
      })
    fetch('/wagner_oneiric_warning_sketchpad.json')
      .then(res => res.json())
      .then(data => setSketchpad(data))
  }, [])

  // Lookup: event.state -> sketchpad node (chord/scale keys)
  const nodeMap = useMemo(() => {
    if (!sketchpad?.nodes) return {}
    return Object.fromEntries(sketchpad.nodes.map((n) => [n.id, n]))
  }, [sketchpad])

  // Initialize YouTube player
  useEffect(() => {
    if (!skeleton?.youtube_id) return

    loadYouTubeAPI().then((YT) => {
      playerRef.current = new YT.Player('youtube-player', {
        videoId: skeleton.youtube_id
      })
    })
  }, [skeleton?.youtube_id])

  // Re-derive the current event from the video clock (idempotent)
  const syncToVideo = useCallback(() => {
    if (!skeleton) return
    const currentTime = playerRef.current?.getCurrentTime?.() || 0
    const tempo = skeleton.tempo
    // Look ahead by leadMs so broadcasts land on time despite network latency
    const currentBeat = ((currentTime + leadMs / 1000) / 60) * tempo

    // Find current event
    let eventIndex = -1
    for (let i = skeleton.events.length - 1; i >= 0; i--) {
      if (currentBeat >= skeleton.events[i].time) {
        eventIndex = i
        break
      }
    }

    if (eventIndex !== currentIndex && eventIndex >= 0) {
      setCurrentIndex(eventIndex)
      setCurrentEvent(skeleton.events[eventIndex])
      onEventChange(skeleton.events[eventIndex])
    }
  }, [skeleton, currentIndex, nodeMap, leadMs])

  // Poll the video clock constantly — playing OR paused — so scrubbing the
  // YouTube bar always re-derives and rebroadcasts the harmonic state
  useEffect(() => {
    if (!skeleton) return
    intervalRef.current = setInterval(syncToVideo, 100)
    return () => clearInterval(intervalRef.current)
  }, [skeleton, syncToVideo])

  // Handle event change: derive chord/scale/direction for broadcast
  function onEventChange(event) {
    const node = nodeMap[event.state]

    if (node) {
      if (node.chord) setSelectedChordKey(node.chord)
      if (node.scale) setSelectedScaleKey(node.scale)
    } else {
      console.warn(`[rehearse] No sketchpad node for state: ${event.state}`)
    }

    // Direction format: comma-separated string of non-empty fields
    // (same as noteschordsscales SkeletonPlayer)
    const dir = event?.direction
    if (dir && typeof dir === 'object') {
      const parts = [dir.marking, dir.lyric, dir.note].filter(Boolean)
      setCurrentDirection(parts.length > 0 ? parts.join(', ') : null)
    } else if (typeof dir === 'string') {
      setCurrentDirection(dir || null)
    } else {
      setCurrentDirection(null)
    }

    console.log('Event:', event.state, node?.chord, node?.scale, event.direction)
  }

  // Silent setup: guest identity + private rehearsal room. No buttons, no popups.
  useEffect(() => {
    let cancelled = false
    ensureGuestAuth()
      .then((guest) => ensureRehearsalRoom(guest))
      .then(({ roomId }) => {
        if (!cancelled) setEnsembleRoomId(roomId)
      })
      .catch((err) => {
        console.error('[ensemble] room setup failed', err)
        if (!cancelled) {
          setEnsembleError(
            'Could not set up your rehearsal room. Check your internet connection and reload the page.'
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced broadcast on state change (copied from MidiChordScalePage)
  useEffect(() => {
    if (!ensembleRoomId) return

    if (broadcastTimeoutRef.current) {
      clearTimeout(broadcastTimeoutRef.current)
    }

    const chordToSend = selectedChordKey || null
    const scaleToSend = selectedScaleKey || null
    const directionToSend = currentDirection || null

    broadcastTimeoutRef.current = setTimeout(() => {
      console.log('[ensemble broadcast] sending:', {
        roomId: ensembleRoomId,
        chordKey: chordToSend,
        scaleKey: scaleToSend,
        bpm: ensembleBpm,
        direction: directionToSend,
      })

      updateEnsembleState({
        roomId: ensembleRoomId,
        bpm: ensembleBpm,
        chordKey: chordToSend,
        scaleKey: scaleToSend,
        direction: directionToSend,
      }).catch((err) => {
        console.error('[ensemble] failed to update state', err)
      })
    }, BROADCAST_DEBOUNCE_MS)

    return () => {
      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current)
      }
    }
  }, [ensembleRoomId, ensembleBpm, selectedChordKey, selectedScaleKey, currentDirection])

  const currentNode = currentEvent ? nodeMap[currentEvent.state] : null

  // Next event's node, for the portal's Next slots
  const nextEvent =
    skeleton && currentIndex >= 0 && currentIndex + 1 < skeleton.events.length
      ? skeleton.events[currentIndex + 1]
      : null
  const nextNode = nextEvent ? nodeMap[nextEvent.state] : null

  // Timeline: all events, scrollable, auto-follows the current one
  const visibleEvents = useMemo(() => {
    const events = skeleton?.events || []
    return events.map((event, i) => ({
      ...event,
      index: i,
      node: nodeMap[event.state] || null,
    }))
  }, [skeleton, nodeMap])

  // Keep the NOW row vertically centered in the timeline scroll area
  const timelineRef = useRef(null)
  const currentRowRef = useRef(null)
  useEffect(() => {
    const container = timelineRef.current
    const row = currentRowRef.current
    if (!container || !row) return
    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const target = container.scrollTop
      + (rowRect.top - containerRect.top)
      - (containerRect.height / 2 - rowRect.height / 2)
    container.scrollTo({ top: target, behavior: 'smooth' })
  }, [currentIndex])

  // Click a timeline row: seek the video there (video stays the master clock)
  const jumpToEvent = useCallback((index) => {
    const events = skeleton?.events || []
    if (index < 0 || index >= events.length) return

    const event = events[index]
    const seconds = (event.time / skeleton.tempo) * 60
    playerRef.current?.seekTo?.(seconds, true)

    // Apply immediately so it works while paused too
    setCurrentIndex(index)
    setCurrentEvent(event)
    onEventChange(event)
  }, [skeleton, nodeMap])

  const strudelSnippet = ensembleRoomId
    ? `// PRIVATE REHEARSAL ROOM — on show day, get your snippet from enter.lalaptoporchestra.com
// Every line below follows this app's harmony: when the scale or
// chord changes here, the patterns update by themselves.

const { joinEnsemble } = await import('https://cdn.jsdelivr.net/npm/strudel-scalenav@0.7.0/dist/strudel-scalenav.js')

const ens = await joinEnsemble('${ensembleRoomId}')
ens.showBadge() // room + current scale/chord, top of the screen

// Each arpeggio below contains 16 steps per cycle.
// The numbers select notes; their positions determine when they play.

// SCALE DEGREES
// 1  2  3  4   5  6  7  8   9  10 11 12  13 14 15 16
const scaleLine =
  '0  2  4  6   8 10 12 14  12  10  8  6   4  2  7 11'

// NOTES FROM THE CONDUCTOR’S ORIGINAL CHORD VOICING
// 1  2  3  4   5  6  7  8   9  10 11 12  13 14 15 16
const chordLine =
  '0  2  3  4   3  1  0  2   4   1  3  4   2  1  0  3'

// NOTES FROM THE CURRENT CHORD IN CLOSE POSITION
// 1  2  3  4   5  6  7  8   9  10 11 12  13 14 15 16
const interlockingLine =
  '0  2  1  3   2  0  4  2   1   3  4  0   2  4  1  3'

// Every four scale notes move through these octaves.
const scaleOctaves = '<0 12 24 12>'

// Every eight chord notes move through this octave shape.
const chordOctaves = '<12 24 12 36 24 12 36 24>'

// The second chord arpeggio uses a contrasting octave shape.
const interlockingOctaves = '<0 12 24 12 0 24 12 36>'

// Pick a new bass position each cycle:
// low root, root up an octave, or a low chord fifth.
const bass = chooseCycles(
  note(ens.chord.closed.pitch(0)).add(-24),
  note(ens.chord.closed.pitch(0)).add(-12),
  note(ens.chord.closed.pitch(2)).add(-24),
  note(ens.chord.closed.pitch(0)).add(-24)
)

stack(
  // 16 evenly spaced scale notes per cycle
  note(ens.scale.arp(scaleLine))
    .add(scaleOctaves)
    .sound('square')
    .attack(0.001)
    .decay(0.25)
    .sustain(0.1)
    .release(0.35)
    .lpf(6000)
    .gain(0.28),

  // 16 evenly spaced notes from the original chord voicing
  note(ens.chord.voicing.arp(chordLine))
    .add(chordOctaves)
    .sound('square')
    .attack(0.001)
    .decay(0.2)
    .sustain(0.8)
    .release(0.3)
    .lpf(4800)
    .gain(0.18),

  // 16 evenly spaced close-position chord notes
  note(ens.chord.closed.arp(interlockingLine))
    .add(interlockingOctaves)
    .sound('pulse')
    .attack(0.001)
    .decay(0.18)
    .sustain(0.5)
    .release(0.25)
    .lpf(7000)
    .gain(0.2),

  // Eight-step bass rhythm:
  // x = play, ~ = rest, [x x] = two quick notes inside one step
  bass
    .struct('x ~ x x  ~ x [x x] ~')
    .sound('square')
    .attack(0.001)
    .decay(0.045)
    .sustain(0.5)
    .release(0.5)
    .lpf(1000)
    .gain(0.34)
)
.cpm(ens.bpm.div(4)) // 16th notes at the room's tempo`
    : '// Setting up your private rehearsal room…'

  // Strudel encodes the editor contents in the URL hash, so this link opens
  // strudel.cc with the whole jam already loaded — no pasting needed.
  const strudelUrl = ensembleRoomId
    ? 'https://strudel.cc/#' + encodeURIComponent(btoa(unescape(encodeURIComponent(strudelSnippet))))
    : 'https://strudel.cc'

  if (!skeleton) return <div>Loading...</div>

  return (
    <div className="app">
      <h1>Rehearse LA Laptop Orchestra</h1>

      <div className="video-container">
        <div id="youtube-player"></div>
      </div>

      <div className="status-row">
        <div className="status-chip volume-chip">
          <strong>Vol</strong>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            aria-label="Volume"
          />
        </div>
        <div className="status-chip">
          <strong>Position:</strong> {currentIndex + 1} / {skeleton.events.length}
        </div>
      </div>

      <EnterPortal
        scaleKey={currentNode?.scale || null}
        chordKey={currentNode?.chord || null}
        nextScaleKey={nextNode?.scale || null}
        nextChordKey={nextNode?.chord || null}
        bpm={skeleton.tempo}
      />

      {isNarrow && (
        <div className="ensemble-strip">
          {ensembleError ? (
            <span className="ensemble-status ensemble-error">{ensembleError}</span>
          ) : !ensembleRoomId ? (
            <span className="ensemble-status">Setting up your private room…</span>
          ) : (
            <span className="ensemble-status">
              <span className="live-dot" /> Private room <strong>{ensembleRoomId}</strong>
            </span>
          )}
          <label className="lead-inline">
            lead
            <input
              type="number"
              step={50}
              min={0}
              max={5000}
              value={leadMs}
              onChange={(e) => setLeadMs(Math.max(0, Number(e.target.value) || 0))}
            />
            ms
          </label>
        </div>
      )}

      <div className="card-row">
      {!isNarrow && (
      <div className="card">
        <div className="ensemble-status-row">
          {ensembleError ? (
            <div className="ensemble-error">{ensembleError}</div>
          ) : !ensembleRoomId ? (
            <div className="ensemble-status">Setting up your private rehearsal room…</div>
          ) : (
            <div className="ensemble-status">
              <span className="live-dot" /> Private rehearsal active
            </div>
          )}
        </div>

        <div className="resources">
          {ensembleRoomId && (
            <div className="rehearsal-code-box">
              <div className="rehearsal-code-label">Your rehearsal code</div>
              <div className="rehearsal-code-row">
                <code>{ensembleRoomId}</code>
                <button
                  className="ensemble-button"
                  onClick={() => {
                    navigator.clipboard.writeText(ensembleRoomId)
                    setRoomIdCopied(true)
                    setTimeout(() => setRoomIdCopied(false), 2000)
                  }}
                >
                  {roomIdCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="rehearsal-code-hint">Paste into Ableton or Strudel to connect.</div>
            </div>
          )}

          <div className="resource-section">
            <div className="resource-title">Strudel</div>
            <div className="resource-buttons">
              <a href={strudelUrl} target="_blank" rel="noopener noreferrer" className="resource-download">
                Open in Strudel
              </a>
              <button
                className="resource-download-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(strudelSnippet)
                  setSnippetCopied(true)
                  setTimeout(() => setSnippetCopied(false), 2000)
                }}
              >
                {snippetCopied ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
          </div>

          <div className="resource-section">
            <div className="resource-title">Ableton</div>
            <div className="resource-buttons">
              <a href="/LA%20Laptop%20Orchestra.zip" download className="resource-download">
                Download Template
              </a>
              <a href="/LA%20Laptop%20Orchestra%20Bridge.amxd" download className="resource-download-secondary">
                Download M4L Bridge
              </a>
            </div>
            <div className="resource-hint">
              Template: 3 tracks ready to play. Device only: drop on any MIDI track.
            </div>
          </div>

          <button
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▾ Advanced settings' : '▸ Advanced settings'}
          </button>
          {showAdvanced && (
            <div className="advanced-settings">
              <label className="lead-control">
                <span>Broadcast lead</span>
                <input
                  type="number"
                  step={50}
                  min={0}
                  max={5000}
                  value={leadMs}
                  onChange={(e) => setLeadMs(Math.max(0, Number(e.target.value) || 0))}
                />
                <span>ms</span>
              </label>
              <div className="advanced-hint">
                Fire changes early to compensate for network latency.
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-title">Timeline:</div>
        <div className="timeline" ref={timelineRef}>
          {visibleEvents.map((event) => {
            const isCurrent = event.index === currentIndex
            const chordLabel = event.node?.chord
              ? prettyChordLabelFromKey(event.node.chord)
              : event.state
            const scaleLabel = event.node?.scale
              ? prettyScaleLabelFromKey(event.node.scale).replace('harmonic', 'harm')
              : ''

            return (
              <div
                key={event.index}
                ref={isCurrent ? currentRowRef : null}
                onClick={() => jumpToEvent(event.index)}
                className={`timeline-row${isCurrent ? ' current' : ''}`}
              >
                <span className="timeline-num">{event.index + 1}.</span>
                <span className="timeline-beat">{beatsToTime(event.time, skeleton?.tempo)}</span>
                <span className="timeline-chord" style={{ fontWeight: isCurrent ? 600 : 400 }}>
                  {chordLabel}
                </span>
                <span className="timeline-scale">{scaleLabel}</span>
                {isCurrent && <span className="timeline-now">NOW</span>}
              </div>
            )
          })}
        </div>
        <div className="timeline-hint">
          Click any event to jump to it.
        </div>
      </div>
      </div>
    </div>
  )
}
