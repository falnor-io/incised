// Pure layout for the flow canvas: layers, optional swimlanes by owner, and orthogonal edge routes.

export type FlowNode = { id: string; label: string; kind: 'start' | 'step' | 'gate' | 'end'; owner?: string; detail?: string; status?: 'done' | 'active' | 'todo' | 'blocked' }
export type FlowEdge = { from: string; to: string; label?: string; animated?: boolean }

export const NODE_W = 172
export const NODE_H = 66
const GAP_X = 84
const GAP_Y = 30
const LANE_PAD = 18

export type Point = { x: number; y: number }
export type PlacedNode = FlowNode & { x: number; y: number; layer: number; lane: number }
export type RoutedEdge = FlowEdge & { points: Point[]; label_at: Point; route: 'direct' | 'over' | 'under' }
export type Lane = { owner: string; y: number; height: number }
export type FlowLayout = { nodes: PlacedNode[]; edges: RoutedEdge[]; lanes: Lane[]; bounds: { x: number; y: number; width: number; height: number } }

/** Layers each node one past its deepest parent. Edges that would close a loop are ignored for layering. */
export function layerNodes(ids: string[], edges: { from: string; to: string }[]): Map<string, number> {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  const hasIn = new Set<string>()
  for (const e of edges) {
    if (out.has(e.from) && out.has(e.to) && e.from !== e.to) {
      out.get(e.from)!.push(e.to)
      hasIn.add(e.to)
    }
  }
  const layer = new Map<string, number>()
  const stack = new Set<string>()
  const visit = (id: string, depth: number) => {
    if (stack.has(id) || (layer.get(id) ?? -1) >= depth) return
    layer.set(id, depth)
    stack.add(id)
    for (const next of out.get(id) ?? []) visit(next, depth + 1)
    stack.delete(id)
  }
  const roots = ids.filter((id) => !hasIn.has(id))
  for (const id of roots.length ? roots : ids.slice(0, 1)) visit(id, 0)
  for (const id of ids) if (!layer.has(id)) visit(id, 0)
  return layer
}

