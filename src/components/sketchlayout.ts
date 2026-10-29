import type { SketchProps } from '../schemas.js'

// Rules for the hand-drawn diagram. The model names boxes on a grid and the arrows between them; everything about where
// they sit and how a line wobbles is worked out here, from the ids alone, so the same data draws the same picture.

type Node = NonNullable<SketchProps['nodes']>[number]
type Arrow = NonNullable<SketchProps['arrows']>[number]

export const NODE_H = 44
export const ROW_H = 92
export const PAD = 18

export type Box = { x: number; y: number; w: number; h: number }
export type Link = { id: string; from: string; to: string; path: string; head: string; label?: string; lx: number; ly: number }

/** A fixed hash and a small seeded generator, so a stroke wobbles the same way on the server and in the browser. */
export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Keeps what can be drawn: one box per id, arrows between boxes that exist, and nothing pointing at itself. */
export function checkSketch(nodes: Node[], arrows: Arrow[]): { nodes: Node[]; arrows: Arrow[]; problems: string[] } {
  const problems: string[] = []
  const seen = new Set<string>()
  const keptNodes: Node[] = []
  for (const n of nodes) {
    if (seen.has(n.id)) { problems.push(`"${n.id}" appears twice.`); continue }
    seen.add(n.id)
    keptNodes.push(n)
  }
  const keptArrows = arrows.filter((a) => {
    if (a.from === a.to) { problems.push(`"${a.from}" points at itself.`); return false }
    if (!seen.has(a.from) || !seen.has(a.to)) { problems.push(`An arrow from "${a.from}" to "${a.to}" has no box at one end.`); return false }
    return true
  })
  return { nodes: keptNodes, arrows: keptArrows, problems }
}

/** The box for each node. Columns share the width, rows are a fixed height, and a box is centred in its cell. */
export function layoutBoxes(nodes: Node[], width: number): { boxes: Map<string, Box>; height: number } {
  const cols = Math.max(1, ...nodes.map((n) => n.col + 1))
  const rows = Math.max(1, ...nodes.map((n) => n.row + 1))
  const cell = (width - PAD * 2) / cols
  const w = Math.max(70, Math.min(170, cell - 28))
  const boxes = new Map<string, Box>()
  for (const n of nodes) boxes.set(n.id, { x: r1(PAD + n.col * cell + (cell - w) / 2), y: r1(PAD + n.row * ROW_H + (ROW_H - NODE_H) / 2), w: r1(w), h: NODE_H })
  return { boxes, height: PAD * 2 + rows * ROW_H }
}

/** Where a line from the middle of a box toward a point leaves the box, with a small gap. */
function edge(b: Box, toward: { x: number; y: number }, gap = 6): { x: number; y: number } {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  const k = Math.min(dx === 0 ? Infinity : (b.w / 2 + gap) / Math.abs(dx), dy === 0 ? Infinity : (b.h / 2 + gap) / Math.abs(dy))
  return { x: r1(cx + dx * k), y: r1(cy + dy * k) }
}

/** A box outlined twice with a little wobble, as if drawn by hand. */
export function roughBox(b: Box, seed: string): string[] {
  const rand = rng(hash(seed))
  const j = () => (rand() - 0.5) * 3.2
  return [0, 1].map(() => {
    const c = [
      { x: b.x + j(), y: b.y + j() }, { x: b.x + b.w + j(), y: b.y + j() },
      { x: b.x + b.w + j(), y: b.y + b.h + j() }, { x: b.x + j(), y: b.y + b.h + j() },
    ]
    const side = (p: { x: number; y: number }, q: { x: number; y: number }) => `Q${r1((p.x + q.x) / 2 + j())},${r1((p.y + q.y) / 2 + j())} ${r1(q.x)},${r1(q.y)}`
    return `M${r1(c[0]!.x)},${r1(c[0]!.y)} ${side(c[0]!, c[1]!)} ${side(c[1]!, c[2]!)} ${side(c[2]!, c[3]!)} ${side(c[3]!, c[0]!)}`
  })
}

/** An arrow between two boxes: a slightly bent line and an open arrowhead. */
export function layoutLinks(arrows: Arrow[], boxes: Map<string, Box>): Link[] {
  const links: Link[] = []
  for (const a of arrows) {
    const from = boxes.get(a.from)
    const to = boxes.get(a.to)
    if (!from || !to) continue
    const c1 = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
    const c2 = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
    const p1 = edge(from, c2)
    const p2 = edge(to, c1)
    const rand = rng(hash(`${a.from}>${a.to}`))
    const mx = (p1.x + p2.x) / 2
    const my = (p1.y + p2.y) / 2
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
    const bend = (rand() - 0.5) * 8
    const nx = -(p2.y - p1.y) / len
    const ny = (p2.x - p1.x) / len
    const flip = ny > 0 ? -1 : 1
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const h = (t: number) => `M${r1(p2.x)},${r1(p2.y)} L${r1(p2.x - 9 * Math.cos(ang + t))},${r1(p2.y - 9 * Math.sin(ang + t))}`
    links.push({
      id: `${a.from}>${a.to}`, from: a.from, to: a.to,
      path: `M${p1.x},${p1.y} Q${r1(mx + nx * bend)},${r1(my + ny * bend)} ${p2.x},${p2.y}`,
      head: `${h(0.5)} ${h(-0.5)}`,
      // The label always sits above the line, whichever way the arrow points.
      label: a.label, lx: r1(mx + nx * flip * 14), ly: r1(my + ny * flip * 14),
    })
  }
  return links
}

export type Beat = { say: string; visible: Set<string>; newest: string[] }

/**
 * What is on the page at each beat. With no steps, each box appears in turn. With steps, each beat shows the boxes it names
 * on top of what was already there. An arrow appears as soon as both of its ends have. Ids that are not boxes are ignored.
 */
export function beats(nodes: Node[], steps: NonNullable<SketchProps['steps']> | undefined): Beat[] {
  const ids = new Set(nodes.map((n) => n.id))
  const plan = steps && steps.length ? steps : nodes.map((n) => ({ say: '', show: [n.id] }))
  const seen = new Set<string>()
  const out = plan.map((s) => {
    const newest = s.show.filter((id, i) => ids.has(id) && !seen.has(id) && s.show.indexOf(id) === i)
    newest.forEach((id) => seen.add(id))
    return { say: s.say, visible: new Set(seen), newest }
  })
  // A box no step names still belongs in the picture: it comes in with the last beat.
  const last = out[out.length - 1]
  if (last) for (const n of nodes) if (!seen.has(n.id)) { seen.add(n.id); last.visible.add(n.id); last.newest.push(n.id) }
  return out
}
