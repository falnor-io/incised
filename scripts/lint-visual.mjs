#!/usr/bin/env node
// Visual lint: builds the demo and runs the taste-skill inspector against it in a real browser, at desktop and
// phone width. It measures what source lint cannot see: contrast as rendered, text on a screen edge, clipped
// content, blank bands, ragged rows. Fails on any FAIL finding; warnings are printed.
// Needs the skill (npx skills add leonxlnx/taste-skill) and Chrome, Edge or Chromium. Skips with a note without them.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const inspect = join(root, '.agents/skills/design-taste-frontend/scripts/inspect.mjs')
if (!existsSync(inspect)) {
  console.log('lint:visual skipped: the taste skill is not installed here (npx skills add leonxlnx/taste-skill).')
  process.exit(0)
}
const build = spawnSync('npm', ['run', 'demo:build'], { cwd: root, encoding: 'utf8' })
if (build.status !== 0) { console.error(build.stdout + build.stderr); process.exit(1) }

const run = spawnSync('node', [inspect, '--app', join(root, 'demo/dist/index.html'), '--out', join(root, '.taste-skill/inspect'), '--widths', '1440,390', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
const raw = run.stdout
let report
try { report = JSON.parse(raw.slice(raw.indexOf('{'))) } catch { console.error('lint:visual could not read the inspector output.\n' + (run.stderr || raw).slice(0, 600)); process.exit(1) }

// A gallery of independent specimens is not a dashboard: these two describe screen composition, not components.
const SKIP = new Set(['below-fold', 'ragged-row'])
const fails = report.findings.filter((f) => f.level === 'FAIL')
const warns = report.findings.filter((f) => f.level === 'WARN' && !SKIP.has(f.id))
for (const f of [...fails, ...warns]) console.log(`${f.level} ${f.id} (${f.width ?? f.at ?? ''}) ${String(f.message).slice(0, 160)}`)
console.log(`lint:visual: ${fails.length} fail, ${warns.length} warn`)
process.exit(fails.length ? 1 : 0)
