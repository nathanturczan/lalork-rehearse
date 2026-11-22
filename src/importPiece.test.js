import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeScaleKey } from '../scripts/import-piece.mjs'

test('a flat-named root of a registry scale becomes the registry key', () => {
  assert.equal(normalizeScaleKey('Bb diatonic'), 'as_diatonic')
  assert.equal(normalizeScaleKey('Db harmonic minor'), 'cs_harmonic_minor')
  assert.equal(normalizeScaleKey('Eb acoustic'), 'ds_acoustic')
  assert.equal(normalizeScaleKey('bf_diatonic'), 'as_diatonic')
})

test('sharp and natural roots and symmetric scales are unchanged', () => {
  assert.equal(normalizeScaleKey('F diatonic'), 'f_diatonic')
  assert.equal(normalizeScaleKey('F# harmonic major'), 'fs_harmonic_major')
  assert.equal(normalizeScaleKey('a_harmonic_minor'), 'a_harmonic_minor')
  assert.equal(normalizeScaleKey('octatonic_3'), 'octatonic_3')
})

test('a flat-named custom scale keeps its own key', () => {
  assert.equal(normalizeScaleKey('Db para_lydian'), 'df_para_lydian')
  assert.equal(normalizeScaleKey('df_para_lydian'), 'df_para_lydian')
})
