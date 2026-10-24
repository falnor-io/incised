// Builds a shadcn-compatible registry: registry.json plus one r/<name>.json per item, with file contents
// inlined. Install any item with:  npx shadcn@latest add <BASE>/<name>.json
// Files keep their src/ layout under components/incised/, so relative imports work after install.
// Relative ".js" extensions are stripped for the copy-paste path (bundlers resolve them without).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const BASE = (process.env.REGISTRY_BASE ?? 'https://raw.githubusercontent.com/falnor-io/incised/main/r').replace(/\/$/, '')
const root = new URL('../', import.meta.url)
const ref = (name) => `${BASE}/${name}.json`
const SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json'

const f = (path, type = 'registry:component') => ({ path, type })
const comp = (name, title, description, extra = {}) => ({
  name, title, description, type: 'registry:component', categories: extra.categories ?? [],
  registryDependencies: ['core', ...(extra.needs ?? [])],
  files: [f(`src/components/${extra.file ?? title.replace(/ /g, '')}.tsx`), ...(extra.more ?? [])],
})

const items = [
  {
    name: 'core', title: 'Incised core', type: 'registry:lib', categories: ['core'],
    description: 'Shared schemas, helpers, record types, exact-interval stats and the stylesheet. Every component needs this.',
    dependencies: ['zod'],
    files: [f('src/schemas.ts', 'registry:lib'), f('src/components/util.ts', 'registry:lib'), f('src/verify/types.ts', 'registry:lib'), f('src/verify/stats.ts', 'registry:lib'), f('src/styles.css', 'registry:file')],
    docs: "Import the stylesheet once: import '@/components/incised/styles.css'. It reads your shadcn theme variables when present.",
  },
  { ...comp('record-context', 'Record context', 'RecordProvider and hooks that hand a verifier result to the record components.', { file: 'RecordContext', categories: ['record'] }) },
  { name: 'verify', title: 'Offline verifier', type: 'registry:lib', categories: ['record'], description: 'verifyRecord: checks the manifest hash, signatures, hash-chained ledger and deadline rules with Web Crypto. No network.', registryDependencies: ['core'], files: [f('src/verify/canonical.ts', 'registry:lib'), f('src/verify/verify.ts', 'registry:lib'), f('src/verify/index.ts', 'registry:lib')] },

  comp('swimlane', 'Swimlane', 'Who does what, and where work waits.', { categories: ['workflow'] }),
  comp('trail', 'Trail', 'One request traced stop by stop, with total wait computed.', { categories: ['workflow'] }),
  comp('bottlenecks', 'Bottlenecks', 'Where work waits most, as ranked bars.', { categories: ['workflow'] }),
  comp('priority', 'Priority', 'Impact against effort grid: quick wins, big bets, fill-ins, park.', { categories: ['workflow'] }),
  comp('funnel', 'Funnel', 'How many make it through each step, with share kept computed.', { categories: ['workflow'] }),
  comp('compare', 'Compare', 'Today against a mapped version, row by row.', { categories: ['workflow'] }),

  comp('verify-status', 'Verify status', 'The verification verdict. Shows Not verified without a verifier result.', { file: 'VerifyStatus', needs: ['record-context'], categories: ['record'] }),
  comp('ledger-timeline', 'Ledger timeline', 'The signed event ledger, with broken links and bad signatures flagged.', { file: 'LedgerTimeline', needs: ['record-context'], categories: ['record'] }),
  comp('chain-graph', 'Chain graph', 'The ledger as linked hash blocks, showing exactly where a chain breaks.', { file: 'ChainGraph', needs: ['record-context'], categories: ['record', 'complex'] }),
  comp('guarantee-card', 'Guarantee card', 'One guarantee: statement, check, deadline, remedy and status.', { file: 'GuaranteeCard', categories: ['record'] }),
  comp('retest-clock', 'Retest clock', 'A deadline against a clock: met, missed or time left, from the dates.', { file: 'RetestClock', categories: ['record'] }),
  comp('confidence-bar', 'Confidence bar', 'Observed pass rate with an exact interval and a cautious verdict.', { file: 'ConfidenceBar', categories: ['record'] }),
  comp('approval-gate', 'Approval gate', 'A human approval step. Escalation counts as a correct outcome.', { file: 'ApprovalGate', categories: ['record'] }),
  comp('receipt-card', 'Receipt card', 'A printable signed receipt for one action.', { file: 'ReceiptCard', categories: ['record', 'complex'] }),

  comp('agent-trace', 'Agent trace', 'A collapsible waterfall of model, tool, lookup, gate and person spans.', { file: 'AgentTrace', categories: ['complex'] }),
  comp('eval-matrix', 'Eval matrix', 'Cases by runs with exact intervals and a paired McNemar comparison of any two runs.', { file: 'EvalMatrix', categories: ['complex'] }),
  comp('fleet-board', 'Fleet board', 'Sortable, filterable board of deployments with the tightest deadline computed.', { file: 'FleetBoard', categories: ['complex'] }),
  comp('evidence-diff', 'Evidence diff', 'Before and after of a prompt, policy or output, with changed words marked.', { file: 'EvidenceDiff', more: [f('src/components/diff.ts', 'registry:lib')], categories: ['complex'] }),
  comp('approval-flow', 'Approval flow', 'A layered SVG diagram of how an approval moves, with gates and progress.', { file: 'ApprovalFlow', categories: ['complex'] }),

  {
    name: 'openui', title: 'OpenUI binding', type: 'registry:lib', categories: ['openui'],
    description: 'Lets a model place the workflow components and the record views through OpenUI Lang, without letting it set verification state.',
    dependencies: ['@openuidev/react-lang'],
    registryDependencies: ['core', 'record-context', 'swimlane', 'trail', 'bottlenecks', 'priority', 'funnel', 'compare', 'confidence-bar', 'verify-status', 'ledger-timeline', 'guarantee-card'],
    files: [f('src/openui/index.ts', 'registry:lib')],
  },
]
items.push({
  name: 'all', title: 'Everything', type: 'registry:lib', categories: ['all'],
  description: 'Every component, the verifier and the barrel file. The OpenUI binding is separate because it needs @openuidev/react-lang.',
  registryDependencies: items.filter((i) => !['core', 'openui', 'all'].includes(i.name)).map((i) => i.name).concat('core'),
  files: [f('src/index.ts', 'registry:lib')],
})

