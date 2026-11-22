// --- Piece file loading ------------------------------------------------------
// Fetches /<id>.json (skeleton) and /<id>_sketchpad.json together and turns
// every way that can fail (network error, HTTP error, a body that is not
// JSON, a pair that does not pass validatePiece) into an Error with a
// message that can be shown to the user.
import { validatePiece, summarizeProblems } from './validatePiece.js'

async function fetchJson(url, what, fetchImpl) {
  let res
  try {
    res = await fetchImpl(url)
  } catch {
    throw new Error(`Could not load the ${what} (network error).`)
  }
  if (!res.ok) {
    throw new Error(`Could not load the ${what} (HTTP ${res.status}).`)
  }
  try {
    return await res.json()
  } catch {
    throw new Error(`The ${what} is not valid JSON.`)
  }
}

export async function loadPiece(pieceId, fetchImpl = fetch) {
  const [skeleton, sketchpad] = await Promise.all([
    fetchJson(`/${pieceId}.json`, 'piece file', fetchImpl),
    fetchJson(`/${pieceId}_sketchpad.json`, 'sketchpad file', fetchImpl),
  ])
  const problems = validatePiece(skeleton, sketchpad)
  if (problems.length) {
    console.error('[rehearse] piece validation failed', problems)
    throw new Error(`This piece's files have a problem: ${summarizeProblems(problems)}`)
  }
  return { skeleton, sketchpad }
}
