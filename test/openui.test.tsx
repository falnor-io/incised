import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { Renderer } from '@openuidev/react-lang'
import { RecordProvider } from '../src/index.js'
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
})
