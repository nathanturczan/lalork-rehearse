// --- Piece file validation ---------------------------------------------------
// One check for a skeleton + sketchpad pair, used by scripts/import-piece.mjs
// (a failing piece is not imported) and by the app after fetch (a failing
// piece shows an error instead of rendering). Returns a list of problems as
// readable strings; an empty list means the pair is usable.
//
// Not checked: whether a non-custom chord key exists in the receivers' chord
// catalogue, which this repository does not carry.
import ScaleRegistry from './scaleRegistry.js'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export function validatePiece(skeleton, sketchpad) {
  const problems = []

  if (!isObject(skeleton)) return ['The piece file is not a JSON object.']
  if (!isObject(sketchpad)) return ['The sketchpad file is not a JSON object.']

  if (!(typeof skeleton.tempo === 'number' && Number.isFinite(skeleton.tempo) && skeleton.tempo > 0)) {
    problems.push(`"tempo" must be a positive number (found ${JSON.stringify(skeleton.tempo)}).`)
  }

  const nodes = sketchpad.nodes
  if (!Array.isArray(nodes)) {
    problems.push('The sketchpad has no "nodes" array.')
  }
  const customScales = isObject(sketchpad.scales) ? sketchpad.scales : {}
  for (const [key, def] of Object.entries(customScales)) {
    if (!isObject(def) || !Array.isArray(def.pitchClasses ?? def.pitch_classes)) {
      problems.push(`Custom scale "${key}" has no pitchClasses array.`)
    }
  }

  const nodeIds = new Set()
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!isObject(node) || typeof node.id !== 'string' || !node.id) {
      problems.push('A sketchpad node has no "id".')
      continue
    }
    nodeIds.add(node.id)
    if (node.scale != null) {
      if (typeof node.scale !== 'string') {
        problems.push(`Node "${node.id}": "scale" must be a string.`)
      } else if (!(node.scale in customScales) && !(node.scale in ScaleRegistry)) {
        problems.push(
          `Node "${node.id}": scale "${node.scale}" is neither a registry scale nor defined in the sketchpad's "scales" block.`
        )
      }
    }
    if (node.chord != null) {
      if (typeof node.chord !== 'string') {
        problems.push(`Node "${node.id}": "chord" must be a string or null.`)
      } else if (
        node.chord.startsWith('customchord_') &&
        !Array.isArray(node.custom?.chord?.pitchClasses)
      ) {
        problems.push(
          `Node "${node.id}": custom chord "${node.chord}" has no custom.chord.pitchClasses.`
        )
      }
    }
  }

  const events = skeleton.events
  if (!Array.isArray(events)) {
    problems.push('The piece file has no "events" array.')
    return problems
  }
  let previous = -Infinity
  events.forEach((event, i) => {
    const where = `Event ${i + 1}`
    if (!isObject(event)) {
      problems.push(`${where} is not an object.`)
      return
    }
    if (!(typeof event.time === 'number' && Number.isFinite(event.time) && event.time >= 0)) {
      problems.push(`${where}: "time" must be a number of beats (found ${JSON.stringify(event.time)}).`)
    } else {
      if (event.time < previous) {
        problems.push(`${where}: time ${event.time} is earlier than the event before it (${previous}).`)
      }
      previous = event.time
    }
    if (typeof event.state !== 'string' || !nodeIds.has(event.state)) {
      problems.push(`${where}: state ${JSON.stringify(event.state)} is not a sketchpad node.`)
    }
  })

  return problems
}

// One line for an error message: the first problem, and how many more
export function summarizeProblems(problems) {
  if (!problems.length) return ''
  const more = problems.length - 1
  return more > 0
    ? `${problems[0]} (and ${more} more ${more === 1 ? 'problem' : 'problems'})`
    : problems[0]
}
