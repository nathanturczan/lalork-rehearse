import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { validatePiece, summarizeProblems } from './validatePiece.js'

const piecesDir = new URL('../pieces/', import.meta.url)
const read = (name) => JSON.parse(readFileSync(new URL(name, piecesDir), 'utf8'))

const good = () => ({
  skeleton: { tempo: 120, events: [{ time: 0, state: 'a' }, { time: 8, state: 'b' }] },
  sketchpad: {
    nodes: [
      { id: 'a', scale: 'c_diatonic', chord: 'c_M7-0' },
      { id: 'b', scale: 'df_para_lydian', chord: null },
    ],
    scales: { df_para_lydian: { name: 'Db Para-Lydian', root: 1, pitchClasses: [0, 1, 3, 5, 6.5, 8, 10] } },
  },
})

test('every piece in pieces/ is valid', () => {
  const ids = readdirSync(piecesDir)
    .filter((f) => f.endsWith('_sketchpad.json'))
    .map((f) => f.slice(0, -'_sketchpad.json'.length))
  assert.ok(ids.length > 0)
  for (const id of ids) {
    assert.deepEqual(validatePiece(read(`${id}.json`), read(`${id}_sketchpad.json`)), [], id)
  }
})

test('a well-formed pair has no problems', () => {
  const { skeleton, sketchpad } = good()
  assert.deepEqual(validatePiece(skeleton, sketchpad), [])
})

test('a missing or zero tempo is reported', () => {
  for (const tempo of [undefined, 0, -60, '120', NaN]) {
    const { skeleton, sketchpad } = good()
    skeleton.tempo = tempo
    assert.match(validatePiece(skeleton, sketchpad).join('\n'), /"tempo" must be a positive number/)
  }
})

test('a skeleton without an events array is reported', () => {
  const { skeleton, sketchpad } = good()
  delete skeleton.events
  assert.match(validatePiece(skeleton, sketchpad).join('\n'), /no "events" array/)
})

test('events out of order and non-numeric times are reported', () => {
  const { skeleton, sketchpad } = good()
  skeleton.events = [{ time: 8, state: 'a' }, { time: 4, state: 'b' }, { time: '12', state: 'a' }]
  const problems = validatePiece(skeleton, sketchpad).join('\n')
  assert.match(problems, /Event 2: time 4 is earlier than the event before it \(8\)/)
  assert.match(problems, /Event 3: "time" must be a number of beats/)
})

test('an event whose state is not a node is reported', () => {
  const { skeleton, sketchpad } = good()
  skeleton.events[1].state = 'missing'
  assert.match(validatePiece(skeleton, sketchpad).join('\n'), /Event 2: state "missing" is not a sketchpad node/)
})

test('a scale key that is in neither the registry nor the scales block is reported', () => {
  const { skeleton, sketchpad } = good()
  sketchpad.nodes[0].scale = 'bf_diatonic' // the registry key is as_diatonic
  assert.match(validatePiece(skeleton, sketchpad).join('\n'), /Node "a": scale "bf_diatonic" is neither/)
})

test('a custom chord without its notes is reported', () => {
  const { skeleton, sketchpad } = good()
  sketchpad.nodes[0].chord = 'customchord_x_1'
  assert.match(validatePiece(skeleton, sketchpad).join('\n'), /custom chord "customchord_x_1" has no custom.chord.pitchClasses/)
  sketchpad.nodes[0].custom = { chord: { name: 'X', root: 0, pitchClasses: [0, 4, 7] } }
  assert.deepEqual(validatePiece(skeleton, sketchpad), [])
})

test('files that are not objects are reported without throwing', () => {
  assert.equal(validatePiece(null, {}).length, 1)
  assert.equal(validatePiece({}, []).length, 1)
})

test('summary gives the first problem and a count of the rest', () => {
  assert.equal(summarizeProblems([]), '')
  assert.equal(summarizeProblems(['a']), 'a')
  assert.equal(summarizeProblems(['a', 'b']), 'a (and 1 more problem)')
  assert.equal(summarizeProblems(['a', 'b', 'c']), 'a (and 2 more problems)')
})
