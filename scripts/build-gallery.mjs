// Builds docs/index.html: a static reference page of every component's screenshot in light and dark,
// with what it does, the props it takes and the install command. Run after scripts/capture-screenshots.py.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'

const BASE = 'https://raw.githubusercontent.com/falnor-io/orlune/main/r'
const specimens = [
  // name, group, registry item, one-line purpose, props, rule it enforces
  ['Swimlane', 'Workflow', 'swimlane', 'Who does what, and where work waits.', 'title, lanes[ { owner, steps[ { name, waiting? } ] } ]', 'Plain data only.'],
  ['Trail', 'Workflow', 'trail', 'One request traced stop by stop.', 'title, request, stops[ { owner, name, note, waitDays } ]', 'Total wait is computed, not supplied.'],
  ['Bottlenecks', 'Workflow', 'bottlenecks', 'Where work waits most, as ranked bars.', 'title, unit, items[ { stage, amount } ]', 'The longest wait is marked by the component.'],
  ['Funnel', 'Workflow', 'funnel', 'How many make it through each step.', 'title, unit, steps[ { label, value } ]', 'Share kept at each step is computed.'],
  ['Priority', 'Workflow', 'priority', 'Impact against effort: quick wins, big bets, fill-ins, park.', 'title, items[ { label, impact, effort } ]', 'Always labelled as a judgement, not a measurement.'],
  ['Compare', 'Workflow', 'compare', 'Today against a mapped version, row by row.', 'title, leftLabel, rightLabel, rows[ { label, left, right } ]', 'Structure only, never a result.'],
  ['VerifyStatus', 'Record', 'verify-status', 'The verdict on a record: intact, or not.', 'result?: VerifyResult (or RecordProvider)', 'Says “Not verified” unless given a verifier result.'],
  ['VerifyStatus-tampered', 'Record', 'verify-status', 'The same record after one ledger event was edited.', 'result: VerifyResult', 'Names the bad signature and the broken chain link.'],
  ['LedgerTimeline', 'Record', 'ledger-timeline', 'The signed event ledger, in order.', 'events?: VerifiedEvent[] (or RecordProvider)', 'Incidents, re-tests and remedies stand out; bad links are red.'],
  ['GuaranteeCard', 'Record', 'guarantee-card', 'One guarantee: statement, check, deadline, remedy, status.', 'id, statement, check, deadlineHours?, remedy, status, detail?', 'Status comes from the verifier.'],
  ['RetestClock', 'Record', 'retest-clock', 'A deadline against a clock.', 'label, startedAt, deadlineHours, resolvedAt?, result?, remedied?, now?, live?', 'Met, missed or time left is worked out from the dates.'],
  ['ConfidenceBar', 'Record', 'confidence-bar', 'An observed pass rate with its exact interval.', 'label, passes, n, confidence?, threshold?', '45 of 50 never supports a 90% claim, and it says so.'],
  ['ApprovalGate', 'Record', 'approval-gate', 'A human approval step.', 'action, approver, state, note?, at?', 'Escalating to a person counts as a correct outcome.'],
  ['TraceExplorer', 'Complex', 'trace-explorer', 'Flame graph, waterfall and span list on one time axis.', 'title, spans[ { id, parentId?, name, kind, startMs, durationMs, status, attrs?, input?, output?, tokens?, costUsd? } ]', 'Self time, share of trace, critical path, totals and cost are computed from the spans. Parallel calls get their own rows, and orphans and cycles never drop a span.', 'Datadog trace view, speedscope, Jaeger'],
  ['DiffViewer', 'Complex', 'diff-viewer', 'What changed in a policy, a prompt or an output.', 'title, files[ { path, before, after } ], comments?[ { path, line, author, text } ]', 'Folds unchanged lines until you ask, marks changed words inside changed lines, and pins reviewer comments to lines.', 'GitHub pull request diff'],
  ['FlowCanvas', 'Complex', 'flow-canvas', 'How an approval moves, on a canvas you can pan and zoom.', 'title, nodes[ { id, label, kind, owner?, status?, detail? } ], edges[ { from, to, label?, animated? } ]', 'You describe the steps and links; the layout is computed. Owners become swimlanes, edges that skip a column arc over the top, and a click traces what feeds a step.', 'React Flow'],
  ['DataGrid', 'Complex', 'data-grid', 'Thousands of rows, sorted, filtered and selected.', 'title, rows, columns[ { id, header, value, type?, pin?, aggregate? } ], rowId', 'Draws only the visible rows. Multi-sort, filters like >5 or 10..20, resize, range select, CSV that cannot run as a formula, keyboard throughout.', 'built to requirements, no single reference'],
  ['ControlChart', 'Complex', 'control-chart', 'A failure rate with the limits it should stay within.', 'title, data[ { label, failures, n } ], baseline?, markers?', 'Limits come from each point\'s sample size. A signal says look closer, never that something broke, and a quiet chart never claims it is safe.', 'standard SPC p-chart and Western Electric rules'],
  ['ControlChart-nelson', 'Complex', 'control-chart', 'The same data under all eight Nelson rules.', 'title, data, baseline?, rules?: SpcRule[], markers?', 'Rules 5 to 8 add a trend, hugging the centre, a zigzag and a run beyond one sigma.'],
  ['Sankey', 'Complex', 'sankey', 'Where cases go, sized by volume.', 'title, nodes[ { id, label, tone? } ], links[ { source, target, value } ]', 'Cases that entered a node and did not leave it are called out, so a flow cannot quietly lose work.', 'visx-style SVG, no chart library'],
  ['ApprovalQueue', 'Complex', 'approval-queue', 'Requests waiting for a decision.', 'title, items[ QueueItem ], reviewer, now?, blind?, onDecide?', 'An approval is bound to the exact plan by hash. Edit the plan and earlier approvals go stale. A second approval must come from a different person, and anything undecided expires.', 'human-in-the-loop approval guidance'],
  ['DeadlineGantt', 'Complex', 'deadline-gantt', 'Every deadline clock on one axis.', 'title, rows[ { name, clocks[ { label, startedAt, deadlineHours, resolvedAt?, remedied? } ] } ], now', 'Met, running, overdue and missed-but-remedied come from the dates. Time past the deadline is hatched.', 'Kibo UI Gantt (category only)'],
  ['ActivityHeatmap', 'Complex', 'activity-heatmap', 'Six months of activity, with breach days marked.', 'title, days[ { date, count, breaches? } ], weeks?', 'Colour is the quartile among active days, so one huge day cannot flatten the rest. The longest run without a breach is computed.', 'GitHub contribution graph (category only)'],
  ['EvalMatrix', 'Complex', 'eval-matrix', 'Cases by runs, with a paired comparison of any two runs.', 'title, cases[ { id, label } ], runs[ { label, results } ]', 'Exact intervals per run and an exact McNemar test. One flipped case is "possible drift", not a regression.'],
  ['FleetBoard', 'Complex', 'fleet-board', 'Every deployment, its status and its tightest deadline.', 'title, rows[ { name, model?, status, clocks[] } ], now?', 'Sort and filter in place. The next deadline is computed from the clocks.'],
  ['ChainGraph', 'Complex', 'chain-graph', 'The ledger as linked hash blocks.', 'events?: VerifiedEvent[] (or RecordProvider)', 'A dashed red link shows exactly where the chain stops being trustworthy.'],
  ['ReceiptCard', 'Complex', 'receipt-card', 'A printable signed receipt for one action.', 'title, issuedAt, rows[], hash, signers[ { party, valid } ]', 'Flags a signature problem. Prints cleanly.'],
  ['AutonomyGate', 'Judgement', 'autonomy-gate', 'When an agent has earned more autonomy, from counted agreement with a person.', 'title, tier, cases[ { id, task?, outcome, at? } ], rule { rate, minCases }, looks?', 'Says eligible, never promoted. The interval widens with each look.'],
  ['AutonomyGate-ready', 'Judgement', 'autonomy-gate', 'The same gate once the lower bound clears the rule.', 'title, tier, cases[], rule', 'A person still decides the promotion.'],
  ['AutonomyGate-blocked', 'Judgement', 'autonomy-gate', 'The same gate when something other than the total holds it back.', 'title, tier, cases[ { id, task?, outcome, at?, reviewMs? } ], rule { rate, minCases, critical?, reviewFloor?, controls?, recentWindow? }', 'A critical task, a missing control or hurried approvals each block a pass, and each is named.'],
  ['EvidenceTable', 'Judgement', 'evidence-table', 'Each extracted value with the places it was read from.', 'title, rows[ { id, field, value, sources[ { id, label, locator?, excerpt?, read? } ] } ]', 'Coverage and conflicts are counted. There is no confidence score.'],
  ['EvidenceTable-checked', 'Judgement', 'evidence-table', 'The same extraction checked against the documents.', 'title, rows[], documents?{ id: text }, available?[ { id, field, value } ]', 'A quote that is not in its document is flagged, and values the source has that were not extracted are named.'],
  ['ApprovalChain', 'Judgement', 'approval-chain', 'Who has to approve, in order, and who is being waited on.', 'title, requester, startedAt, steps[ { id, role, who?, timeoutMin, escalateTo? } ], decisions[]', 'A decision from the requester or the wrong person does not count, and says why.'],
  ['ApprovalChain-late', 'Judgement', 'approval-chain', 'The same chain once a step is late.', 'title, requester, startedAt, steps[], decisions[], now', 'Late steps name who they go to.'],
  ['HandoffPacket', 'Judgement', 'handoff-packet', 'What an agent hands a person when it stops.', 'title, handoff { summary, attempted[], stoppedBecause, recommended, needsFrom, deadline, evidence[] }', 'Complete only when a person could act without asking the agent.'],
  ['HandoffPacket-incomplete', 'Judgement', 'handoff-packet', 'The same check on a thin handoff.', 'title, handoff', 'Every missing part is named.'],
  ['InputRequest-elicitation', 'Judgement', 'input-request', 'A request in the shape an MCP server sends.', 'title, from?, asked?, fields[] (or fieldsFromJsonSchema(schema)), link?, onSubmit?, onDecline?, onCancel?, onResult?', 'Secret-like fields are refused, a link names its site, and the answer is accept, decline or cancel.'],
  ['PlanVsActual', 'Judgement', 'plan-vs-actual', 'What the agent planned next to what it did.', 'title, plan[ { id, action } ], actual[ { id, action, status, planId? } ]', 'Skipped, failed, blocked, late and unplanned steps come from the two lists.'],
  ['PermissionGrant', 'Judgement', 'permission-grant', 'What an agent is allowed to do and how much is left.', 'title, grants[ { id, scope, resource?, limit?, used?, grantedBy, grantedAt, expiresAt?, revokedAt? } ], now?', 'Expired, revoked, used up and over-limit grants are told apart from the clock and the usage, and the worst come first.'],
  ['BudgetMeter', 'Judgement', 'budget-meter', 'Spend against a limit, with the pace it implies.', 'title, limit, used, unit, periodStart, periodEnd, samples?[], now?', 'The projection is a straight line, and it says when the limit is reached if that is before the period ends.'],
  ['AutonomyBoard', 'Workspace', 'autonomy-board', 'Every agent in one list, with what needs a look first.', 'title, agents[ { id, name, tier, cases[], rule, looks?, grants?[], budget? } ], now?', 'Each row comes from that agent\'s own cases, grants and budget. Eligible is a prompt for a person, never a promotion.'],
  ['RecordViewer', 'Workspace', 'record-viewer', 'One record on one page, with its verdict, guarantees, events and chain.', 'title, result (from verifyRecord), manifest?', 'Verified only when the verdict and the details beside it agree. The export is the verifier\'s output, not a new signature.'],
  ['RecordViewer-tampered', 'Workspace', 'record-viewer', 'The same viewer on a record with one edited event.', 'title, result, manifest', 'Names the changed event and the breach with no remedy.'],
  ['InputRequest', 'Judgement', 'input-request', 'A form an agent hands to a person.', 'title, asked?, context?[], fields[ { name, label, type, required?, options?, min?, max? } ], onSubmit?, onDecline?', 'Each answer is checked against the field it was asked for before it goes back.'],
  ['ApprovalWorkspace', 'Workspace', 'approval-workspace', 'The approval queue with chain, evidence and handoff beside it.', 'title, items[ { queue, chain?, evidence?, handoff? } ], reviewer, now?', 'A tab appears only when the request has that part.'],
  ['RunInspector', 'Workspace', 'run-inspector', 'One agent run in four views, with four questions answered first.', 'title, spans[], plan?, actual?, evidence?[]', 'Every answer is worked out from the spans, the plan and the evidence you pass in.'],
  ['OpenUI', 'OpenUI', 'openui', 'A reply written by a model, rendered through OpenUI Lang.', 'orlune/openui: buildOrluneLibrary(), SourcesProvider sources={ traces, sankeys, ... }', 'The model can place VerifyStatus and GuaranteeCard but cannot set what they say. The explorers take a source id (TraceExplorer("run-42", title)); the data comes from your SourcesProvider.'],
]

