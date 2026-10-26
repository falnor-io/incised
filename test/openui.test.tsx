import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { Renderer } from '@openuidev/react-lang'
import { RecordProvider, SourcesProvider, describeSources, type OrluneSources } from '../src/index.js'
import { buildOrluneLibrary, orluneComponents, ORLUNE_COMPONENT_NAMES, ORLUNE_ROOT } from '../src/openui/index.js'
import { orluneLibrary } from '../src/openui/library.js'
import { verifyRecord } from '../src/verify/index.js'
import type { RecordBundle } from '../src/verify/index.js'

const library = buildOrluneLibrary()
const record = (): RecordBundle => JSON.parse(readFileSync(new URL('../demo/sample-record.json', import.meta.url), 'utf8'))
const render = (response: string, ui?: React.ReactNode) =>
  renderToStaticMarkup(<Renderer response={response} library={library} isStreaming={false}>{ui}</Renderer>)

describe('OpenUI library', () => {
  it('builds a prompt that lists the components', () => {
    const prompt = library.prompt()
    for (const name of ['Swimlane', 'Funnel', 'ConfidenceBar', 'VerifyStatus', 'GuaranteeCard']) expect(prompt).toContain(name)
    expect(ORLUNE_ROOT).toBe('Reply')
  })

  it('renders model-written workflow components', () => {
    const out = render('root = Reply([Funnel("How many", "deals", [FunnelStep("Signed", 40), FunnelStep("Set up", 30)])])')
    expect(out).toContain('75% kept')
  })

  it('drops a component whose data fails its schema', () => {
    const out = render('root = Reply([Funnel("How many", "deals", [FunnelStep("Only one", 40)])])')
    expect(out).not.toContain('kept')
  })

  it('VerifyStatus takes no result from the model', async () => {
    const out = render('root = Reply([VerifyStatus()])')
    expect(out).toContain('Not verified')
    const r = await verifyRecord(record(), { now: new Date('2026-06-10T00:00:00Z') })
    const withResult = renderToStaticMarkup(
      <RecordProvider result={r} manifest={record().manifest}>
        <Renderer response='root = Reply([VerifyStatus(), GuaranteeCard("G2-RETEST-48H")])' library={library} isStreaming={false} />
      </RecordProvider>,
    )
    expect(withResult).toContain('>Verified<')
    expect(withResult).toContain('Re-test against the agreed case set')
  })

  describe('sources', () => {
    const sources: OrluneSources = {
      sankeys: { intake: { nodes: [{ id: 'a', label: 'Received' }, { id: 'b', label: 'Done' }], links: [{ source: 'a', target: 'b', value: 12 }] } },
      activity: { week: [{ date: '2026-06-01', count: 3 }] },
    }
    const withSources = (response: string) =>
      renderToStaticMarkup(
        <SourcesProvider sources={sources}>
          <Renderer response={response} library={library} isStreaming={false} />
        </SourcesProvider>,
      )

    it('lists the complex views in the prompt', () => {
      const prompt = library.prompt()
      for (const name of ['TraceExplorer', 'Sankey', 'ControlChart', 'DiffViewer', 'FleetBoard']) expect(prompt).toContain(name)
    })

    it('shows a source the host holds, by id', () => {
      const out = withSources('root = Reply([Sankey("intake", "Where cases went")])')
      expect(out).toContain('Where cases went')
      expect(out).toContain('Received')
    })

    it('says so when the id is not one the host holds, and does not invent data', () => {
      const out = withSources('root = Reply([Sankey("made-up", "Where cases went")])')
      expect(out).toContain('No data under &quot;made-up&quot;')
      expect(out).not.toContain('Received')
    })

    it('has no way for the model to pass the data itself', () => {
      const out = withSources('root = Reply([Sankey("intake", "t", [1, 2, 3])])')
      expect(out).not.toContain('1,2,3')
    })

    it('does not reach inherited keys', () => {
      expect(withSources('root = Reply([Sankey("constructor", "t")])')).toContain('No data under')
    })

    it('tells the model which ids exist', () => {
      expect(describeSources(sources)).toEqual([
        'Sankey source ids: "intake". Use only these.',
        'ActivityHeatmap source ids: "week". Use only these.',
      ])
    })
  })

  describe('streaming', () => {
    const full = 'root = Reply([Funnel("How many", "deals", [FunnelStep("Signed", 40), FunnelStep("Set up", 30)]), ConfidenceBar("Re-test", 18, 20)])'
    const partial = (text: string) =>
      renderToStaticMarkup(<Renderer response={text} library={library} isStreaming={true} />)

    it('never throws on any prefix of a reply', () => {
      for (let i = 0; i <= full.length; i += 3) expect(() => partial(full.slice(0, i))).not.toThrow()
    })

    it('shows the finished parts once the reply completes', () => {
      const out = render(full)
      expect(out).toContain('75% kept')
      expect(out).toContain('Re-test')
    })
  })
})

