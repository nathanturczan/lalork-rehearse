import { useState, useEffect, useRef } from 'react'

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

export default function App() {
  const [skeleton, setSkeleton] = useState(null)
  const [currentEvent, setCurrentEvent] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [midiEnabled, setMidiEnabled] = useState(false)
  const [broadcastEnabled, setBroadcastEnabled] = useState(false)

  const playerRef = useRef(null)
  const intervalRef = useRef(null)

  // Load skeleton
  useEffect(() => {
    fetch('/pieces/wagner_oneiric_warning.json')
      .then(res => res.json())
      .then(data => setSkeleton(data))
  }, [])

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

  // Poll current time and update state
  useEffect(() => {
    if (!isPlaying || !skeleton) return

    intervalRef.current = setInterval(() => {
      const currentTime = playerRef.current?.getCurrentTime?.() || 0
      const tempo = skeleton.tempo
      const currentBeat = (currentTime / 60) * tempo

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
    }, 100)

    return () => clearInterval(intervalRef.current)
  }, [isPlaying, skeleton, currentIndex])

  // Handle event change (MIDI, broadcast, etc.)
  function onEventChange(event) {
    console.log('Event:', event.state, event.direction)

    // TODO: Send MIDI via Web MIDI API
    if (midiEnabled) {
      // sendMIDI(event.state)
    }

    // TODO: Broadcast to Ensemble Jammer
    if (broadcastEnabled) {
      // broadcast(event)
    }
  }

  if (!skeleton) return <div>Loading...</div>

  return (
    <div className="app">
      <h1>LALORK Rehearse</h1>

      <div className="video-container">
        <div id="youtube-player"></div>
      </div>

      <div className="state-display">
        <div className="slot">
          Slot {currentIndex + 1} / {skeleton.events.length}
        </div>
        <div className="state">
          {currentEvent?.state || '—'}
        </div>
      </div>

      {currentEvent?.direction && (
        <div className="direction">
          {currentEvent.direction.lyric && (
            <div className="lyric">{currentEvent.direction.lyric}</div>
          )}
          {currentEvent.direction.marking && (
            <div className="marking">{currentEvent.direction.marking}</div>
          )}
          {currentEvent.direction.note && (
            <div className="note">{currentEvent.direction.note}</div>
          )}
        </div>
      )}

      <div className="controls">
        <label>
          <input
            type="checkbox"
            checked={midiEnabled}
            onChange={(e) => setMidiEnabled(e.target.checked)}
          />
          MIDI Output
        </label>
        <label>
          <input
            type="checkbox"
            checked={broadcastEnabled}
            onChange={(e) => setBroadcastEnabled(e.target.checked)}
          />
          Broadcast Mode
        </label>
      </div>
    </div>
  )
}
