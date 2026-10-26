#!/usr/bin/env node
// Next.js App Router smoke test. Packs the real tarball, installs it into a fresh Next app and builds a page that is
// a server component (no "use client") importing the components and verifying a record on the server. A component
// that uses hooks or handlers without its own "use client" line fails this build.
// Needs network for the install. Leaves nothing behind.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_(config|lifecycle|command|package|execpath|node_execpath)/i.test(k)))
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] })

const work = mkdtempSync(join(tmpdir(), 'orlune-next-'))
const app = join(work, 'app-under-test')
mkdirSync(join(app, 'app'), { recursive: true })
try {
  console.log('smoke:next')
  run('npm', ['run', 'build', '--silent'], root)
  const tarball = join(work, JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work], root))[0].filename)

  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'next-smoke', private: true }))
  writeFileSync(join(app, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'esnext'], jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, noEmit: true, allowJs: true, esModuleInterop: true, resolveJsonModule: true, isolatedModules: true, plugins: [{ name: 'next' }] }, include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'], exclude: ['node_modules'] }))
  writeFileSync(join(app, 'app/layout.tsx'), `import 'orlune/styles.css'\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>\n}\n`)
  copyFileSync(join(root, 'demo/sample-record.json'), join(app, 'app/record.json'))
  writeFileSync(join(app, 'app/page.tsx'), `// A server component on purpose.
import { Funnel, JsonTree, ActivityHeatmap, RecordProvider, VerifyStatus, LedgerTimeline } from 'orlune'
import { verifyRecord, type RecordBundle } from 'orlune/verify'
import sample from './record.json'

export default async function Page() {
  const record = sample as unknown as RecordBundle
  const result = await verifyRecord(record)
  return (
    <main>
      <Funnel title="How many make it through" unit="deals" steps={[{ label: 'Signed', value: 40 }, { label: 'Set up', value: 31 }]} />
      <JsonTree label="plan" value={{ action: 'release_payment', amount: 12400 }} />
      <ActivityHeatmap title="Events" days={[{ date: '2026-06-01', count: 3, breaches: 0 }]} noun="events" />
      <RecordProvider result={result} manifest={record.manifest}>
        <VerifyStatus />
        <LedgerTimeline />
      </RecordProvider>
    </main>
  )
}
`)
  run('npm', ['install', tarball, 'next@15', 'react@19', 'react-dom@19', 'zod@4', 'typescript@5', '@types/react@19', '@types/node', '--no-audit', '--no-fund', '--silent'], app)
  const out = run('npx', ['next', 'build'], app)
  if (!/Generating static pages|prerendered as static content/.test(out)) throw new Error(out.slice(-1500))
  console.log('  ok  a Next.js server page builds with the packed package')
} catch (e) {
  console.log(`  FAIL\n${String(e.stderr || e.stdout || e.message).split('\n').slice(-25).join('\n')}`)
  process.exitCode = 1
} finally {
  rmSync(work, { recursive: true, force: true })
}
