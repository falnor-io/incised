// Sankey layout: columns from the flow, node heights from the volume, and an ordering pass to cut crossings.
import { layerNodes } from './flow.js'

export type SankeyNode = { id: string; label: string }
export type SankeyLink = { source: string; target: string; value: number }
export type PlacedSankeyNode = SankeyNode & { x: number; y: number; h: number; column: number; inflow: number; outflow: number; value: number; leak: number }
export type PlacedSankeyLink = SankeyLink & { path: string; width: number; y0: number; y1: number; x0: number; x1: number }
export type SankeyLayout = { nodes: PlacedSankeyNode[]; links: PlacedSankeyLink[]; width: number; height: number }

const MIN_SLOT = 32

type Opts = { width: number; height: number; nodeWidth?: number; gap?: number; padX?: number; iterations?: number }

/**
 * Bad links are dropped (unknown ends, self loops, zero or negative volume). A node's `leak` is what came in
 * minus what went out, for nodes that have both: cases that vanished along the way.
 */
export function layoutSankey(nodes: SankeyNode[], rawLinks: SankeyLink[], o: Opts): SankeyLayout {
  const { width, height, nodeWidth = 14, gap = 14, padX = 130, iterations = 8 } = o
  const ids = new Set(nodes.map((n) => n.id))
  const links = rawLinks.filter((l) => ids.has(l.source) && ids.has(l.target) && l.source !== l.target && Number.isFinite(l.value) && l.value > 0)
  const column = layerNodes(nodes.map((n) => n.id), links.map((l) => ({ from: l.source, to: l.target })))
  // Sinks line up at the right edge, which is how a Sankey reads.
  const maxCol = Math.max(0, ...column.values())
  const out = new Map<string, number>()
  const inn = new Map<string, number>()
  for (const l of links) {
    out.set(l.source, (out.get(l.source) ?? 0) + l.value)
    inn.set(l.target, (inn.get(l.target) ?? 0) + l.value)
  }
  for (const n of nodes) if (!out.has(n.id) && inn.has(n.id)) column.set(n.id, maxCol)

  const cols: string[][] = Array.from({ length: maxCol + 1 }, () => [])
  for (const n of nodes) cols[column.get(n.id) ?? 0]!.push(n.id)
  const vol = (id: string) => Math.max(out.get(id) ?? 0, inn.get(id) ?? 0)
  const innerH = height - 8
  // One scale for the whole diagram, set by the most crowded column, so heights are comparable everywhere.
  // Every node also gets at least MIN_SLOT of vertical room, so the labels of tiny nodes never touch.
  const slotH = (id: string, s: number) => Math.max(vol(id) * s, MIN_SLOT)
  const fits = (s: number) => cols.every((c) => c.reduce((a, id) => a + slotH(id, s), 0) + gap * Math.max(c.length - 1, 0) <= innerH)
  const k = Math.min(...cols.filter((c) => c.length).map((c) => (innerH - gap * (c.length - 1)) / (c.reduce((a, id) => a + vol(id), 0) || 1)))
  let scale = Number.isFinite(k) && k > 0 ? k : 1
  for (let i = 0; i < 60 && !fits(scale); i++) scale *= 0.94
  const colX = (c: number) => padX + (maxCol === 0 ? 0 : (c * (width - padX * 2 - nodeWidth)) / maxCol)

  const y = new Map<string, number>()
  const place = (c: number) => {
    const col = cols[c]!
    const total = col.reduce((a, id) => a + slotH(id, scale), 0) + gap * (col.length - 1)
    let cur = 4 + (innerH - total) / 2
    for (const id of col) {
      // The node sits in the middle of its slot, so a tiny node still has room for its label.
      y.set(id, cur + (slotH(id, scale) - vol(id) * scale) / 2)
      cur += slotH(id, scale) + gap
    }
  }
  cols.forEach((_, c) => place(c))

  const center = (id: string) => (y.get(id) ?? 0) + (vol(id) * scale) / 2
  for (let it = 0; it < iterations; it++) {
    for (const dir of [1, -1]) {
      const order = dir === 1 ? cols.map((_, i) => i).slice(1) : cols.map((_, i) => i).slice(0, -1).reverse()
      for (const c of order) {
        const want = new Map<string, number>()
        for (const id of cols[c]!) {
          const ls = links.filter((l) => (dir === 1 ? l.target === id : l.source === id))
          const w = ls.reduce((a, l) => a + l.value, 0)
          want.set(id, w ? ls.reduce((a, l) => a + center(dir === 1 ? l.source : l.target) * l.value, 0) / w : center(id))
        }
        cols[c]!.sort((a, b) => want.get(a)! - want.get(b)!)
        place(c)
      }
    }
  }

  const placed = nodes.map((n): PlacedSankeyNode => {
    const i = inn.get(n.id) ?? 0
    const o2 = out.get(n.id) ?? 0
    return { ...n, x: colX(column.get(n.id) ?? 0), y: y.get(n.id) ?? 0, h: Math.max(vol(n.id) * scale, 2), column: column.get(n.id) ?? 0, inflow: i, outflow: o2, value: Math.max(i, o2), leak: i > 0 && o2 > 0 ? Math.max(0, i - o2) : 0 }
  })
  const byId = new Map(placed.map((n) => [n.id, n]))
  // Stack each node's links in the order of the node at the other end, so bands do not cross needlessly.
  const outOff = new Map<string, number>()
  const inOff = new Map<string, number>()
  const sorted = [...links]
  const srcSorted = [...sorted].sort((a, b) => center(a.target) - center(b.target))
  const srcY = new Map<SankeyLink, number>()
  for (const l of srcSorted) {
    const off = outOff.get(l.source) ?? 0
    srcY.set(l, byId.get(l.source)!.y + off + (l.value * scale) / 2)
    outOff.set(l.source, off + l.value * scale)
  }
  const tgtY = new Map<SankeyLink, number>()
  for (const l of [...sorted].sort((a, b) => center(a.source) - center(b.source))) {
    const off = inOff.get(l.target) ?? 0
    tgtY.set(l, byId.get(l.target)!.y + off + (l.value * scale) / 2)
    inOff.set(l.target, off + l.value * scale)
  }
  const placedLinks = sorted.map((l): PlacedSankeyLink => {
    const a = byId.get(l.source)!
    const b = byId.get(l.target)!
    const x0 = a.x + nodeWidth
    const x1 = b.x
    const y0 = srcY.get(l)!
    const y1 = tgtY.get(l)!
    const mx = (x0 + x1) / 2
    return { ...l, x0, x1, y0, y1, width: Math.max(l.value * scale, 1), path: `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}` }
  })
  return { nodes: placed, links: placedLinks, width, height }
}
