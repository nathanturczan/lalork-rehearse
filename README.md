# LALORK Rehearse

Video-synced practice tool for LA Laptop Orchestra. Built on NotesChordScales.

**URL**: `rehearse.laptoporchestra.com` (planned)

## Concept

1. YouTube video plays (pre-rendered with notation/tablature)
2. App monitors video `currentTime`
3. At each skeleton event, triggers:
   - Scale/chord state update
   - Direction text display (lyrics, markings, notes)
   - MIDI output (Web MIDI API)
   - Broadcast to Ensemble Jammer / Strudel (event mode)

## For Home Practice
- Load a piece (skeleton + YouTube video)
- Press play
- Follow along with directions
- MIDI output to your DAW

## For Event Day (August 15, 2026)
- Same app, "Broadcast Mode" enabled
- Nathan presses play once
- All clients receive state changes
- Video is master clock - idiot-proof

## Architecture

```
┌─────────────────────────────────────────────┐
│  [YouTube Video Embed]                       │
│   ▶ Wagner's Oneiric Warning (13:00)        │
├─────────────────────────────────────────────┤
│  Slot 14 | G#m_1 | b_diatonic               │
│                                             │
│  Lyric: "Schlä- -fern"                      │
│  Marking: Viol.II, Br. u. Vcll. Solo        │
│  Note: Schläfern = sleepers (E natural)    │
├─────────────────────────────────────────────┤
│  [MIDI: ON]  [Broadcast: OFF]               │
└─────────────────────────────────────────────┘
```

## Skeleton Schema

```json
{
  "tempo": 120.0,
  "youtube_id": "xxxxx",
  "events": [
    {
      "time": 0,
      "state": "Db7",
      "direction": {
        "lyric": "Ein-",
        "marking": "p, Str.",
        "note": "Opening, strings enter"
      }
    }
  ]
}
```

## Tech Stack

- React (or vanilla JS)
- YouTube iframe API
- Web MIDI API
- WebSocket (for broadcast mode)

## Pieces

1. **Wagner - Oneiric Warning** (Brangäne's Watch from Tristan) - 13 min, 29 slots
2. **Górecki - Symphony No. 3, Mvt 1** - ~25 min (planned)
3. TBD

## Development

```bash
npm install
npm run dev
```

## Deployment

Deploy to `rehearse.laptoporchestra.com` via Vercel/Netlify.

## Related

- [NotesChordScales](https://github.com/nathanturczan/noteschordsscales) - Core scale/chord inference
- [Ensemble Jammer](https://github.com/nathanturczan/EnsembleJammer) - Networked instruments
- [Scale Awareness Bridge](https://github.com/nathanturczan/scale-awareness-bridge) - Ableton integration