describe('OpenUI bindings for judgements and workspaces', () => {
  const cases = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, outcome: i < 198 ? ('agree' as const) : ('override' as const) }))
  const sources: OrluneSources = {
    autonomy: { inv: { tier: 'T2', cases, rule: { rate: 0.9, minCases: 30 } } },
    grants: { inv: { now: '2026-06-10T12:00:00Z', grants: [{ id: 'g', scope: 'email:send', grantedBy: 'ops', grantedAt: '2026-06-01T00:00:00Z', limit: { amount: 5, unit: 'emails', period: 'day' }, used: 9 }] } },
    budgets: { june: { limit: 100, used: 120, unit: 'USD', periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-07-01T00:00:00Z', now: '2026-06-10T00:00:00Z' } },
    agents: { prod: { now: '2026-06-10T12:00:00Z', agents: [{ id: 'a', name: 'Invoice agent', tier: 'T2', cases, rule: { rate: 0.9, minCases: 30 } }] } },
    evidence: { inv: [{ id: 'e', field: 'Amount', value: '$5', sources: [] }] },
    plans: { run: { plan: [{ id: 'a', action: 'Look up the PO' }], actual: [] } },
    handoffs: { h: { handoff: {} } },
  }
  const withSources = (response: string, streaming = false) =>
    renderToStaticMarkup(<SourcesProvider sources={sources}><Renderer response={response} library={library} isStreaming={streaming} /></SourcesProvider>)

  it('shows your data for a source id and works the figures out itself', () => {
    expect(withSources('root = Reply([AutonomyGate("inv", "Invoice agent")])')).toContain('Eligible for T3')
    expect(withSources('root = Reply([PermissionGrant("inv", "Permissions")])')).toContain('Over the limit')
    expect(withSources('root = Reply([BudgetMeter("june", "Spend")])')).toContain('Over the limit by 20 USD')
    expect(withSources('root = Reply([AutonomyBoard("prod", "Agents")])')).toContain('Invoice agent')
    expect(withSources('root = Reply([EvidenceTable("inv", "Values")])')).toMatch(/no source|unsourced|0 of 1/i)
    expect(withSources('root = Reply([PlanVsActual("run", "Plan")])')).toContain('Look up the PO')
    expect(withSources('root = Reply([HandoffPacket("h", "Handoff")])')).toContain('Missing')
  })
  it('says there is no data for an id it was not given, and never invents some', () => {
    expect(withSources('root = Reply([AutonomyGate("made-up", "x")])')).toContain('No data under &quot;made-up&quot;')
    expect(withSources('root = Reply([BudgetMeter("nope", "x")])')).not.toContain('Over the limit')
  })
  it('cannot be handed the verdict: extra arguments change nothing', () => {
    const out = withSources('root = Reply([AutonomyGate("inv", "Invoice agent", "Eligible for T4")])')
    expect(out).toContain('Eligible for T3')
    expect(out).not.toContain('Eligible for T4')
  })
  it('RecordViewer reads the record from RecordProvider and says not verified without one', async () => {
    expect(render('root = Reply([RecordViewer("Record")])')).toContain('Not verified')
    const r = await verifyRecord(record(), { now: new Date('2026-06-10T00:00:00Z') })
    const out = renderToStaticMarkup(<RecordProvider result={r} manifest={record().manifest}><Renderer response='root = Reply([RecordViewer("Record")])' library={library} isStreaming={false} /></RecordProvider>)
    expect(out).toContain('Verified')
  })
  it('survives a reply that stops half way', () => {
    const full = 'root = Reply([AutonomyGate("inv", "Invoice agent"), BudgetMeter("june", "Spend")])'
    for (let n = 1; n < full.length; n += 7) expect(() => withSources(full.slice(0, n), true)).not.toThrow()
  })
  it('lists the new ids for the prompt and the new components in it', () => {
    expect(describeSources(sources).join('\n')).toContain('AutonomyGate source ids: "inv"')
    for (const name of ['AutonomyGate', 'PermissionGrant', 'BudgetMeter', 'AutonomyBoard', 'RunInspector', 'EvidenceTable', 'PlanVsActual', 'ApprovalChain', 'HandoffPacket', 'RecordViewer']) expect(library.prompt()).toContain(name)
  })
})

describe('library exports', () => {
  it('exports a ready library the OpenUI CLI can find', () => {
    expect(orluneLibrary.prompt()).toContain('AutonomyGate')
    expect(typeof orluneLibrary.toSpec).toBe('function')
  })
  it('lists every component name it defines', () => {
    const defined = orluneComponents().map((c) => c.name).sort()
    const listed = [...ORLUNE_COMPONENT_NAMES].sort()
    expect(defined).toEqual(listed)
  })
})

describe('importing the binding in a Worker', () => {
  it('makes no random values when the module loads, which Cloudflare Workers forbid', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    const a = vi.spyOn(globalThis.crypto, 'getRandomValues')
    const b = vi.spyOn(globalThis.crypto, 'randomUUID')
    const c = vi.spyOn(Math, 'random')
    await import('../src/openui/index.js')
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
    expect(c).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