const strip = (text) => text.replace(/(from\s+'\.[^']*?)\.js'/g, "$1'").replace(/(import\s+'\.[^']*?)\.js'/g, "$1'")
const target = (path) => `components/incised/${path.replace(/^src\//, '')}`

rmSync(new URL('r/', root), { recursive: true, force: true })
mkdirSync(new URL('r/', root), { recursive: true })

const index = []
for (const item of items) {
  const resolved = {
    $schema: SCHEMA,
    ...item,
    registryDependencies: (item.registryDependencies ?? []).map(ref),
    files: item.files.map((file) => {
      const raw = readFileSync(new URL(file.path, root), 'utf8')
      return { path: file.path, type: file.type, target: target(file.path), content: file.path.endsWith('.css') ? raw : strip(raw) }
    }),
  }
  if (!resolved.registryDependencies.length) delete resolved.registryDependencies
  writeFileSync(new URL(`r/${item.name}.json`, root), JSON.stringify(resolved, null, 2) + '\n')
  const { files, ...meta } = item
  index.push({ $schema: SCHEMA, ...meta, registryDependencies: resolved.registryDependencies, files: files.map((x) => ({ path: x.path, type: x.type, target: target(x.path) })) })
}
const registry = { $schema: 'https://ui.shadcn.com/schema/registry.json', name: 'incised', homepage: 'https://github.com/falnor-io/incised', items: index.map(({ $schema, ...rest }) => rest) }
writeFileSync(new URL('registry.json', root), JSON.stringify(registry, null, 2) + '\n')
writeFileSync(new URL('r/registry.json', root), JSON.stringify(registry, null, 2) + '\n')
console.log(`registry: ${items.length} items -> r/ (base ${BASE})`)
