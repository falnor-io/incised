// Rules for comparing two paths through one run. The point of each: when an agent is replayed from a saved step with
// something changed, the page shows where the paths split and exactly which state differs, from the saved states
// themselves, and nothing a model said about the difference.

export type Checkpoint = {
  id: string
  /** The checkpoint this one came from. A checkpoint with two children is a fork. */
  parentId?: string
  label: string
  at: string
  /** The agent's state at this point. */
  values?: Record<string, unknown>
}
export type StateChange = { path: string; kind: 'added' | 'removed' | 'changed'; before?: unknown; after?: unknown }
export type BranchComparison = {
  /** The last checkpoint both paths share. Undefined when they share none. */
  divergedAt?: Checkpoint
  common: Checkpoint[]
  onlyA: Checkpoint[]
  onlyB: Checkpoint[]
  changes: StateChange[]
  text: string
}

/** From the first checkpoint to `id`. A cycle or a missing parent ends the walk instead of looping. */
export function pathTo(cps: Checkpoint[], id: string): Checkpoint[] {
  const byId = new Map(cps.map((c) => [c.id, c]))
  const out: Checkpoint[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return out
}

export const children = (cps: Checkpoint[], id: string) => cps.filter((c) => c.parentId === id)
/** Ends of a path: checkpoints nothing continued from. */
export const leaves = (cps: Checkpoint[]) => cps.filter((c) => !cps.some((o) => o.parentId === c.id))
/** Checkpoints a run was replayed from with something changed: more than one child. */
export const forkPoints = (cps: Checkpoint[]) => cps.filter((c) => children(cps, c.id).length > 1)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Differences between two saved states. Objects are compared key by key and lists index by index. */
export function diffValues(a: unknown, b: unknown, path = ''): StateChange[] {
  if (same(a, b)) return []
  if (isObj(a) && isObj(b)) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap((k) => {
      const p = path ? `${path}.${k}` : k
      if (!(k in a)) return [{ path: p, kind: 'added' as const, after: b[k] }]
      if (!(k in b)) return [{ path: p, kind: 'removed' as const, before: a[k] }]
      return diffValues(a[k], b[k], p)
    })
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i).flatMap((i) => {
      const p = `${path}[${i}]`
      if (i >= a.length) return [{ path: p, kind: 'added' as const, after: b[i] }]
      if (i >= b.length) return [{ path: p, kind: 'removed' as const, before: a[i] }]
      return diffValues(a[i], b[i], p)
    })
  }
  return [{ path: path || '(whole state)', kind: 'changed', before: a, after: b }]
}

export function compareBranches(cps: Checkpoint[], aId: string, bId: string): BranchComparison {
  const a = pathTo(cps, aId)
  const b = pathTo(cps, bId)
  let k = 0
  while (k < a.length && k < b.length && a[k]!.id === b[k]!.id) k++
  const common = a.slice(0, k)
  const onlyA = a.slice(k)
  const onlyB = b.slice(k)
  const endA = a[a.length - 1]
  const endB = b[b.length - 1]
  const changes = endA && endB ? diffValues(endA.values ?? {}, endB.values ?? {}) : []
  const divergedAt = common[common.length - 1]
  let text: string
  if (!endA || !endB) text = 'One of the two checkpoints is not in the history.'
  else if (aId === bId) text = 'These are the same checkpoint.'
  else if (!divergedAt) text = 'These two paths never meet.'
  else if (onlyA.length === 0 || onlyB.length === 0) text = `One path continues from the other after "${divergedAt.label}".`
  else text = `The paths split after "${divergedAt.label}". One took ${onlyA.length} more ${onlyA.length === 1 ? 'step' : 'steps'} and the other ${onlyB.length}. They end ${changes.length === 0 ? 'in the same state' : `with ${changes.length} ${changes.length === 1 ? 'difference' : 'differences'} in state`}.`
  return { divergedAt, common, onlyA, onlyB, changes, text }
}
