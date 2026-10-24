#!/usr/bin/env node
// orlune lint: keeps generated-looking work out. Exit code 1 on any finding.
//   node scripts/lint.mjs [--json] [--rule id]
import { lintPackage, lintProject, lintRegistry } from './lint/project.mjs'

const args = process.argv.slice(2)
const json = args.includes('--json')
const only = args.includes('--rule') ? args[args.indexOf('--rule') + 1] : null
const root = new URL('..', import.meta.url).pathname
const findings = [...lintProject(root), ...lintPackage(root), ...(await lintRegistry(root))].filter((f) => !only || f.rule === only)

if (json) {
  console.log(JSON.stringify(findings, null, 1))
  process.exit(findings.length ? 1 : 0)
}
if (!findings.length) { console.log('lint: clean'); process.exit(0) }
const by = new Map()
for (const f of findings) (by.get(f.rule) ?? by.set(f.rule, []).get(f.rule)).push(f)
for (const [rule, list] of by) {
  console.log(`\n${rule}  (${list.length})  ${list[0].message}`)
  for (const f of list.slice(0, 8)) console.log(`  ${f.file}${f.line ? ':' + f.line : ''}  ${f.match}`)
  if (list.length > 8) console.log(`  ... ${list.length - 8} more`)
}
console.log(`\nlint: ${findings.length} finding${findings.length === 1 ? '' : 's'} in ${by.size} rule${by.size === 1 ? '' : 's'}`)
process.exit(1)