const refs = [
  ['Datadog, Trace View', 'https://docs.datadoghq.com/tracing/trace_explorer/trace_view/', 'Flame graph with ruler and minimap, share of time by service, detail panel under the trace.'],
  ['speedscope', 'https://www.speedscope.app/', 'Dense flame chart, overview strip with a movable window.'],
  ['Jaeger UI', 'https://www.jaegertracing.io/docs/latest/frontend-ui/', 'Critical path highlighting, timeline minimap, JSON view.'],
  ['GitHub commit diff', 'https://github.com/falnor-io/orlune/commit/2536e21', 'File tree with counts, hunk headers, line-number gutters, folded context.'],
  ['React Flow', 'https://reactflow.dev/examples', 'Dotted pannable canvas, handles, minimap, controls, edge labels.'],
  ['shadcn/ui AI Elements, Trace', 'https://ui.shadcn.com/docs/components/trace', 'The existing Trace is a flat list of text lines. orlune adds timing, structure and verification.'],
  ['Kibo UI', 'https://www.kibo-ui.com', 'Lists Gantt and Contribution Graph components, the category for two orlune components.'],
  ['visx', 'https://visx.airbnb.tech/', 'Low-level SVG chart primitives. orlune draws SVG directly.'],
  ['Agent approval UI patterns', 'https://www.setproduct.com/blog/ai-agent-ui-design-patterns', 'Bind approval to the exact plan, name the action, say whether it can be undone, show expired states.'],
]
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const label = (n) => n.replace('-tampered', ' (tampered record)').replace('-late', ' (late)').replace('-incomplete', ' (incomplete)').replace('-ready', ' (ready)')
const kb = (p) => `${Math.round(statSync(new URL(`../docs/screenshots/${p}`, import.meta.url)).size / 1024)} KB`
const groups = ['Workflow', 'Record', 'Complex', 'Judgement', 'Workspace', 'OpenUI']
for (const [n] of specimens) for (const m of ['light', 'dark']) if (!existsSync(new URL(`../docs/screenshots/${m}/${n}.png`, import.meta.url))) throw new Error(`missing screenshot: ${m}/${n}`)