/** A polyline with rounded corners, as an SVG path. */
export function roundedPath(points: Point[], radius = 10): string {
  if (points.length < 2) return ''
  let d = `M${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const r = Math.min(radius, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2)
    const a = unit(p0, p1)
    const b = unit(p1, p2)
    d += ` L${p1.x - a.x * r} ${p1.y - a.y * r} Q${p1.x} ${p1.y} ${p1.x + b.x * r} ${p1.y + b.y * r}`
  }
  const last = points[points.length - 1]!
  return `${d} L${last.x} ${last.y}`
}
const unit = (a: Point, b: Point): Point => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
}

export function layoutFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowLayout {
  const ids = nodes.map((n) => n.id)
  const layers = layerNodes(ids, edges)
  const useLanes = nodes.some((n) => n.owner)
  const owners = [...new Set(nodes.map((n) => n.owner ?? 'Other'))]
  const laneOf = (n: FlowNode) => (useLanes ? owners.indexOf(n.owner ?? 'Other') : 0)

  // Stack index within (lane, layer), and how tall each lane must be.
  const slot = new Map<string, number>()
  const count = new Map<string, number>()
  for (const n of nodes) {
    const key = `${laneOf(n)}:${layers.get(n.id) ?? 0}`
    slot.set(n.id, count.get(key) ?? 0)
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  const laneStack = owners.map((_, li) => Math.max(1, ...[...count].filter(([k]) => k.startsWith(`${li}:`)).map(([, c]) => c)))
  const laneHeight = laneStack.map((s) => s * NODE_H + (s - 1) * GAP_Y + LANE_PAD * 2)
  const laneTop = laneHeight.map((_, i) => laneHeight.slice(0, i).reduce((a, b) => a + b, 0))
  const maxStackAll = Math.max(...laneStack, 1)

  const placed: PlacedNode[] = nodes.map((n) => {
    const layer = layers.get(n.id) ?? 0
    const lane = laneOf(n)
    const s = slot.get(n.id) ?? 0
    let y: number
    if (useLanes) y = laneTop[lane]! + LANE_PAD + s * (NODE_H + GAP_Y)
    else {
      const inCol = count.get(`${lane}:${layer}`) ?? 1
      y = ((maxStackAll - inCol) * (NODE_H + GAP_Y)) / 2 + s * (NODE_H + GAP_Y)
    }
    return { ...n, layer, lane, x: layer * (NODE_W + GAP_X), y }
  })
  const byId = new Map(placed.map((n) => [n.id, n]))
  const cols = Math.max(...placed.map((n) => n.layer), 0) + 1
  const width = cols * NODE_W + (cols - 1) * GAP_X
  const height = useLanes ? laneHeight.reduce((a, b) => a + b, 0) : maxStackAll * NODE_H + (maxStackAll - 1) * GAP_Y

  let over = 0
  let under = 0
  const routed: RoutedEdge[] = []
  for (const e of edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) continue
    const x1 = a.x + NODE_W
    const y1 = a.y + NODE_H / 2
    const x2 = b.x
    const y2 = b.y + NODE_H / 2
    const delta = b.layer - a.layer
    let points: Point[]
    let route: RoutedEdge['route'] = 'direct'
    let label_at: Point
    if (delta === 1 || (delta > 1 && false)) {
      const mx = x1 + (x2 - x1) / 2
      points = [{ x: x1, y: y1 }, { x: mx, y: y1 }, { x: mx, y: y2 }, { x: x2, y: y2 }]
      label_at = { x: mx, y: (y1 + y2) / 2 }
      if (Math.abs(y1 - y2) < 1) label_at = { x: mx, y: y1 }
    } else if (delta > 1) {
      route = 'over'
      const lane = -18 - over++ * 16
      points = [{ x: x1, y: y1 }, { x: x1 + 18, y: y1 }, { x: x1 + 18, y: lane }, { x: x2 - 18, y: lane }, { x: x2 - 18, y: y2 }, { x: x2, y: y2 }]
      label_at = { x: (x1 + x2) / 2, y: lane }
    } else {
      route = 'under'
      const lane = height + 18 + under++ * 16
      points = [{ x: x1, y: y1 }, { x: x1 + 18, y: y1 }, { x: x1 + 18, y: lane }, { x: x2 - 18, y: lane }, { x: x2 - 18, y: y2 }, { x: x2, y: y2 }]
      label_at = { x: (x1 + x2) / 2, y: lane }
    }
    routed.push({ ...e, points, label_at, route })
  }
  const top = over ? -18 - (over - 1) * 16 - 14 : 0
  const bottom = height + (under ? 18 + (under - 1) * 16 + 14 : 0)
  const lanes: Lane[] = useLanes ? owners.map((owner, i) => ({ owner, y: laneTop[i]!, height: laneHeight[i]! })) : []
  const side = useLanes ? 60 : 0
  return { nodes: placed, edges: routed, lanes, bounds: { x: -side, y: top, width: width + side * 2, height: bottom - top } }
}

export type View = { x: number; y: number; k: number }
export const MIN_K = 0.25
export const MAX_K = 2.5

/** The view that fits `bounds` inside a container, with some breathing room. */
export type Pad = number | { top: number; right: number; bottom: number; left: number }
export function fitView(bounds: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }, pad: Pad = 28): View {
  const p = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad
  const aw = size.width - p.left - p.right
  const ah = size.height - p.top - p.bottom
  const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(aw / bounds.width, ah / bounds.height)))
  return { k, x: p.left + (aw - bounds.width * k) / 2 - bounds.x * k, y: p.top + (ah - bounds.height * k) / 2 - bounds.y * k }
}

/** Zoom by `factor` keeping the point under (px, py) fixed. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
  const f = k / v.k
  return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f }
}
