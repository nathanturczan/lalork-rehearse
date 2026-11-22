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
      hasEvent: true,
      hasBroadcast: false,
      node: { chord: 'c_M7-0', scale: 'c_diatonic' },
      nextNode: { chord: 'g_7-0', scale: 'g_acoustic' },
    }),
    { chordKey: 'c_M7-0', scaleKey: 'c_diatonic', nextChordKey: 'g_7-0', nextScaleKey: 'g_acoustic' }
  )
})

test('a node without a chord broadcasts a null chord, not the previous one', () => {
  const sent = harmonyBroadcast({ hasEvent: true, hasBroadcast: true, node: { chord: null, scale: 'd_diatonic' }, nextNode: null })
  assert.equal(sent.chordKey, null)
  assert.equal(sent.scaleKey, 'd_diatonic')
})

test('before any event has fired the harmony fields are left out entirely', () => {
  const sent = harmonyBroadcast({ hasEvent: false, hasBroadcast: false, node: null, nextNode: null })
  assert.deepEqual(sent, {})
  assert.equal('chordKey' in sent, false)
  assert.equal('scaleKey' in sent, false)
})

test('after a piece change (no event, harmony already broadcast) the harmony is cleared', () => {
  assert.deepEqual(
    harmonyBroadcast({ hasEvent: false, hasBroadcast: true, node: null, nextNode: null }),
    { chordKey: null, scaleKey: null, nextChordKey: null, nextScaleKey: null }
  )
})

test('an event whose node is missing broadcasts null harmony', () => {
  assert.deepEqual(
    harmonyBroadcast({ hasEvent: true, hasBroadcast: false, node: undefined, nextNode: undefined }),
    { chordKey: null, scaleKey: null, nextChordKey: null, nextScaleKey: null }
  )
})
