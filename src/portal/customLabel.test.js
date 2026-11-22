import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { customLabel } from './customLabel.js'
import { customChordsOf, buildChordInfo } from '../chordInfo.js'
import { buildScaleInfo } from '../scaleInfo.js'

const piece = (id) =>
  JSON.parse(readFileSync(new URL(`../../pieces/${id}_sketchpad.json`, import.meta.url), 'utf8'))

test('a custom chord is named from its payload: root, then name', () => {
  const farben = piece('farben')
  const info = buildChordInfo('customchord_farben_02', customChordsOf(farben))
  assert.equal(customLabel(info), 'C C-E-F-G#-A-B')
})

test('a custom scale is named root, then name, in the root spelling the caller gives', () => {
  const again = piece('again')
  const paraLydian = buildScaleInfo('df_para_lydian', again.scales)
  assert.equal(customLabel(paraLydian, 'D\u266D'), 'D\u266D Para-Lydian')
  assert.equal(customLabel(paraLydian), 'C\u266F Para-Lydian')
  assert.equal(customLabel(buildScaleInfo('f_neutral_minor', again.scales)), 'F Neutral-Minor')
})

test('registry harmony has no custom label', () => {
  assert.equal(customLabel(buildScaleInfo('a_harmonic_minor', null)), null)
  assert.equal(customLabel(buildChordInfo('c_M7-0', {})), null)
  assert.equal(customLabel(null), null)
})

test('a fractional root is left out rather than misnamed', () => {
  assert.equal(customLabel({ isCustom: true, root: 0.5, name: 'C¼♯' }), 'C¼♯')
})
