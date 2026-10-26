#!/usr/bin/env node
// Packaging smoke test. Builds, packs the real tarball, installs it into an empty project and uses it the way a
// consumer would: every entry point at runtime, the stylesheet, and the types under strict TypeScript.
// Needs network for the install. Fails loudly. Leaves nothing behind.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
// This script also runs as `prepublishOnly`, where npm sets dry-run and other options for the publish in progress.
// Nested npm commands must not inherit them: the pack here has to write a real tarball.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_(config|lifecycle|command|package|execpath|node_execpath)/i.test(k)))
const run = (cmd, args, cwd, quiet = true) => execFileSync(cmd, args, { cwd, encoding: 'utf8', env, stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' })

const work = mkdtempSync(join(tmpdir(), 'orlune-pack-'))
const consumer = join(work, 'consumer')
mkdirSync(consumer)
let failed = false
const step = (name, fn) => {
  try { const out = fn(); console.log(`  ok  ${name}${out ? ` (${out})` : ''}`) } catch (e) { failed = true; console.log(`  FAIL ${name}\n${String(e.stderr || e.stdout || e.message).split('\n').slice(0, 12).join('\n')}`) }
}

try {
  console.log(`smoke:pack ${pkg.name}@${pkg.version}`)
  run('npm', ['run', 'build', '--silent'], root)
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work], root))[0]
  const tarball = join(work, packed.filename)
  console.log(`  packed ${packed.filename}: ${packed.entryCount} files, ${(packed.size / 1024).toFixed(0)} kB`)

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }))
  run('npm', ['install', tarball, 'react@19', 'react-dom@19', 'zod@4', '@openuidev/react-lang@1.0.1', 'typescript@5', '@types/react@19', '@types/react-dom@19', '--no-audit', '--no-fund', '--silent'], consumer)
  copyFileSync(join(root, 'demo/sample-record.json'), join(consumer, 'record.json'))

  writeFileSync(join(consumer, 'smoke.mjs'), `
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as root from '${pkg.name}'
import { verifyRecord, clopperPearson } from '${pkg.name}/verify'
import { buildOrluneLibrary } from '${pkg.name}/openui'
import { orluneLibrary } from '${pkg.name}/openui/library'
import { spansFromOtlp, stepsFromAiSdk, itemsFromInterrupt, responseFromDecisions } from '${pkg.name}/adapters'

const names = ['Swimlane','Trail','Funnel','VerifyStatus','LedgerTimeline','TraceExplorer','DiffViewer','FlowCanvas','DataGrid','ControlChart','Sankey','ApprovalQueue','DeadlineGantt','ActivityHeatmap','EvalMatrix','FleetBoard','JsonTree','RecordProvider','RecordViewer','AutonomyBoard']
for (const n of names) assert.equal(typeof root[n], 'function', n + ' is not exported')
assert.ok(Object.keys(root).length > 60, 'too few exports: ' + Object.keys(root).length)

const html = renderToStaticMarkup(createElement(root.Funnel, { title: 't', unit: 'u', steps: [{ label: 'a', value: 40 }, { label: 'b', value: 30 }] }))
assert.match(html, /75% kept/)
assert.match(html, /class="ol[" ]/)

const record = JSON.parse(readFileSync(new URL('./record.json', import.meta.url), 'utf8'))
const now = new Date('2026-06-10T00:00:00Z')
assert.equal((await verifyRecord(record, { now })).ok, true)
record.ledger[3].result = 'fail'
assert.equal((await verifyRecord(record, { now })).ok, false)
assert.ok(clopperPearson(45, 50).lower > 0.78)

assert.match(buildOrluneLibrary().prompt(), /Funnel/)
assert.match(orluneLibrary.prompt(), /AutonomyGate/)
assert.deepEqual(spansFromOtlp({}), [])
const hitl = { actionRequests: [{ name: 'pay', args: { n: 1 } }], reviewConfigs: [{ allowedDecisions: ['approve', 'reject'] }] }
assert.equal(responseFromDecisions(hitl, 'i', itemsFromInterrupt(hitl, { id: 'i' }), { 'i:0': { kind: 'approve' } }).ok, true)
assert.equal(stepsFromAiSdk([{ parts: [{ type: 'tool-x', toolCallId: '1', state: 'output-available' }] }])[0].status, 'ok')

const css = fileURLToPath(import.meta.resolve('${pkg.name}/styles.css'))
assert.ok(existsSync(css) && readFileSync(css, 'utf8').includes('--ol-bg'))
const meta = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('${pkg.name}/package.json')), 'utf8'))
assert.equal(meta.version, '${pkg.version}')
console.log(Object.keys(root).length + ' exports')
`)
  step('runtime: every entry point, rendering, verifier, stylesheet', () => run('node', ['smoke.mjs'], consumer).trim())

  writeFileSync(join(consumer, 'types.tsx'), `
import { Funnel, Priority, VerifyStatus, DataGrid, type Column } from '${pkg.name}'
import { verifyRecord, type RecordBundle, type VerifyResult } from '${pkg.name}/verify'
import { buildOrluneLibrary } from '${pkg.name}/openui'

export const ok = <Funnel title="t" unit="u" steps={[{ label: 'a', value: 2 }, { label: 'b', value: 1 }]} />
// @ts-expect-error impact must be 'high' or 'low'
export const bad = <Priority title="t" items={[{ label: 'a', impact: 'huge', effort: 'low' }, { label: 'b', impact: 'low', effort: 'low' }]} />
type Row = { id: string; n: number }
const cols: Column<Row>[] = [{ id: 'n', header: 'N', value: (r) => r.n, type: 'number' }]
export const grid = <DataGrid title="g" rows={[{ id: 'a', n: 1 }]} columns={cols} rowId={(r) => r.id} />
export const status = <VerifyStatus result={null} />
export async function check(r: RecordBundle): Promise<VerifyResult> { return verifyRecord(r) }
export const lib = buildOrluneLibrary()
`)
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', jsx: 'react-jsx', skipLibCheck: false, types: [] }, files: ['types.tsx'] }))
  step('types: strict TypeScript, wrong props are rejected', () => { run('npx', ['tsc', '-p', '.'], consumer); return 'tsc clean' })
} finally {
  rmSync(work, { recursive: true, force: true })
}
if (failed) { console.log('smoke:pack failed'); process.exit(1) }
console.log('smoke:pack passed')
