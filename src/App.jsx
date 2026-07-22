import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  useAuth,
  signInWithGoogle,
  signOut,
  createEnsembleRoom,
  updateEnsembleState,
  getUserHostedRooms,
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
  const [isPlaying, setIsPlaying] = useState(false)

  // Ensemble state (mirrors noteschordsscales MidiChordScalePage)
  const { user, initializing } = useAuth()
  const [ensembleRoomId, setEnsembleRoomId] = useState(null)
  const [ensembleRoomName, setEnsembleRoomName] = useState('')
  const [ensembleBpm, setEnsembleBpm] = useState(60)
  const [selectedChordKey, setSelectedChordKey] = useState(null)
  const [selectedScaleKey, setSelectedScaleKey] = useState(null)
  const [currentDirection, setCurrentDirection] = useState(null)
  const [isCreatingEnsemble, setIsCreatingEnsemble] = useState(false)
  const [ensembleError, setEnsembleError] = useState('')
  const [existingRooms, setExistingRooms] = useState([])
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [roomIdCopied, setRoomIdCopied] = useState(false)

  // Broadcast lead: fire state changes this many ms EARLY relative to the video,
  // to absorb Firestore fan-out + client latency. Adjustable, persisted.
  const [leadMs, setLeadMs] = useState(() => {
    const saved = localStorage.getItem('rehearse_lead_ms')
    if (saved === null) return 300
    const parsed = Number(saved)
    return Number.isFinite(parsed) ? parsed : 300
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
        videoId: skeleton.youtube_id,
        events: {
          onStateChange: (event) => {
            setIsPlaying(event.data === YT.PlayerState.PLAYING)
          }
        }
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

  // Poll current time while playing
  useEffect(() => {
    if (!isPlaying || !skeleton) return
    intervalRef.current = setInterval(syncToVideo, 100)
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, skeleton, syncToVideo])

  // Also re-sync immediately when lead (or anything else) changes while paused
  useEffect(() => {
    syncToVideo()
  }, [syncToVideo])

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

  // Fetch existing rooms when user is available
  useEffect(() => {
    if (!user?.uid) return

    setLoadingRooms(true)
    getUserHostedRooms(user.uid)
      .then((rooms) => setExistingRooms(rooms))
      .catch((err) => console.error('[ensemble] failed to fetch existing rooms', err))
      .finally(() => setLoadingRooms(false))
  }, [user])

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

  const handleCreateEnsemble = useCallback(async () => {
    if (!user) return
    const trimmed = ensembleRoomName.trim()
    if (!trimmed) return

    setIsCreatingEnsemble(true)
    setEnsembleError('')

    try {
      const { roomId } = await createEnsembleRoom({
        roomName: trimmed,
        hostUser: user,
      })
      setEnsembleRoomId(roomId)

      const rooms = await getUserHostedRooms(user.uid)
      setExistingRooms(rooms)

      await updateEnsembleState({
        roomId,
        bpm: ensembleBpm,
        chordKey: selectedChordKey || null,
        scaleKey: selectedScaleKey || null,
      })
    } catch (err) {
      console.error('[ensemble] failed to create room', err)
      setEnsembleError('Could not create ensemble.')
    } finally {
      setIsCreatingEnsemble(false)
    }
  }, [user, ensembleRoomName, ensembleBpm, selectedChordKey, selectedScaleKey])

  const handleSelectExistingRoom = useCallback((roomId) => {
    const room = existingRooms.find((r) => r.id === roomId)
    if (!room) return

    setEnsembleRoomId(roomId)
    setEnsembleRoomName(room.roomName)

    updateEnsembleState({
      roomId,
      bpm: ensembleBpm,
      chordKey: selectedChordKey || null,
      scaleKey: selectedScaleKey || null,
    }).catch((err) => {
      console.error('[ensemble] failed to update existing room', err)
    })
  }, [existingRooms, ensembleBpm, selectedChordKey, selectedScaleKey])

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

  const strudelSnippet = `const { signInWithGoogle, joinEnsemble, getCurrentUser } =
  await import('https://cdn.jsdelivr.net/npm/strudel-scalenav/dist/strudel-scalenav.js')

if (!getCurrentUser()) await signInWithGoogle()

const ens = await joinEnsemble('${ensembleRoomId || 'la-laptop-orchestra'}')
ens.showBadge()`

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
          {initializing ? (
            <span className="ensemble-status">Checking sign-in…</span>
          ) : !user ? (
            <button className="ensemble-button" onClick={() => signInWithGoogle().catch(() => {})}>
              Continue with Google
            </button>
          ) : ensembleRoomId ? (
            <span className="ensemble-status">
              <span className="live-dot" /> <strong>{ensembleRoomName}</strong>
              {' · '}
              <a href="#" onClick={(e) => { e.preventDefault(); setEnsembleRoomId(null) }}>stop</a>
            </span>
          ) : (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleSelectExistingRoom(e.target.value)
              }}
              disabled={loadingRooms}
            >
              <option value="">
                {loadingRooms ? 'Loading…' : 'Broadcast to ensemble…'}
              </option>
              {existingRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomName}
                </option>
              ))}
            </select>
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
        <div className="card-title">Ensemble Broadcast:</div>

        {initializing ? (
          <div className="ensemble-status">Checking sign-in…</div>
        ) : !user ? (
          <button className="ensemble-button" onClick={() => signInWithGoogle().catch(() => {})}>
            Continue with Google
          </button>
        ) : !ensembleRoomId ? (
          <>
            <div className="ensemble-status">
              Signed in as {user.displayName || user.email}
              {' · '}
              <a href="#" onClick={(e) => { e.preventDefault(); signOut() }}>sign out</a>
            </div>

            {existingRooms.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <label className="ensemble-label">Control existing ensemble:</label>
                <div className="ensemble-row">
                  <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleSelectExistingRoom(e.target.value)
                  }}
                  disabled={loadingRooms}
                >
                  <option value="">
                    {loadingRooms ? 'Loading…' : 'Broadcast to existing ensemble…'}
                  </option>
                    {existingRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.roomName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <label className="ensemble-label" style={{ marginTop: '12px' }}>Create new ensemble:</label>
            <div className="ensemble-row">
              <input
                type="text"
                placeholder="Name your ensemble"
                value={ensembleRoomName}
                onChange={(e) => setEnsembleRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreateEnsemble()
                  }
                }}
              />
              <button
                className="ensemble-button"
                onClick={handleCreateEnsemble}
                disabled={isCreatingEnsemble || !ensembleRoomName.trim()}
              >
                {isCreatingEnsemble ? 'Creating…' : 'Create'}
              </button>
            </div>
            {ensembleError && <div className="ensemble-error">{ensembleError}</div>}
          </>
        ) : (
          <div className="ensemble-status">
            <span className="live-dot" /> Broadcasting to <strong>{ensembleRoomName}</strong>
            {' at '}{ensembleBpm} BPM
            {' · '}
            <a href="#" onClick={(e) => { e.preventDefault(); setEnsembleRoomId(null) }}>stop</a>
          </div>
        )}

        <div className="lead-row">
          <label className="ensemble-label" htmlFor="lead-ms">
            Broadcast lead (ms) — changes fire this much early to absorb latency
          </label>
          <input
            id="lead-ms"
            type="number"
            step={50}
            min={0}
            max={5000}
            value={leadMs}
            onChange={(e) => setLeadMs(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>

        <div className="resources">
          <div className="card-title">Rehearsal resources:</div>

          {ensembleRoomId ? (
            <div className="ensemble-label room-id-row">
              Ensemble room ID: <code>{ensembleRoomId}</code>
              <button
                className="ensemble-button room-id-copy"
                onClick={() => {
                  navigator.clipboard.writeText(ensembleRoomId)
                  setRoomIdCopied(true)
                  setTimeout(() => setRoomIdCopied(false), 2000)
                }}
              >
                {roomIdCopied ? 'Copied!' : 'Copy ID'}
              </button>
            </div>
          ) : (
            <div className="ensemble-label room-id-row">
              Start broadcasting above to bake your ensemble&apos;s exact room ID
              into the Strudel code below.
            </div>
          )}

          <div className="ensemble-label">
            Strudel — paste into{' '}
            <a href="https://strudel.cc" target="_blank" rel="noopener noreferrer">strudel.cc</a>
            {ensembleRoomId ? ' (your room ID is already filled in)' : ''}:
          </div>
          <div className="strudel-snippet">
            <pre>{strudelSnippet}</pre>
            <button
              className="ensemble-button snippet-copy"
              onClick={() => {
                navigator.clipboard.writeText(strudelSnippet)
                setSnippetCopied(true)
                setTimeout(() => setSnippetCopied(false), 2000)
              }}
            >
              {snippetCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <div className="ensemble-label resources-m4l">
            Ableton —{' '}
            <a href="/Ensemble%20Bridge.amxd" download>
              download Ensemble Bridge (Max for Live)
            </a>
            {' '}and drop it on a MIDI track, then pick your ensemble from
            the device&apos;s lobby menu (or type its name)
          </div>
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
                <span className="timeline-beat">{event.time?.toFixed(1) || '?'}</span>
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
