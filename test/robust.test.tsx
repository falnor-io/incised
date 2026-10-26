import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ApprovalChain, ApprovalWorkspace, AutonomyBoard, AutonomyGate, BudgetMeter, EvidenceTable, HandoffPacket, PermissionGrant,
  PlanVsActual, RecordViewer, RunInspector,
} from '../src/index.js'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)
/** Text a person would never want to read on a page. */
const BAD = /NaN|Infinity|undefined|\[object/

describe('views survive empty, zero and bad input', () => {
  it('AutonomyGate with no cases', () => {
    const h = html(<AutonomyGate title="t" tier="T1" cases={[]} rule={{ rate: 0.9, minCases: 30 }} />)
    expect(h).not.toMatch(BAD)
    expect(h).toMatch(/Collecting cases/)
  })
  it('AutonomyGate at the top tier and with a zero-case rule', () => {
    expect(html(<AutonomyGate title="t" tier="T4" cases={[]} rule={{ rate: 0.9, minCases: 0 }} />)).not.toMatch(BAD)
  })
  it('EvidenceTable, PlanVsActual and RunInspector with nothing in them', () => {
    expect(html(<EvidenceTable title="t" rows={[]} />)).not.toMatch(BAD)
    expect(html(<PlanVsActual title="t" plan={[]} actual={[]} />)).not.toMatch(BAD)
    expect(html(<RunInspector title="t" spans={[]} />)).not.toMatch(BAD)
  })
  it('ApprovalChain with no steps and with a bad date', () => {
    expect(html(<ApprovalChain title="t" requester="a" startedAt="2026-06-10T00:00:00Z" steps={[]} decisions={[]} />)).not.toMatch(BAD)
    expect(html(<ApprovalChain title="t" requester="a" startedAt="not a date" steps={[{ id: 's', role: 'cfo', timeoutMin: 60 }]} decisions={[]} now="2026-06-10T00:00:00Z" />)).not.toMatch(BAD)
  })
  it('HandoffPacket with nothing handed over', () => {
    const h = html(<HandoffPacket title="t" handoff={{}} />)
    expect(h).not.toMatch(BAD)
    expect(h).toMatch(/Missing/)
  })
  it('PermissionGrant with no grants, bad dates and a zero limit', () => {
    expect(html(<PermissionGrant title="t" grants={[]} />)).toMatch(/not allowed to do anything/)
    const g = { id: 'g', scope: 's', grantedBy: 'x', grantedAt: 'nope', expiresAt: 'also nope', limit: { amount: 0, unit: 'USD', period: 'day' as const }, used: 0 }
    expect(html(<PermissionGrant title="t" grants={[g]} now="2026-06-10T00:00:00Z" />)).not.toMatch(BAD)
  })
  it('BudgetMeter with a zero limit, an inverted period and a bad date', () => {
    const base = { title: 't', unit: 'USD', used: 0 }
    expect(html(<BudgetMeter {...base} limit={0} periodStart="2026-06-01T00:00:00Z" periodEnd="2026-07-01T00:00:00Z" now="2026-06-10T00:00:00Z" />)).not.toMatch(BAD)
    expect(html(<BudgetMeter {...base} limit={100} periodStart="2026-07-01T00:00:00Z" periodEnd="2026-06-01T00:00:00Z" now="2026-06-10T00:00:00Z" />)).not.toMatch(BAD)
    expect(html(<BudgetMeter {...base} limit={100} periodStart="bad" periodEnd="worse" now="2026-06-10T00:00:00Z" />)).not.toMatch(BAD)
  })
  it('AutonomyBoard with no agents and an agent with nothing', () => {
    expect(html(<AutonomyBoard title="t" agents={[]} />)).toMatch(/No agents/)
    expect(html(<AutonomyBoard title="t" now="2026-06-10T00:00:00Z" agents={[{ id: 'a', name: 'A', tier: 'T0', cases: [], rule: { rate: 0.9, minCases: 30 } }]} />)).not.toMatch(BAD)
  })
  it('RecordViewer without a result says it is not verified', () => {
    const h = html(<RecordViewer title="t" result={null} />)
    expect(h).toMatch(/Not verified/)
    expect(h).not.toMatch(/Verified</)
  })
  it('ApprovalWorkspace with no items', () => {
    expect(html(<ApprovalWorkspace title="t" items={[]} reviewer="raj" />)).not.toMatch(BAD)
  })
})
