import { describe, expect, it } from 'vitest'
import { pChart, type SpcPoint } from '../src/components/spc.js'
import { layoutSankey } from '../src/components/sankeyLayout.js'

const flat = (fails: number[], n = 100): SpcPoint[] => fails.map((f, i) => ({ label: `d${i}`, failures: f, n }))

describe('pChart', () => {
  it('computes the pooled centre line and the 3-sigma limits', () => {
    const r = pChart(flat([10, 10, 10, 10]))
    expect(r.center).toBeCloseTo(0.1)
    expect(r.points[0]!.sigma).toBeCloseTo(0.03)
    expect(r.points[0]!.ucl).toBeCloseTo(0.19)
    expect(r.points[0]!.lcl).toBeCloseTo(0.01)
    expect(r.signals).toEqual([])
  })
  it('lower limit never goes below zero, upper never above one', () => {
    const r = pChart(flat([1, 1, 1, 1], 50))
    expect(r.points[0]!.lcl).toBe(0)
    expect(pChart(flat([99, 99], 100)).points[0]!.ucl).toBeLessThanOrEqual(1)
  })
  it('rule 1: a point beyond 3 sigma', () => {
    const r = pChart(flat([10, 9, 11, 10, 10, 20]), 5)
    expect(r.signals).toContainEqual({ index: 5, rule: 1 })
  })
  it('rule 4: eight in a row on one side', () => {
    const r = pChart(flat([10, 10, 10, 10, 12, 12, 12, 12, 12, 12, 12, 12]), 4)
    expect(r.signals.filter((s) => s.rule === 4).map((s) => s.index)).toEqual([11])
  })
  it('rule 2: two of three beyond 2 sigma on the same side', () => {
    // sigma is 0.03, so 2 sigma is 16%. Points at 17% twice in three.
    const r = pChart(flat([10, 10, 10, 10, 17, 10, 17]), 4)
    expect(r.signals).toContainEqual({ index: 6, rule: 2 })
  })
  it('does not call noise a signal', () => {
    const r = pChart(flat([9, 11, 10, 8, 12, 10, 9, 11, 10, 10, 11, 9]))
    expect(r.signals).toEqual([])
  })
  it('scales limits by each point sample size', () => {
    const r = pChart([{ label: 'a', failures: 10, n: 100 }, { label: 'b', failures: 100, n: 1000 }])
    expect(r.points[1]!.sigma).toBeLessThan(r.points[0]!.sigma)
  })
  it('handles an empty or zero sample without NaN', () => {
    expect(pChart([]).points).toEqual([])
    const r = pChart([{ label: 'a', failures: 0, n: 0 }])
    expect(Number.isFinite(r.points[0]!.z)).toBe(true)
  })
})

describe('layoutSankey', () => {
  const nodes = ['in', 'auto', 'esc', 'paid', 'held', 'ok', 'no'].map((id) => ({ id, label: id }))
  const links = [
    { source: 'in', target: 'auto', value: 700 }, { source: 'in', target: 'esc', value: 300 },
    { source: 'auto', target: 'paid', value: 690 }, { source: 'auto', target: 'held', value: 5 },
    { source: 'esc', target: 'ok', value: 250 }, { source: 'esc', target: 'no', value: 50 },
  ]
  const l = layoutSankey(nodes, links, { width: 800, height: 360 })
  it('puts sources left and sinks at the right edge', () => {
    const col = (id: string) => l.nodes.find((n) => n.id === id)!.column
    expect(col('in')).toBe(0)
    expect(col('auto')).toBe(1)
    expect(col('paid')).toBe(col('no'))
  })
  it('keeps nodes inside the frame and never overlapping within a column', () => {
    for (const n of l.nodes) { expect(n.y).toBeGreaterThanOrEqual(0); expect(n.y + n.h).toBeLessThanOrEqual(360) }
    for (const a of l.nodes) for (const b of l.nodes) if (a.id < b.id && a.column === b.column) expect(a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id}/${b.id}`).toBe(true)
  })
  it('sizes nodes in proportion to volume on one scale', () => {
    const h = (id: string) => l.nodes.find((n) => n.id === id)!.h
    expect(h('auto') / h('esc')).toBeCloseTo(700 / 300, 1)
  })
  it('reports cases that vanished at a node', () => {
    expect(l.nodes.find((n) => n.id === 'auto')!.leak).toBe(5)
    expect(l.nodes.find((n) => n.id === 'esc')!.leak).toBe(0)
    expect(l.nodes.find((n) => n.id === 'in')!.leak).toBe(0)
  })
  it('drops bad links', () => {
    const r = layoutSankey(nodes, [...links, { source: 'in', target: 'ghost', value: 5 }, { source: 'in', target: 'in', value: 5 }, { source: 'in', target: 'paid', value: -1 }, { source: 'in', target: 'paid', value: NaN }], { width: 800, height: 360 })
    expect(r.links).toHaveLength(6)
  })
  it('does not break with no links', () => {
    const r = layoutSankey(nodes.slice(0, 2), [], { width: 400, height: 200 })
    expect(r.nodes).toHaveLength(2)
  })
})

describe('sankey label room', () => {
  it('keeps the labels of tiny neighbours apart', () => {
    const nodes = ['in', 'a', 'b', 'c', 'd'].map((id) => ({ id, label: id }))
    const links = [{ source: 'in', target: 'a', value: 1000 }, { source: 'in', target: 'b', value: 6 }, { source: 'in', target: 'c', value: 5 }, { source: 'in', target: 'd', value: 4 }]
    const l = layoutSankey(nodes, links, { width: 800, height: 300 })
    const sinks = l.nodes.filter((n) => n.column === 1).sort((p, q) => p.y - q.y)
    for (let i = 1; i < sinks.length; i++) {
      const centers = (n: (typeof sinks)[number]) => n.y + n.h / 2
      expect(centers(sinks[i]!) - centers(sinks[i - 1]!)).toBeGreaterThanOrEqual(30)
    }
  })
})
