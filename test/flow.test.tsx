import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FlowCanvas, fitView, layoutFlow, roundedPath, zoomAt, type FlowEdge, type FlowNode } from '../src/index.js'

const nodes: FlowNode[] = [
  { id: 'a', label: 'In', kind: 'start', owner: 'Agent' },
  { id: 'b', label: 'Match', kind: 'step', owner: 'Agent' },
  { id: 'c', label: 'Limit?', kind: 'gate', owner: 'Agent' },
  { id: 'd', label: 'Review', kind: 'step', owner: 'Controller' },
  { id: 'e', label: 'Pay', kind: 'end', owner: 'Bank' },
  { id: 'f', label: 'Hold', kind: 'end', owner: 'Bank' },
]
const edges: FlowEdge[] = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd', label: 'yes' }, { from: 'c', to: 'e', label: 'no' }, { from: 'd', to: 'e' }, { from: 'd', to: 'f' }]

describe('layoutFlow', () => {
  const l = layoutFlow(nodes, edges)
  it('never overlaps two nodes', () => {
    for (const a of l.nodes) for (const b of l.nodes) {
      if (a.id >= b.id) continue
      const apart = a.x + 172 <= b.x || b.x + 172 <= a.x || a.y + 66 <= b.y || b.y + 66 <= a.y
      expect(apart, `${a.id} overlaps ${b.id}`).toBe(true)
    }
  })
  it('makes one lane per owner and keeps each node inside its lane', () => {
    expect(l.lanes.map((x) => x.owner)).toEqual(['Agent', 'Controller', 'Bank'])
    for (const n of l.nodes) {
      const lane = l.lanes[n.lane]!
      expect(n.y).toBeGreaterThanOrEqual(lane.y)
      expect(n.y + 66).toBeLessThanOrEqual(lane.y + lane.height)
    }
  })
  it('routes an edge that skips a column around the nodes, not through them', () => {
    const skip = l.edges.find((e) => e.from === 'c' && e.to === 'e')!
    expect(skip.route).toBe('over')
    expect(Math.min(...skip.points.map((p) => p.y))).toBeLessThan(0)
    expect(l.bounds.y).toBeLessThan(0)
  })
  it('gives every route finite points that start and end at the right nodes', () => {
    for (const e of l.edges) {
      expect(e.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
      const a = l.nodes.find((n) => n.id === e.from)!
      expect(e.points[0]).toEqual({ x: a.x + 172, y: a.y + 33 })
    }
  })
  it('survives a cycle and a missing node', () => {
    const cyc = layoutFlow(nodes.slice(0, 2), [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'ghost' }])
    expect(cyc.nodes).toHaveLength(2)
    expect(cyc.edges.every((e) => e.from !== 'a' || e.to !== 'ghost')).toBe(true)
  })
})

describe('view maths', () => {
  it('fits the bounds inside the container', () => {
    const v = fitView({ x: 0, y: 0, width: 1000, height: 400 }, { width: 500, height: 300 }, 20)
    expect(v.k).toBeCloseTo(0.46)
    expect(1000 * v.k + 2 * v.x).toBeCloseTo(500)
  })
  it('zooms around a fixed point', () => {
    const v = { x: 40, y: 10, k: 1 }
    const z = zoomAt(v, 2, 100, 100)
    expect((100 - z.x) / z.k).toBeCloseTo((100 - v.x) / v.k)
    expect((100 - z.y) / z.k).toBeCloseTo((100 - v.y) / v.k)
  })
  it('builds a rounded path', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], 10)).toBe('M0 0 L40 0 Q50 0 50 10 L50 50')
  })
})

describe('FlowCanvas render', () => {
  it('renders nodes, lanes and the inspector for a selection', () => {
    const out = renderToStaticMarkup(<FlowCanvas title="Payment" nodes={nodes} edges={edges} defaultSelected="c" />)
    expect(out).toContain('Controller')
    expect(out).toContain('Comes from')
    expect(out).toContain('data-selected="true"')
    expect(out).toContain('6 steps · 6 connections · 3 owners')
  })
})
