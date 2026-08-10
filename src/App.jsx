import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  ensureGuestAuth,
  ensureRehearsalRoom,
  updateEnsembleState,
  setLiveDirection,
  setFormContour,
  setFormPosition,
  ensureAnticipationMs,
  getCurrentUser,
  signInWithGoogle,
  verifyRoomHost,
} from './firebase'
import EnterPortal from './portal/EnterPortal'
import DirectionPanel from './DirectionPanel'

const BROADCAST_DEBOUNCE_MS = 100

// Pieces: /<id>.json (skeleton) + /<id>_sketchpad.json must exist in pieces/
const PIECES = [
  { id: 'wagner_oneiric_warning', label: "Wagner: Brang\u00e4ne's Warning" },
  { id: 'cfgc_ostinato', label: 'CFGC Ostinato' },
]

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
  const [pieceId, setPieceId] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('piece')
    return PIECES.some((p) => p.id === fromUrl) ? fromUrl : PIECES[0].id
  })
  const [skeleton, setSkeleton] = useState(null)
  const [sketchpad, setSketchpad] = useState(null)
  const [currentEvent, setCurrentEvent] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(-1)

  // Live conductor mode: ?room=<roomId> targets that room directly (Google
  // sign-in required; Firestore rules only let the room's host broadcast).
  // Without the param, normal flow: guest identity + private rehearsal room.
  const [liveRoomId] = useState(
    () => new URLSearchParams(window.location.search).get('room') || null
  )
  const [needsLiveSignIn, setNeedsLiveSignIn] = useState(false)

  // Ensemble state: invisible guest identity + auto-created private room
  const [ensembleRoomId, setEnsembleRoomId] = useState(null)
  const [ensembleBpm, setEnsembleBpm] = useState(60)
  const [selectedChordKey, setSelectedChordKey] = useState(null)
  const [selectedScaleKey, setSelectedScaleKey] = useState(null)
  const [currentDirection, setCurrentDirection] = useState(null)
  const [ensembleError, setEnsembleError] = useState('')
  // Live conductor direction (lalork-website#114, rehearse#11): typed cues on
  // their own channel. Set replaces the whole live set; Clear empties it.
  const [liveDirectionSent, setLiveDirectionSent] = useState(null)
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

  // Load skeleton + sketchpad for the selected piece
  useEffect(() => {
    let cancelled = false
    setSkeleton(null)
    setSketchpad(null)
    setCurrentEvent(null)
    setCurrentIndex(-1)
    fetch(`/${pieceId}.json`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        setSkeleton(data)
        if (typeof data.tempo === 'number') setEnsembleBpm(data.tempo)
      })
    fetch(`/${pieceId}_sketchpad.json`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setSketchpad(data)
      })
    return () => { cancelled = true }
  }, [pieceId])

  const handlePieceChange = (id) => {
    setPieceId(id)
    const url = new URL(window.location)
    url.searchParams.set('piece', id)
    window.history.replaceState({}, '', url)
  }

  // Lookup: event.state -> sketchpad node (chord/scale keys)
  const nodeMap = useMemo(() => {
    if (!sketchpad?.nodes) return {}
    return Object.fromEntries(sketchpad.nodes.map((n) => [n.id, n]))
  }, [sketchpad])

  // Initialize YouTube player; tear down when the piece (or its video) changes
  useEffect(() => {
    if (!skeleton?.youtube_id) return

    let cancelled = false
    loadYouTubeAPI().then((YT) => {
      if (cancelled) return
      playerRef.current = new YT.Player('youtube-player', {
        videoId: skeleton.youtube_id
      })
    })
    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy?.()
      } catch {
        // player element may already be unmounted
      }
      playerRef.current = null
    }
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
  // YouTube bar always re-derives and rebroadcasts the harmonic state.
  // No video = no clock: the piece is driven by clicking timeline events.
  useEffect(() => {
    if (!skeleton?.youtube_id) return
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

  // Verify hostship, then start broadcasting to the live room
  const connectLiveRoom = useCallback(async (user) => {
    const check = await verifyRoomHost(liveRoomId, user)
    if (!check.ok) {
      setEnsembleError(check.reason)
      return
    }
    setEnsembleError('')
    setEnsembleRoomId(liveRoomId)
  }, [liveRoomId])

  // Google popups must come from a click, so live mode shows a button when
  // there's no signed-in (non-anonymous) session yet.
  const handleLiveSignIn = async () => {
    try {
      const user = await signInWithGoogle()
      setNeedsLiveSignIn(false)
      await connectLiveRoom(user)
    } catch (err) {
      console.error('[ensemble] live sign-in failed', err)
      setEnsembleError('Google sign-in failed. Reload and try again.')
    }
  }

  // Setup on mount.
  // Normal: silent guest identity + private rehearsal room. No buttons.
  // Live (?room=): reuse a persisted Google session, or ask for one click.
  useEffect(() => {
    let cancelled = false

    if (liveRoomId) {
      getCurrentUser()
        .then((user) => {
          if (cancelled) return
          if (user && !user.isAnonymous) return connectLiveRoom(user)
          setNeedsLiveSignIn(true)
        })
        .catch((err) => {
          console.error('[ensemble] live room setup failed', err)
          if (!cancelled) setEnsembleError('Could not connect to the live room.')
        })
      return () => { cancelled = true }
    }

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
  }, [liveRoomId, connectLiveRoom])

  // Anticipation contract (lalork-website#117): backfill anticipationMs onto
  // rooms created before the contract (incl. la-laptop-orchestra). One-time,
  // never overwrites an existing value.
  useEffect(() => {
    if (!ensembleRoomId) return
    ensureAnticipationMs(ensembleRoomId).catch((err) =>
      console.error('[ensemble] anticipationMs backfill failed', err)
    )
  }, [ensembleRoomId])

  // Form channel (rehearse#12): contour written once per piece load; playhead
  // written on a throttle below. Pieces without contour data write null so
  // receivers hide the strip (real data lands in the lalork#1 pass).
  const lastFormPositionRef = useRef(-1)
  useEffect(() => {
    if (!ensembleRoomId || !skeleton) return
    lastFormPositionRef.current = -1
    setFormContour(ensembleRoomId, skeleton.formContour || null, Boolean(liveRoomId))
      .catch((err) => console.error('[ensemble] formContour write failed', err))
  }, [ensembleRoomId, skeleton, liveRoomId])

  // Throttled formPosition broadcast: one small write every 2s while the
  // position actually moves. Video clock when there is one; otherwise the
  // current event's beat position over the piece's total beats.
  const currentEventRef = useRef(null)
  useEffect(() => {
    currentEventRef.current = currentEvent
  }, [currentEvent])
  useEffect(() => {
    if (!ensembleRoomId || !skeleton) return
    const totalBeats = skeleton.events?.length
      ? skeleton.events[skeleton.events.length - 1].time
      : 0
    const id = setInterval(() => {
      let position = null
      const duration = playerRef.current?.getDuration?.() || 0
      if (duration > 0) {
        position = (playerRef.current?.getCurrentTime?.() || 0) / duration
      } else if (totalBeats > 0 && currentEventRef.current) {
        position = currentEventRef.current.time / totalBeats
      }
      if (position == null || !Number.isFinite(position)) return
      position = Math.min(1, Math.max(0, position))
      if (Math.abs(position - lastFormPositionRef.current) < 0.005) return
      lastFormPositionRef.current = position
      setFormPosition(ensembleRoomId, position, Boolean(liveRoomId)).catch(
        (err) => console.error('[ensemble] formPosition write failed', err)
      )
    }, 2000)
    return () => clearInterval(id)
  }, [ensembleRoomId, skeleton, liveRoomId])

  // Live conductor direction handlers (Set replaces / Clear empties)
  const handleSetDirection = (value) => {
    if (!ensembleRoomId || !value) return
    setLiveDirection(ensembleRoomId, value, Boolean(liveRoomId))
      .then(() => setLiveDirectionSent(value))
      .catch((err) => console.error('[ensemble] live direction failed', err))
  }
  const handleClearDirection = () => {
    if (!ensembleRoomId) return
    setLiveDirection(ensembleRoomId, null, Boolean(liveRoomId))
      .then(() => setLiveDirectionSent(null))
      .catch((err) => console.error('[ensemble] live direction clear failed', err))
  }

  // Next event's node: shown in this portal's Next slots AND broadcast to
  // the room (nextScaleData/nextChordData, lalork-website#112) so every
  // subscriber (enter portal, room tabs, TV) can show what's coming. Null
  // when there is no next event (last event / no skeleton), so receivers
  // show a blank Next slot instead of stale junk.
  const nextEvent =
    skeleton && currentIndex >= 0 && currentIndex + 1 < skeleton.events.length
      ? skeleton.events[currentIndex + 1]
      : null
  const nextNode = nextEvent ? nodeMap[nextEvent.state] : null

  // Debounced broadcast on state change (copied from MidiChordScalePage)
  useEffect(() => {
    if (!ensembleRoomId) return

    if (broadcastTimeoutRef.current) {
      clearTimeout(broadcastTimeoutRef.current)
    }

    const chordToSend = selectedChordKey || null
    const scaleToSend = selectedScaleKey || null
    const directionToSend = currentDirection || null
    const nextChordToSend = nextNode?.chord || null
    const nextScaleToSend = nextNode?.scale || null

    broadcastTimeoutRef.current = setTimeout(() => {
      console.log('[ensemble broadcast] sending:', {
        roomId: ensembleRoomId,
        chordKey: chordToSend,
        scaleKey: scaleToSend,
        nextChordKey: nextChordToSend,
        nextScaleKey: nextScaleToSend,
        bpm: ensembleBpm,
        scoreDirection: directionToSend,
      })

      updateEnsembleState({
        roomId: ensembleRoomId,
        bpm: ensembleBpm,
        chordKey: chordToSend,
        scaleKey: scaleToSend,
        nextChordKey: nextChordToSend,
        nextScaleKey: nextScaleToSend,
        // Score channel only — live `direction` belongs to the conductor
        // input (setLiveDirection) and is never written by playback (#114)
        scoreDirection: directionToSend,
        // Live rooms must never get rehearsal TTL fields (auto-deletion)
        live: Boolean(liveRoomId),
      }).catch((err) => {
        console.error('[ensemble] failed to update state', err)
      })
    }, BROADCAST_DEBOUNCE_MS)

    return () => {
      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current)
      }
    }
  }, [ensembleRoomId, ensembleBpm, selectedChordKey, selectedScaleKey, currentDirection, liveRoomId, nextNode])

  const currentNode = currentEvent ? nodeMap[currentEvent.state] : null

  // Local form-strip playhead (#116): the current event's beat over the
  // piece's total beats — the same fallback the 2s broadcast uses. Event
  // resolution is enough for the conductor's own strip.
  const formTotalBeats = skeleton?.events?.length
    ? skeleton.events[skeleton.events.length - 1].time
    : 0
  const formStripPosition =
    formTotalBeats > 0 && currentEvent
      ? Math.min(1, Math.max(0, currentEvent.time / formTotalBeats))
      : null

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
    ? `${liveRoomId
        ? `// LIVE ROOM (${liveRoomId}) — this follows the conductor's broadcast`
        : '// PRIVATE REHEARSAL ROOM — on show day, get your snippet from enter.lalaptoporchestra.com'}
