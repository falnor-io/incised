import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AgentTrace, ApprovalFlow, ChainGraph, EvalMatrix, EvidenceDiff, FleetBoard, ReceiptCard, buildTraceTree, diffSeq, layerNodes, soonestDue,
} from '../src/index.js'
import { mcnemarExact } from '../src/verify/index.js'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('mcnemarExact', () => {
  it('matches the registry calculator', () => {
    expect(mcnemarExact(8, 1)).toBeCloseTo(0.0391, 3)
    expect(mcnemarExact(0, 0)).toBe(1)
    expect(mcnemarExact(3, 3)).toBe(1)
  })
})

describe('AgentTrace', () => {
  const spans = [
    { id: 'a', name: 'Plan', kind: 'llm' as const, startMs: 0, durationMs: 400, status: 'ok' as const },
    { id: 'b', parentId: 'a', name: 'Look up invoice', kind: 'tool' as const, startMs: 400, durationMs: 200, status: 'error' as const, detail: 'timeout' },
    { id: 'c', parentId: 'a', name: 'Pay over limit', kind: 'gate' as const, startMs: 600, durationMs: 50, status: 'blocked' as const },
  ]
  it('computes totals and failure counts from spans', () => {
    const out = html(<AgentTrace title="Run" spans={spans} />)
    expect(out).toContain('3 spans · 0.65s · 1 failed · 1 blocked by a gate')
    expect(out).toContain('timeout')
  })
  it('survives a missing parent and a cycle without dropping spans', () => {
    const odd = [
      { id: 'x', parentId: 'ghost', name: 'Orphan', kind: 'tool' as const, startMs: 0, durationMs: 1, status: 'ok' as const },
      { id: 'p', parentId: 'q', name: 'P', kind: 'tool' as const, startMs: 0, durationMs: 1, status: 'ok' as const },
      { id: 'q', parentId: 'p', name: 'Q', kind: 'tool' as const, startMs: 0, durationMs: 1, status: 'ok' as const },
    ]
    const flat = (n: ReturnType<typeof buildTraceTree>): string[] => n.flatMap((x) => [x.span.id, ...flat(x.children)])
    expect(flat(buildTraceTree(odd)).sort()).toEqual(['p', 'q', 'x'])
  })
})

describe('EvalMatrix', () => {
  const cases = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, label: `Case ${i}` }))
  const all = Object.fromEntries(cases.map((c) => [c.id, true]))
  it('flags a significant regression', () => {
    const worse = { ...all, c0: false, c1: false, c2: false, c3: false, c4: false, c5: false, c6: false, c7: false }
    const out = html(<EvalMatrix title="Re-test" cases={cases} runs={[{ label: 'v1', results: all }, { label: 'v2', results: worse }]} />)
    expect(out).toContain('Regression: 8 cases got worse and 0 got better (p = 0.008)')
  })
  it('does not call a single flip a regression', () => {
    const one = { ...all, c0: false }
    const out = html(<EvalMatrix title="Re-test" cases={cases} runs={[{ label: 'v1', results: all }, { label: 'v2', results: one }]} />)
    expect(out).toContain('Possible drift')
    expect(out).not.toContain('Regression:')
  })
})

describe('FleetBoard', () => {
  const rows = [
    { name: 'AP exceptions', status: 'ok' as const, clocks: [{ label: 'Re-test', startedAt: '2026-06-03T00:00:00Z', deadlineHours: 48 }] },
    { name: 'Claims intake', status: 'breached' as const, clocks: [{ label: 'Root cause', startedAt: '2026-06-01T00:00:00Z', deadlineHours: 24 }] },
  ]
  it('computes the soonest deadline and marks overdue ones', () => {
    expect(soonestDue(rows[0]!, '2026-06-04T00:00:00Z')).toBe(24)
    expect(soonestDue(rows[1]!, '2026-06-04T00:00:00Z')).toBe(-48)
    const out = html(<FleetBoard title="Fleet" rows={rows} now="2026-06-04T00:00:00Z" />)
    expect(out).toContain('Overdue 48.0h')
    expect(out.indexOf('Claims intake')).toBeLessThan(out.indexOf('AP exceptions'))
  })
  it('shows no time when there is no clock reading', () => {
    expect(soonestDue(rows[0]!)).toBeNull()
  })
})

describe('EvidenceDiff', () => {
  it('diffs lines and marks changed words', () => {
    expect(diffSeq(['a', 'b', 'c'], ['a', 'x', 'c']).map((o) => o.type)).toEqual(['same', 'del', 'add', 'same'])
    const out = html(<EvidenceDiff title="Policy" before={'Approve under $500\nEscalate otherwise'} after={'Approve under $200\nEscalate otherwise'} />)
    expect(out).toContain('1 lines added, 1 removed')
    expect(out).toContain('<mark class="ic-word" data-kind="del">$500</mark>')
    expect(out).toContain('<mark class="ic-word" data-kind="add">$200</mark>')
  })
  it('says so when nothing changed', () => {
    expect(html(<EvidenceDiff title="t" before="same" after="same" />)).toContain('No differences')
  })
})

describe('ApprovalFlow', () => {
  const nodes = [
    { id: 'a', label: 'Invoice in', kind: 'step' as const },
    { id: 'b', label: 'Over limit?', kind: 'gate' as const },
    { id: 'c', label: 'Pay', kind: 'end' as const },
    { id: 'd', label: 'Controller', kind: 'step' as const },
  ]
  const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'no' }, { from: 'b', to: 'd', label: 'yes' }, { from: 'd', to: 'c' }]
  it('layers by longest path', () => {
    const l = layerNodes(nodes.map((n) => n.id), edges)
    expect([l.get('a'), l.get('b'), l.get('d'), l.get('c')]).toEqual([0, 1, 2, 3])
  })
  it('does not loop on a cycle', () => {
    const l = layerNodes(['x', 'y'], [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }])
    expect(l.size).toBe(2)
  })
  it('renders states and an accessible list', () => {
    const out = html(<ApprovalFlow title="Payment approval" nodes={nodes} edges={edges} completed={['a']} active="b" />)
    expect(out).toContain('data-state="active"')
    expect(out).toContain('data-state="done"')
    expect(out).toContain('Over limit? (gate, active) leads to Pay, Controller')
  })
})

describe('ChainGraph and ReceiptCard', () => {
  const events = [
    { seq: 1, type: 'launch', at: '2026-06-01T00:00:00Z', by: 'a', hash: 'aaaaaaaaaaaa', signatureValid: true, chainValid: true },
    { seq: 2, type: 'retest', at: '2026-06-02T00:00:00Z', by: 'a', hash: 'bbbbbbbbbbbb', signatureValid: false, chainValid: false },
  ]
  it('shows a broken link and a bad signature', () => {
    const out = html(<ChainGraph events={events} />)
    expect(out).toContain('chain link broken')
    expect(out).toContain('signature invalid')
    expect(out).toContain('← genesis')
  })
  it('flags a signature problem on a receipt', () => {
    const out = html(<ReceiptCard title="Payment hold" issuedAt="2026-06-05T08:00:00Z" rows={[{ label: 'Amount', value: '$12,400' }]} hash="abc" signers={[{ party: 'agent', valid: true }, { party: 'controller', valid: false }]} />)
    expect(out).toContain('signature problem')
  })
})
