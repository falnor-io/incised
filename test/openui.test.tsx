import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { Renderer } from '@openuidev/react-lang'
import { RecordProvider, SourcesProvider, describeSources, type OrluneSources } from '../src/index.js'
import { buildOrluneLibrary, ORLUNE_ROOT } from '../src/openui/index.js'
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
