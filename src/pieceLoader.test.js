import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPiece } from './pieceLoader.js'

const ok = (data) => ({ ok: true, status: 200, json: async () => data })
const files = {
  '/p.json': ok({ tempo: 120, events: [] }),
  '/p_sketchpad.json': ok({ nodes: [] }),
}
const fetchFrom = (map) => async (url) => {
  const res = map[url]
  if (res instanceof Error) throw res
  return res
}

test('loads the skeleton and the sketchpad together', async () => {
  const piece = await loadPiece('p', fetchFrom(files))
  assert.deepEqual(piece, { skeleton: { tempo: 120, events: [] }, sketchpad: { nodes: [] } })
})

test('a 404 for either file rejects with a message naming the file', async () => {
  const notFound = { ok: false, status: 404, json: async () => { throw new SyntaxError('Unexpected token') } }
  await assert.rejects(
    loadPiece('p', fetchFrom({ ...files, '/p_sketchpad.json': notFound })),
    /sketchpad file \(HTTP 404\)/
  )
  await assert.rejects(
    loadPiece('p', fetchFrom({ ...files, '/p.json': notFound })),
    /piece file \(HTTP 404\)/
  )
})

test('a network error rejects with a readable message', async () => {
  await assert.rejects(
    loadPiece('p', fetchFrom({ ...files, '/p.json': new TypeError('Failed to fetch') })),
    /piece file \(network error\)/
  )
})

test('a body that is not JSON rejects with a readable message', async () => {
  const html = { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }
  await assert.rejects(
    loadPiece('p', fetchFrom({ ...files, '/p_sketchpad.json': html })),
    /sketchpad file is not valid JSON/
  )
})
