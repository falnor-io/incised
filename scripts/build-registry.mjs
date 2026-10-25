// Builds a shadcn-compatible registry: registry.json plus one r/<name>.json per item, with file contents
// inlined. Install any item with:  npx shadcn@latest add <BASE>/<name>.json
// Files keep their src/ layout under components/orlune/, so relative imports work after install.
// Relative ".js" extensions are stripped for the copy-paste path (bundlers resolve them without).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const BASE = (process.env.REGISTRY_BASE ?? 'https://raw.githubusercontent.com/falnor-io/orlune/main/r').replace(/\/$/, '')
const root = new URL('../', import.meta.url)
const SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json'

const f = (path, type = 'registry:component') => ({ path, type })
const comp = (name, title, description, extra = {}) => ({
  name, title, description, type: 'registry:component', categories: extra.categories ?? [],
  registryDependencies: ['core', ...(extra.needs ?? [])],
  files: [f(`src/components/${extra.file ?? title.replace(/ /g, '')}.tsx`), ...(extra.more ?? [])],
})

const items = [
  {
    name: 'core', title: 'Orlune core', type: 'registry:lib', categories: ['core'],
    description: 'Shared schemas, chart helpers, hooks, record types, exact-interval stats and the stylesheet. Every component needs this.',
    dependencies: ['zod'],
    files: [f('src/schemas.ts', 'registry:lib'), f('src/components/util.ts', 'registry:lib'), f('src/components/chart.ts', 'registry:lib'), f('src/components/hooks.ts', 'registry:lib'), f('src/components/icons.tsx', 'registry:lib'), f('src/verify/types.ts', 'registry:lib'), f('src/verify/stats.ts', 'registry:lib'), f('src/styles.css', 'registry:file')],
    docs: "Import the stylesheet once: import '@/components/orlune/styles.css'. It reads your shadcn theme variables when present.",
  },
  comp('sources-context', 'Sources context', 'SourcesProvider: your traces, flows and series by id, so a model can pick one to show without writing the data.', { file: 'SourcesContext', needs: ['trace-explorer', 'flow-canvas', 'control-chart', 'sankey', 'activity-heatmap', 'deadline-gantt', 'eval-matrix', 'diff-viewer', 'fleet-board'], categories: ['openui'] }),
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

  comp('json-tree', 'Json tree', 'A collapsible view of any JSON value: typed colours, copy a path, folds long strings, cuts circular references.', { file: 'JsonTree', categories: ['complex'] }),
  comp('trace-explorer', 'Trace explorer', 'Flame graph, waterfall and span list on one axis, with minimap, zoom, search, critical path, a kind legend with share of time, and a detail panel.', { file: 'TraceExplorer', needs: ['json-tree'], more: [f('src/components/trace.ts', 'registry:lib')], categories: ['complex'] }),
  comp('diff-viewer', 'Diff viewer', 'Review-grade diff: file list, hunk headers, line numbers, folded context, changed words marked, split or unified, reviewer comments.', { file: 'DiffViewer', more: [f('src/components/diff.ts', 'registry:lib')], categories: ['complex'] }),
  comp('flow-canvas', 'Flow canvas', 'A pannable, zoomable flow diagram with swimlanes by owner, orthogonal edges, a minimap, controls and a step inspector.', { file: 'FlowCanvas', more: [f('src/components/flow.ts', 'registry:lib')], categories: ['complex'] }),
  comp('data-grid', 'Data grid', 'A virtualized grid: multi-sort, per-column filters, resize, pinned column, range select, CSV export, keyboard control.', { file: 'DataGrid', more: [f('src/components/grid.ts', 'registry:lib')], categories: ['complex'] }),
  comp('control-chart', 'Control chart', 'A p-chart for a failure rate with per-point 3-sigma limits and the Western Electric run rules.', { file: 'ControlChart', more: [f('src/components/spc.ts', 'registry:lib')], categories: ['complex'] }),
  comp('sankey', 'Sankey', 'Where cases go, sized by volume, with cases that vanished at a node called out.', { file: 'Sankey', needs: ['flow-canvas'], more: [f('src/components/sankeyLayout.ts', 'registry:lib')], categories: ['complex'] }),
  comp('approval-queue', 'Approval queue', 'A review queue where approval is bound to the exact plan by hash, edits make approvals stale, two approvers must differ, and undecided requests expire.', { file: 'ApprovalQueue', needs: ['json-tree', 'verify'], more: [f('src/components/approval.ts', 'registry:lib')], categories: ['complex'] }),
  comp('deadline-gantt', 'Deadline gantt', 'Every deadline clock on one axis: met, running, overdue and remedied, worked out from the dates.', { file: 'DeadlineGantt', more: [f('src/components/gantt.ts', 'registry:lib')], categories: ['complex'] }),
  comp('activity-heatmap', 'Activity heatmap', 'A calendar of activity with breach days marked and the longest run without a breach computed.', { file: 'ActivityHeatmap', more: [f('src/components/heat.ts', 'registry:lib')], categories: ['complex'] }),
  comp('eval-matrix', 'Eval matrix', 'Cases by runs with exact intervals and a paired McNemar comparison of any two runs.', { file: 'EvalMatrix', categories: ['complex'] }),
  comp('fleet-board', 'Fleet board', 'Sortable, filterable board of deployments with the tightest deadline computed.', { file: 'FleetBoard', categories: ['complex'] }),

  {
    name: 'openui', title: 'OpenUI binding', type: 'registry:lib', categories: ['openui'],
    description: 'Lets a model place the workflow components, the record views and the explorers through OpenUI Lang, without letting it set verification state or write the data the explorers show.',
    dependencies: ['@openuidev/react-lang'],
    registryDependencies: ['core', 'record-context', 'swimlane', 'trail', 'bottlenecks', 'priority', 'funnel', 'compare', 'confidence-bar', 'verify-status', 'ledger-timeline', 'guarantee-card', 'sources-context', 'trace-explorer', 'flow-canvas', 'control-chart', 'sankey', 'activity-heatmap', 'deadline-gantt', 'eval-matrix', 'diff-viewer', 'fleet-board'],
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
const target = (path) => `components/orlune/${path.replace(/^src\//, '')}`

/**
 * The registry as text: a map of repo-relative path to file contents. Pure, so a lint rule can compare it with
 * what is committed and fail when `r/` has gone stale.
 */
export function buildRegistry(base = BASE, repoRoot = root) {
  const refTo = (name) => `${base.replace(/\/$/, '')}/${name}.json`
  const outputs = new Map()
  const index = []
  for (const item of items) {
    const resolved = {
      $schema: SCHEMA,
      ...item,
      registryDependencies: (item.registryDependencies ?? []).map(refTo),
      files: item.files.map((file) => {
        const raw = readFileSync(new URL(file.path, repoRoot), 'utf8')
        return { path: file.path, type: file.type, target: target(file.path), content: file.path.endsWith('.css') ? raw : strip(raw) }
      }),
    }
    if (!resolved.registryDependencies.length) delete resolved.registryDependencies
    outputs.set(`r/${item.name}.json`, JSON.stringify(resolved, null, 2) + '\n')
    const { files, ...meta } = item
    index.push({ $schema: SCHEMA, ...meta, registryDependencies: resolved.registryDependencies, files: files.map((x) => ({ path: x.path, type: x.type, target: target(x.path) })) })
  }
  const registry = { $schema: 'https://ui.shadcn.com/schema/registry.json', name: 'orlune', homepage: 'https://github.com/falnor-io/orlune', items: index.map(({ $schema, ...rest }) => rest) }
  const text = JSON.stringify(registry, null, 2) + '\n'
  outputs.set('registry.json', text)
  outputs.set('r/registry.json', text)
  return outputs
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputs = buildRegistry()
  rmSync(new URL('r/', root), { recursive: true, force: true })
  mkdirSync(new URL('r/', root), { recursive: true })
  for (const [path, text] of outputs) writeFileSync(new URL(path, root), text)
  console.log(`registry: ${items.length} items -> r/ (base ${BASE})`)
}
