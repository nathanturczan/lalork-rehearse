# LALORK Rehearse

Video-synced rehearsal tool for the LA Laptop Orchestra. A piece plays as a YouTube video, the app follows the video clock, and at each event of the piece it broadcasts the current scale and chord to a room that players' instruments follow.

**URL**: https://rehearse.lalaptoporchestra.com

## What it does

1. A piece is a YouTube video plus two JSON files: a skeleton (when things change) and a sketchpad (what the harmony is at each change).
2. The app polls the video's current time, playing or paused, and finds the current event. Scrubbing the video or clicking a timeline row moves to that event.
3. On each event change it writes the chord, the scale, the next chord and scale, the tempo, and the score direction to a room document in Firestore. Enter, the Strudel bridge, the Ableton bridge, and Ensemble Jammer read the same room.
4. The portal at the top of the page shows what the room receives: scale and chord now and next, tempo, directions, and the form strip with its playhead.

Pieces without a video are advanced by hand from the timeline.

## Two modes

- **Private rehearsal (default).** The browser gets an anonymous identity and its own room (`rehearse-xxxxxx`), remembered in local storage. The page shows the room code, a link that opens Strudel with a snippet joined to that room, and the Ableton template and Max for Live bridge downloads.
- **Conductor (`?room=<roomId>`).** The app broadcasts to an existing room. It asks for a Google sign-in and only works for the account that hosts the room. This mode adds a panel for typing live directions.

URL parameters:

| Parameter | Meaning |
|---|---|
| `?piece=<id>` | Select a piece by id (the list is `PIECES` in `src/App.jsx`) |
| `?room=<roomId>` | Conductor mode for that room |

Under "Advanced settings", **Broadcast lead** fires changes a number of milliseconds before the video reaches them, to absorb network latency. It is stored per browser.

## Piece files

Each piece is `pieces/<id>.json` (skeleton) and `pieces/<id>_sketchpad.json`. The `pieces/` folder is served as the site root.

Skeleton:

```json
{
  "title": "CFGC Ostinato",
  "tempo": 120,
  "youtube_id": "xxxxxxxxxxx",
  "events": [
    {
      "time": 0,
      "state": "Bbmaj7",
      "direction": { "marking": "", "lyric": "", "note": "Cycle 1. The riff plain." }
    },
    { "time": 32, "state": "X1" }
  ],
  "formContour": [[0.0, 0.03], [0.5, 0.9], [1.0, 0.1]],
  "formSections": [168, 224],
  "formGlyphs": [{ "type": "patch", "startBeat": 0, "endBeat": 112 }]
}
```

- `tempo` is in beats per minute, and `time` is in **beats at that tempo** from the start of the video. Events are in ascending order.
- `state` is the `id` of a sketchpad node.
- `direction` is optional: an object with `marking`, `lyric`, and `note`, or a plain string.
- `youtube_id` is optional. Without it the piece is advanced from the timeline.
- `formContour` (points from 0 to 1), `formSections` (beats), and `formGlyphs` (beat ranges) are optional and drive the form strip.

Sketchpad:

```json
{
  "name": "CFGC Ostinato",
  "nodes": [
    { "id": "Bbmaj7", "scale": "f_diatonic", "chord": "as_M7-0" },
    {
      "id": "X1",
      "scale": "df_para_lydian",
      "chord": "customchord_x_1",
      "custom": { "chord": { "name": "C-E-F", "root": 0, "pitchClasses": [0, 4, 5], "voicing": [48, 64, 65] } }
    }
  ],
  "scales": {
    "df_para_lydian": { "name": "Db Para-Lydian", "root": 1, "pitchClasses": [0, 1, 3, 5, 6.5, 8, 10] }
  }
}
```

- `scale` is a key of the built-in registry (`src/scaleRegistry.js`, sharp tokens only: `as_diatonic`, `octatonic_1`) or a key of the sketchpad's own `scales` block.
- `chord` is a chord key that receivers know, a `customchord_…` id with its notes in `custom.chord`, or `null`.

`src/validatePiece.js` checks a skeleton and sketchpad pair. The app runs it when a piece loads and shows an error if it fails.

## Adding a piece

```bash
node scripts/import-piece.mjs <songDir> <pieceId>
```

This reads `<songDir>/skeleton_<pieceId>.json` and `<songDir>/sketchpad_<pieceId>.json`, converts scale names to keys, validates the result, and writes the two files into `pieces/`. Then add `{ id, label }` to `PIECES` in `src/App.jsx`.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # node --test src/
npm run build    # production build into dist/
```

The dev server talks to the same Firebase project as the deployed app.

## Tech stack

- React 18 and Vite
- YouTube IFrame Player API
- Firebase (Auth and Firestore) for the room

## Deployment

Hosted on Vercel and deployed manually. Pushing to `master` does not deploy.

## Related

- [NotesChordScales](https://github.com/nathanturczan/noteschordsscales) - Core scale/chord inference
- [Ensemble Jammer](https://github.com/nathanturczan/EnsembleJammer) - Networked instruments
- [Scale Awareness Bridge](https://github.com/nathanturczan/scale-awareness-bridge) - Ableton integration
