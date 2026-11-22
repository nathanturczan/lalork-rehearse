import test from 'node:test'
import assert from 'node:assert/strict'
import { directionText, harmonyBroadcast } from './broadcastState.js'

test('direction joins the non-empty fields of an object direction', () => {
  assert.equal(directionText({ direction: { marking: 'p', lyric: '', note: 'strings' } }), 'p, strings')
  assert.equal(directionText({ direction: { marking: '', lyric: '' } }), null)
})

test('direction passes a string through and is null without one', () => {
  assert.equal(directionText({ direction: 'morendo' }), 'morendo')
  assert.equal(directionText({ direction: '' }), null)
  assert.equal(directionText({}), null)
  assert.equal(directionText(null), null)
})

test('harmony comes from the current node and the next node', () => {
  assert.deepEqual(
    harmonyBroadcast({
      node: { chord: 'c_M7-0', scale: 'c_diatonic' },
      nextNode: { chord: 'g_7-0', scale: 'g_acoustic' },
    }),
    { chordKey: 'c_M7-0', scaleKey: 'c_diatonic', nextChordKey: 'g_7-0', nextScaleKey: 'g_acoustic' }
  )
})

test('a node without a chord broadcasts a null chord, not the previous one', () => {
  const sent = harmonyBroadcast({ node: { chord: null, scale: 'd_diatonic' }, nextNode: null })
  assert.equal(sent.chordKey, null)
  assert.equal(sent.scaleKey, 'd_diatonic')
})

test('no event (piece just changed) or a missing node broadcasts null harmony', () => {
  assert.deepEqual(
    harmonyBroadcast({ node: null, nextNode: null }),
    { chordKey: null, scaleKey: null, nextChordKey: null, nextScaleKey: null }
  )
  assert.deepEqual(
    harmonyBroadcast({ node: undefined, nextNode: undefined }),
    { chordKey: null, scaleKey: null, nextChordKey: null, nextScaleKey: null }
  )
})
