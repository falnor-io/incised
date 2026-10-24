// Pure logic for the trace explorer: tree, self time, critical path and the share of time by kind.
// Kept free of React so it can be tested and reused.

export type SpanKind = 'llm' | 'tool' | 'retrieval' | 'gate' | 'human' | 'agent'
export type SpanStatus = 'ok' | 'error' | 'blocked'
export type Span = {
  id: string
  parentId?: string
  name: string
  kind: SpanKind
  startMs: number
  durationMs: number
  status: SpanStatus
  attrs?: Record<string, string | number | boolean>
  input?: unknown
  output?: unknown
  tokens?: { in: number; out: number }
  costUsd?: number
}

export type TraceNode = { span: Span; depth: number; children: TraceNode[]; parent?: TraceNode }

export const endOf = (s: Span) => s.startMs + s.durationMs

/** Negative or non-finite times are clamped, so one bad span cannot break the axis. */
export function cleanSpans(spans: Span[]): Span[] {
  const seen = new Set<string>()
  return spans
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .map((s) => ({ ...s, startMs: Number.isFinite(s.startMs) ? Math.max(0, s.startMs) : 0, durationMs: Number.isFinite(s.durationMs) ? Math.max(0, s.durationMs) : 0 }))
}

/** Roots first. A span whose parent is missing becomes a root, and a cycle is cut so nothing is dropped. */
export function buildTree(spans: Span[]): TraceNode[] {
  const byId = new Map(spans.map((s) => [s.id, s]))
  const kids = new Map<string, Span[]>()
  const roots: Span[] = []
  for (const s of spans) {
    if (s.parentId && s.parentId !== s.id && byId.has(s.parentId)) kids.set(s.parentId, [...(kids.get(s.parentId) ?? []), s])
    else roots.push(s)
  }
  const seen = new Set<string>()
  const walk = (s: Span, depth: number, parent?: TraceNode): TraceNode => {
    seen.add(s.id)
    const node: TraceNode = { span: s, depth, children: [], parent }
    node.children = (kids.get(s.id) ?? []).filter((c) => !seen.has(c.id)).sort((a, b) => a.startMs - b.startMs).map((c) => walk(c, depth + 1, node))
    return node
  }
  const tree = roots.sort((a, b) => a.startMs - b.startMs).map((r) => walk(r, 0))
  for (const s of spans) if (!seen.has(s.id)) tree.push(walk(s, 0))
  return tree
}

export function flatten(nodes: TraceNode[], collapsed?: Set<string>): TraceNode[] {
  return nodes.flatMap((n) => [n, ...(collapsed?.has(n.span.id) ? [] : flatten(n.children, collapsed))])
}

/** Union length of intervals, after clipping them into [lo, hi]. */
export function coveredMs(intervals: [number, number][], lo: number, hi: number): number {
  const clipped = intervals.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  let total = 0
  let curEnd = -Infinity
  let curStart = 0
  for (const [a, b] of clipped) {
    if (a > curEnd) {
      if (curEnd > -Infinity) total += curEnd - curStart
      curStart = a
      curEnd = b
    } else curEnd = Math.max(curEnd, b)
  }
  if (curEnd > -Infinity) total += curEnd - curStart
  return total
}

/** Time spent in the span itself: its duration minus the time its children cover (children may overlap). */
export function selfMs(node: TraceNode): number {
  const s = node.span
  return Math.max(0, s.durationMs - coveredMs(node.children.map((c) => [c.span.startMs, endOf(c.span)]), s.startMs, endOf(s)))
}

/**
 * The spans that decide when the trace ends. Walk back from the end of a span: take the child that finishes
 * last before the cursor, then move the cursor to that child's start and repeat, recursing into each one.
 */
export function criticalPath(roots: TraceNode[]): Set<string> {
  const out = new Set<string>()
  const visit = (n: TraceNode) => {
    out.add(n.span.id)
    let cursor = endOf(n.span)
    const kids = [...n.children].sort((a, b) => endOf(b.span) - endOf(a.span))
    for (;;) {
      const next = kids.find((c) => endOf(c.span) <= cursor + 1e-9 && !out.has(c.span.id))
      if (!next) break
      visit(next)
      cursor = next.span.startMs
    }
  }
  const last = [...roots].sort((a, b) => endOf(b.span) - endOf(a.span))[0]
  if (last) visit(last)
  return out
}

export type KindShare = { kind: SpanKind; selfMs: number; share: number; count: number }

/** Share of total self time by kind, largest first. This is what the legend shows. */
export function kindShares(nodes: TraceNode[]): KindShare[] {
  const by = new Map<SpanKind, { ms: number; n: number }>()
  for (const n of nodes) {
    const cur = by.get(n.span.kind) ?? { ms: 0, n: 0 }
    by.set(n.span.kind, { ms: cur.ms + selfMs(n), n: cur.n + 1 })
  }
  const total = [...by.values()].reduce((a, b) => a + b.ms, 0) || 1
  return [...by].map(([kind, v]) => ({ kind, selfMs: v.ms, share: v.ms / total, count: v.n })).sort((a, b) => b.selfMs - a.selfMs)
}

export function traceBounds(spans: Span[]): { start: number; end: number } {
  if (!spans.length) return { start: 0, end: 1 }
  return { start: Math.min(...spans.map((s) => s.startMs)), end: Math.max(...spans.map(endOf), 1) }
}

/**
 * Row for each span in a flame graph. Children that overlap in time (parallel calls) are packed into separate
 * lanes below their parent, so nothing is drawn on top of anything else, and each lane makes room for its
 * own descendants.
 */
export function layoutRows(roots: TraceNode[]): { rows: Map<string, number>; count: number } {
  const rows = new Map<string, number>()
  const height = (n: TraceNode): number => 1 + laneInfo(n).total
  const laneCache = new Map<TraceNode, { lanes: TraceNode[][]; heights: number[]; total: number }>()
  function laneInfo(n: TraceNode) {
    const hit = laneCache.get(n)
    if (hit) return hit
    const lanes: TraceNode[][] = []
    const ends: number[] = []
    for (const c of [...n.children].sort((a, b) => a.span.startMs - b.span.startMs)) {
      let l = ends.findIndex((e) => e <= c.span.startMs + 1e-9)
      if (l < 0) l = ends.length
      ;(lanes[l] ??= []).push(c)
      ends[l] = endOf(c.span)
    }
    const heights = lanes.map((lane) => Math.max(...lane.map(height)))
    const info = { lanes, heights, total: heights.reduce((a, b) => a + b, 0) }
    laneCache.set(n, info)
    return info
  }
  const place = (n: TraceNode, row: number) => {
    rows.set(n.span.id, row)
    const { lanes, heights } = laneInfo(n)
    let base = row + 1
    lanes.forEach((lane, i) => {
      for (const c of lane) place(c, base)
      base += heights[i]!
    })
  }
  let next = 0
  for (const r of [...roots].sort((a, b) => a.span.startMs - b.span.startMs)) {
    place(r, next)
    next += height(r)
  }
  return { rows, count: Math.max(next, 1) }
}
