import test from 'node:test'
import assert from 'node:assert/strict'
import { customChordsOf, buildChordInfo } from './chordInfo.js'

const sketchpad = { nodes: [
  { id: 'n1', scale: 'f_diatonic', chord: 'customchord_walk_1', custom: { scale: { name: 'F diatonic', root: 5, pitchClasses: [0, 2, 4, 5, 7, 9, 10] }, chord: { name: 'F', root: 5, pitchClasses: [0, 5, 9], voicing: [41, 57, 60, 65] } } },
  { id: 'n2', scale: 'c_diatonic', chord: 'c_M7-0' },
  { id: 'n3', scale: 'c_quarter_sharp_diatonic', chord: 'customchord_walk_3', custom: { chord: { name: 'C¼♯', root: 0.5, pitchClasses: [0.5, 4.5, 7.5], voicing: [48.5, 55.5, 64.5] } } },
] }

test('a custom chord broadcasts its notes, with the id the room key uses', () => {
  const info = buildChordInfo('customchord_walk_1', customChordsOf(sketchpad))
  assert.deepEqual(info, { id: 'customchord_walk_1', name: 'F', root: 5, pitchClasses: [0, 5, 9], voicing: [41, 57, 60, 65], isCustom: true })
})

test('a registry chord needs no payload', () => {
  assert.equal(buildChordInfo('c_M7-0', customChordsOf(sketchpad)), null)
})

test('fractional (24-EDO) pitch classes and voicings pass through', () => {
  const info = buildChordInfo('customchord_walk_3', customChordsOf(sketchpad))
  assert.deepEqual(info.pitchClasses, [0.5, 4.5, 7.5]); assert.deepEqual(info.voicing, [48.5, 55.5, 64.5])
})