const card = ([name, group, item, purpose, props, rule, inspired]) => `
    <article class="card" id="${name.toLowerCase()}" data-group="${group}">
      <header><h3>${esc(label(name))}</h3><p>${esc(purpose)}</p></header>
      <div class="shots">
        <figure class="shot" data-theme="light"><img loading="lazy" src="screenshots/light/${name}.png" alt="${esc(label(name))}, light theme"></figure>
        <figure class="shot" data-theme="dark"><img loading="lazy" src="screenshots/dark/${name}.png" alt="${esc(label(name))}, dark theme"></figure>
      </div>
      <details>
        <summary>Details</summary>
        <dl>
          <dt>Props</dt><dd><code>${esc(props)}</code></dd>
          <dt>Rule</dt><dd>${esc(rule)}</dd>${inspired ? `\n          <dt>Inspired by</dt><dd>${esc(inspired)}</dd>` : ''}
          <dt>Install</dt><dd><code class="copy" tabindex="0" role="button" title="Click to copy">npx shadcn@latest add ${BASE}/${item}.json</code></dd>
        </dl>
      </details>
    </article>`

const sheet = specimens.map(([name]) => `<a class="thumb" href="#${name.toLowerCase()}"><span class="thumbimg"><img loading="lazy" data-theme="light" src="screenshots/light/${name}.png" alt=""><img loading="lazy" data-theme="dark" src="screenshots/dark/${name}.png" alt=""></span><span class="thumbname">${esc(label(name))}</span></a>`).join('\n    ')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>orlune</title>
<style>
:root { color-scheme: light dark; --bg:#fafafa; --fg:#111317; --muted:#626a75; --line:#e4e6ea; --panel:#ffffff; --accent:#1d232b; --stage:#f1f2f4; }
@media (prefers-color-scheme: dark) { :root:not([data-ui='light']) { --bg:#0d0f12; --fg:#ececec; --muted:#9aa1ab; --line:#262b32; --panel:#14171b; --accent:#e7b65c; --stage:#090b0d; } }
:root[data-ui='dark'] { --bg:#0d0f12; --fg:#ececec; --muted:#9aa1ab; --line:#262b32; --panel:#14171b; --accent:#e7b65c; --stage:#090b0d; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif; }
a { color: inherit; }
.top { position: sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line); }
.bar { max-width:1240px; margin:0 auto; padding:10px 20px; display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; }
.bar h1 { font-size:17px; margin:0 8px 0 0; }
.seg { display:inline-flex; border:1px solid var(--line); border-radius:999px; overflow:hidden; }
.seg button { font:inherit; font-size:13px; color:inherit; background:transparent; border:0; padding:4px 12px; cursor:pointer; }
.seg button[aria-pressed='true'] { background:var(--accent); color:var(--bg); }
button:focus-visible, .copy:focus-visible, a:focus-visible, summary:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.spacer { flex:1; }
main { max-width:1240px; margin:0 auto; padding:24px 20px 96px; }
.sheet { display:grid; grid-template-columns:repeat(auto-fill, minmax(168px, 1fr)); gap:14px; margin:0 0 8px; }
.thumb { text-decoration:none; display:grid; gap:6px; }
.thumbimg { display:block; aspect-ratio:16/10; overflow:hidden; border:1px solid var(--line); border-radius:10px; background:var(--stage); }
.thumbimg img { width:100%; height:100%; object-fit:cover; object-position:top left; display:block; }
.thumb:hover .thumbimg { border-color:var(--muted); }
.thumbname { font-size:13px; }
body[data-view='light'] img[data-theme='dark'], body[data-view='dark'] img[data-theme='light'] { display:none; }
body[data-view='both'] .thumbimg img[data-theme='dark'] { display:none; }
h2 { font-size:15px; font-weight:600; margin:44px 0 14px; scroll-margin-top:64px; }
.card { margin:0 0 36px; scroll-margin-top:64px; }
.card header { display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 12px; margin-bottom:10px; }
.card h3 { margin:0; font-size:18px; }
.card header p { margin:0; color:var(--muted); }
.shots { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
body[data-view='light'] .shots, body[data-view='dark'] .shots { grid-template-columns:1fr; }
body[data-view='light'] .shot[data-theme='dark'], body[data-view='dark'] .shot[data-theme='light'] { display:none; }
.shot { margin:0; min-width:0; }
.shot img { display:block; width:100%; height:auto; border:1px solid var(--line); border-radius:12px; background:var(--stage); }
.card[data-group='Complex'] .shots, .card[data-group='Judgement'] .shots, .card[data-group='Workspace'] .shots, .card[data-group='OpenUI'] .shots { grid-template-columns:1fr; }
@media (max-width: 860px) { .shots { grid-template-columns:1fr; } }
details { margin-top:10px; font-size:13px; }
summary { cursor:pointer; color:var(--muted); width:fit-content; }
summary:hover { color:var(--fg); }
dl { display:grid; grid-template-columns:max-content 1fr; gap:6px 14px; margin:10px 0 0; }
dt { color:var(--muted); } dd { margin:0; min-width:0; }
code { font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:color-mix(in srgb, var(--fg) 6%, transparent); border-radius:4px; padding:1px 5px; word-break:break-word; }
.copy { cursor:pointer; display:inline-block; }
.copy[data-done='true']::after { content:'  copied'; color:var(--accent); }
.refs { display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; list-style:none; }
.refs a { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 12px; font-size:13px; text-decoration:none; }
.refs a:hover { border-color:var(--muted); }
.hidden { display:none; }
</style>
</head>
<body data-view="both">
<div class="top"><div class="bar">
  <h1>orlune</h1>
  <div class="seg" role="group" aria-label="Theme shown"><button type="button" data-view="both" aria-pressed="true">Both</button><button type="button" data-view="light" aria-pressed="false">Light</button><button type="button" data-view="dark" aria-pressed="false">Dark</button></div>
  <div class="seg" role="group" aria-label="Show group"><button type="button" data-group="all" aria-pressed="true">All ${specimens.length}</button>${groups.map((g) => `<button type="button" data-group="${g}" aria-pressed="false">${g} ${specimens.filter((s) => s[1] === g).length}</button>`).join('')}</div>
  <span class="spacer"></span>
  <div class="seg" role="group" aria-label="This page"><button type="button" data-ui="auto" aria-pressed="true">Auto</button><button type="button" data-ui="light" aria-pressed="false">Light</button><button type="button" data-ui="dark" aria-pressed="false">Dark</button></div>
</div></div>
<main>
  <nav class="sheet" aria-label="All components">
    ${sheet}
  </nav>
${groups.map((g) => `  <section data-section="${g}"><h2>${g}</h2>\n${specimens.filter((s) => s[1] === g).map(card).join('\n')}</section>`).join('\n')}
  <section data-section="References"><h2>References</h2>
    <ul class="refs">${refs.map(([n, u, d]) => `<li><a href="${u}" target="_blank" rel="noreferrer" title="${esc(d)}">${esc(n)}</a></li>`).join('')}</ul>
  </section>
</main>
<script>
const $ = (s, r = document) => [...r.querySelectorAll(s)]
const save = (k, v) => { try { localStorage.setItem(k, v) } catch {} }
const load = (k) => { try { return localStorage.getItem(k) } catch { return null } }
function press(buttons, active) { buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === active))) }
const bar = document.querySelector('.bar')
const viewBtns = $('[data-view]', bar)
viewBtns.forEach((b) => b.addEventListener('click', () => { document.body.dataset.view = b.dataset.view; press(viewBtns, b); save('ol-view', b.dataset.view) }))
const groupBtns = $('[data-group]', bar)
groupBtns.forEach((b) => b.addEventListener('click', () => {
  press(groupBtns, b)
  $('[data-section]').forEach((sec) => sec.classList.toggle('hidden', sec.dataset.section !== 'References' && b.dataset.group !== 'all' && sec.dataset.section !== b.dataset.group))
  $('.thumb').forEach((t) => t.classList.toggle('hidden', b.dataset.group !== 'all' && document.getElementById(t.getAttribute('href').slice(1))?.dataset.group !== b.dataset.group))
}))
const uiBtns = $('[data-ui]', bar)
function setUi(v) { if (v === 'auto') document.documentElement.removeAttribute('data-ui'); else document.documentElement.dataset.ui = v; press(uiBtns, uiBtns.find((b) => b.dataset.ui === v)); save('ol-ui', v) }
uiBtns.forEach((b) => b.addEventListener('click', () => setUi(b.dataset.ui)))
const v = load('ol-view'); if (v) viewBtns.find((b) => b.dataset.view === v)?.click()
const u = load('ol-ui'); if (u) setUi(u)
$('.copy').forEach((el) => { const go = () => navigator.clipboard?.writeText(el.textContent.trim()).then(() => { el.dataset.done = 'true'; setTimeout(() => delete el.dataset.done, 1500) }); el.addEventListener('click', go); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } }) })
</script>
</body>
</html>
`
writeFileSync(new URL('../docs/index.html', import.meta.url), html)
console.log(`docs/index.html: ${specimens.length} specimens`)