// Every line below follows this app's harmony: when the scale or
// chord changes here, the patterns update by themselves.

const { joinEnsemble } = await import('https://cdn.jsdelivr.net/npm/strudel-scalenav@0.8.0/dist/strudel-scalenav.js')

const ens = await joinEnsemble('${ensembleRoomId}')
ens.showPortal() // LALORK portal HUD docked at the bottom (scale/chord/tempo + direction cues + form strip)
// ens.showBadge() // minimal alternative: room + current scale/chord, top of the screen

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
      <div className="app-header">
        <h1>Rehearse LA Laptop Orchestra</h1>
        <select
          className="piece-select"
          value={pieceId}
          onChange={(e) => handlePieceChange(e.target.value)}
          aria-label="Select piece"
        >
          {PIECES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {skeleton.youtube_id ? (
        <div className="video-container">
          <div id="youtube-player"></div>
        </div>
      ) : (
        <div className="no-video-note">
          No video for this piece yet — click timeline events to advance the harmony by hand.
        </div>
      )}

      <div className="status-row">
        {skeleton.youtube_id && (
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
        )}
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
        direction={liveDirectionSent}
        scoreDirection={currentDirection}
        formContour={skeleton.formContour || null}
        formPosition={formStripPosition}
      />

      {isNarrow && (
        <div className="ensemble-strip">
          {ensembleError ? (
            <span className="ensemble-status ensemble-error">{ensembleError}</span>
          ) : needsLiveSignIn ? (
            <button className="ensemble-button" onClick={handleLiveSignIn}>
              Continue with Google to conduct {liveRoomId}
            </button>
          ) : !ensembleRoomId ? (
            <span className="ensemble-status">
              {liveRoomId ? 'Connecting to live room…' : 'Setting up your private room…'}
            </span>
          ) : liveRoomId ? (
            <span className="ensemble-status live-status">
              <span className="live-dot live-dot-red" /> LIVE <strong>{ensembleRoomId}</strong>
            </span>
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
              min={-5000}
              max={5000}
              value={leadMs}
              onChange={(e) => setLeadMs(Math.max(-5000, Math.min(5000, Number(e.target.value) || 0)))}
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
          ) : needsLiveSignIn ? (
            <button className="ensemble-button" onClick={handleLiveSignIn}>
              Continue with Google to conduct {liveRoomId}
            </button>
          ) : !ensembleRoomId ? (
            <div className="ensemble-status">
              {liveRoomId
                ? 'Connecting to live room…'
                : 'Setting up your private rehearsal room…'}
            </div>
          ) : liveRoomId ? (
            <div className="ensemble-status live-status">
              <span className="live-dot live-dot-red" /> LIVE — conducting{' '}
              <strong>{ensembleRoomId}</strong>
            </div>
          ) : (
            <div className="ensemble-status">
              <span className="live-dot" /> Private rehearsal active
            </div>
          )}
        </div>

        <div className="resources">
          {ensembleRoomId && (
            <div className="rehearsal-code-box">
              <div className="rehearsal-code-label">
                {liveRoomId ? 'Live room code' : 'Your rehearsal code'}
              </div>
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
                  min={-5000}
                  max={5000}
                  value={leadMs}
                  onChange={(e) => setLeadMs(Math.max(-5000, Math.min(5000, Number(e.target.value) || 0)))}
                />
                <span>ms</span>
              </label>
              <div className="advanced-hint">
                Positive = fire changes early (beat network latency).
                Negative = delay changes (when the video reaches players late).
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

      {/* Conductor-only (?room= live mode, signed in as host): private
          rehearsal users have no audience for live cues, so no panel. */}
      {liveRoomId && ensembleRoomId && (
        <DirectionPanel
          direction={liveDirectionSent}
          onSet={handleSetDirection}
          onClear={handleClearDirection}
        />
      )}
      </div>
    </div>
  )
}
