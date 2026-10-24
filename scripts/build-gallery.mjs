// Builds docs/index.html: a static reference page of every component's screenshot in light and dark,
// with what it does, the props it takes and the install command. Run after scripts/capture-screenshots.py.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'

const BASE = 'https://raw.githubusercontent.com/falnor-io/incised/main/r'
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
  ['Sankey', 'Complex', 'sankey', 'Where cases go, sized by volume.', 'title, nodes[ { id, label, tone? } ], links[ { source, target, value } ]', 'Cases that entered a node and did not leave it are called out, so a flow cannot quietly lose work.', 'visx-style SVG, no chart library'],
  ['ApprovalQueue', 'Complex', 'approval-queue', 'Requests waiting for a decision.', 'title, items[ QueueItem ], reviewer, now?, blind?, onDecide?', 'An approval is bound to the exact plan by hash. Edit the plan and earlier approvals go stale. A second approval must come from a different person, and anything undecided expires.', 'human-in-the-loop approval guidance'],
  ['DeadlineGantt', 'Complex', 'deadline-gantt', 'Every deadline clock on one axis.', 'title, rows[ { name, clocks[ { label, startedAt, deadlineHours, resolvedAt?, remedied? } ] } ], now', 'Met, running, overdue and missed-but-remedied come from the dates. Time past the deadline is hatched.', 'Kibo UI Gantt (category only)'],
  ['ActivityHeatmap', 'Complex', 'activity-heatmap', 'Six months of activity, with breach days marked.', 'title, days[ { date, count, breaches? } ], weeks?', 'Colour is the quartile among active days, so one huge day cannot flatten the rest. The longest run without a breach is computed.', 'GitHub contribution graph (category only)'],
  ['EvalMatrix', 'Complex', 'eval-matrix', 'Cases by runs, with a paired comparison of any two runs.', 'title, cases[ { id, label } ], runs[ { label, results } ]', 'Exact intervals per run and an exact McNemar test. One flipped case is "possible drift", not a regression.'],
  ['FleetBoard', 'Complex', 'fleet-board', 'Every deployment, its status and its tightest deadline.', 'title, rows[ { name, model?, status, clocks[] } ], now?', 'Sort and filter in place. The next deadline is computed from the clocks.'],
  ['ChainGraph', 'Complex', 'chain-graph', 'The ledger as linked hash blocks.', 'events?: VerifiedEvent[] (or RecordProvider)', 'A dashed red link shows exactly where the chain stops being trustworthy.'],
  ['ReceiptCard', 'Complex', 'receipt-card', 'A printable signed receipt for one action.', 'title, issuedAt, rows[], hash, signers[ { party, valid } ]', 'Flags a signature problem. Prints cleanly.'],
  ['OpenUI', 'OpenUI', 'openui', 'A reply written by a model, rendered through OpenUI Lang.', 'incised/openui: buildIncisedLibrary()', 'The model can place VerifyStatus and GuaranteeCard but cannot set what they say.'],
]

const refs = [
  ['Datadog, Trace View', 'https://docs.datadoghq.com/tracing/trace_explorer/trace_view/', 'Flame graph with ruler and minimap, share of time by service, detail panel under the trace.'],
  ['speedscope', 'https://www.speedscope.app/', 'Dense flame chart, overview strip with a movable window.'],
  ['Jaeger UI', 'https://www.jaegertracing.io/docs/latest/frontend-ui/', 'Critical path highlighting, timeline minimap, JSON view.'],
  ['GitHub commit diff', 'https://github.com/falnor-io/incised/commit/2536e21', 'File tree with counts, hunk headers, line-number gutters, folded context.'],
  ['React Flow', 'https://reactflow.dev/examples', 'Dotted pannable canvas, handles, minimap, controls, edge labels.'],
  ['shadcn/ui AI Elements, Trace', 'https://ui.shadcn.com/docs/components/trace', 'The existing Trace is a flat list of text lines. incised adds timing, structure and verification.'],
  ['Kibo UI', 'https://www.kibo-ui.com', 'Lists Gantt and Contribution Graph components, the category for two incised components.'],
  ['visx', 'https://visx.airbnb.tech/', 'Low-level SVG chart primitives. incised draws SVG directly.'],
  ['Agent approval UI patterns', 'https://www.setproduct.com/blog/ai-agent-ui-design-patterns', 'Bind approval to the exact plan, name the action, say whether it can be undone, show expired states.'],
]
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const label = (n) => n.replace('-tampered', ' (tampered record)')
const kb = (p) => `${Math.round(statSync(new URL(`../docs/screenshots/${p}`, import.meta.url)).size / 1024)} KB`
const groups = ['Workflow', 'Record', 'Complex', 'OpenUI']
for (const [n] of specimens) for (const m of ['light', 'dark']) if (!existsSync(new URL(`../docs/screenshots/${m}/${n}.png`, import.meta.url))) throw new Error(`missing screenshot: ${m}/${n}`)

const card = ([name, group, item, purpose, props, rule, inspired]) => `
    <article class="card" id="${name.toLowerCase()}" data-group="${group}" data-wide="${group === 'Complex' || group === 'OpenUI'}">
      <header>
        <h3>${esc(label(name))}</h3>
        <span class="tag">${group}</span>
      </header>
      <p class="purpose">${esc(purpose)}</p>
      <div class="shots">
        <figure class="shot" data-theme="light"><img loading="lazy" src="screenshots/light/${name}.png" alt="${esc(label(name))}, light theme"><figcaption>Light · ${kb(`light/${name}.png`)}</figcaption></figure>
        <figure class="shot" data-theme="dark"><img loading="lazy" src="screenshots/dark/${name}.png" alt="${esc(label(name))}, dark theme"><figcaption>Dark · ${kb(`dark/${name}.png`)}</figcaption></figure>
      </div>
      <dl>
        <dt>Props</dt><dd><code>${esc(props)}</code></dd>
        <dt>Rule</dt><dd>${esc(rule)}</dd>${inspired ? `\n        <dt>Inspired by</dt><dd>${esc(inspired)}</dd>` : ''}
        <dt>Install</dt><dd><code class="copy" tabindex="0" role="button" title="Click to copy">npx shadcn@latest add ${BASE}/${item}.json</code></dd>
      </dl>
    </article>`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>incised: component reference</title>
<style>
:root { color-scheme: light dark; --bg:#fbfaf7; --fg:#16181d; --muted:#5d6470; --line:#e3e5ea; --panel:#ffffff; --accent:#1d232b; --stage:#f1efe9; }
@media (prefers-color-scheme: dark) { :root:not([data-ui='light']) { --bg:#0e1115; --fg:#eceae4; --muted:#9aa1ab; --line:#2a313a; --panel:#151a20; --accent:#e7b65c; --stage:#0a0d10; } }
:root[data-ui='dark'] { --bg:#0e1115; --fg:#eceae4; --muted:#9aa1ab; --line:#2a313a; --panel:#151a20; --accent:#e7b65c; --stage:#0a0d10; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif; }
a { color: inherit; }
.top { position: sticky; top:0; z-index:5; background:color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(8px); border-bottom:1px solid var(--line); }
.bar { max-width:1180px; margin:0 auto; padding:10px 20px; display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; }
.bar h1 { font-size:17px; margin:0 8px 0 0; }
.seg { display:inline-flex; border:1px solid var(--line); border-radius:999px; overflow:hidden; }
.seg button { font:inherit; font-size:13px; color:inherit; background:transparent; border:0; padding:4px 12px; cursor:pointer; }
.seg button[aria-pressed='true'] { background:var(--accent); color:var(--bg); }
button:focus-visible, .copy:focus-visible, a:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.spacer { flex:1; }
main { max-width:1180px; margin:0 auto; padding:24px 20px 96px; }
.lede { color:var(--muted); max-width:72ch; margin:0 0 8px; }
.stats { color:var(--muted); font-size:13px; margin:0 0 20px; }
h2 { font-size:12px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); margin:36px 0 12px; scroll-margin-top:64px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; margin:0 0 20px; scroll-margin-top:64px; }
.card header { display:flex; gap:10px; align-items:baseline; }
.card h3 { margin:0; font-size:17px; }
.tag { font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:0 6px; }
.purpose { margin:2px 0 12px; color:var(--muted); }
.shots { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
body[data-view='light'] .shots, body[data-view='dark'] .shots { grid-template-columns:1fr; }
body[data-view='light'] .shot[data-theme='dark'], body[data-view='dark'] .shot[data-theme='light'] { display:none; }
.shot { margin:0; min-width:0; }
.shot img { display:block; width:100%; height:auto; border:1px solid var(--line); border-radius:10px; background:var(--stage); }
.shot figcaption { font-size:12px; color:var(--muted); margin-top:4px; }
@media (max-width: 860px) { .shots { grid-template-columns:1fr; } }
.card[data-wide='true'] .shots { grid-template-columns:1fr; }
dl { display:grid; grid-template-columns:max-content 1fr; gap:6px 14px; margin:14px 0 0; font-size:13px; }
dt { color:var(--muted); } dd { margin:0; min-width:0; }
code { font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:color-mix(in srgb, var(--fg) 6%, transparent); border-radius:4px; padding:1px 5px; word-break:break-word; }
.copy { cursor:pointer; display:inline-block; }
.copy[data-done='true']::after { content:'  copied'; color:var(--accent); }
.fullpage { margin-top:36px; }
.refs { padding-left:18px; display:grid; gap:6px; } .refs .muted { color:var(--muted); }
.fullpage a { display:inline-block; margin-right:14px; }
.hidden { display:none; }
</style>
</head>
<body data-view="both">
<div class="top"><div class="bar">
  <h1>incised</h1>
  <div class="seg" role="group" aria-label="Theme shown"><button type="button" data-view="both" aria-pressed="true">Both</button><button type="button" data-view="light" aria-pressed="false">Light</button><button type="button" data-view="dark" aria-pressed="false">Dark</button></div>
  <div class="seg" role="group" aria-label="Show group"><button type="button" data-group="all" aria-pressed="true">All ${specimens.length}</button>${groups.map((g) => `<button type="button" data-group="${g}" aria-pressed="false">${g} ${specimens.filter((s) => s[1] === g).length}</button>`).join('')}</div>
  <span class="spacer"></span>
  <div class="seg" role="group" aria-label="This page"><button type="button" data-ui="auto" aria-pressed="true">Page: auto</button><button type="button" data-ui="light" aria-pressed="false">Light</button><button type="button" data-ui="dark" aria-pressed="false">Dark</button></div>
</div></div>
<main>
  <p class="lede">Reference screenshots of every incised component, captured from the live demo at 2x in light and dark. Each shows the component, what it takes, the rule it enforces, what it was inspired by, and the command that installs it.</p>
  <p class="stats">${specimens.length} specimens · ${groups.map((g) => `${specimens.filter((s) => s[1] === g).length} ${g.toLowerCase()}`).join(' · ')} · generated ${new Date().toISOString().slice(0, 10)}</p>
${groups.map((g) => `  <section data-section="${g}"><h2>${g}</h2>\n${specimens.filter((s) => s[1] === g).map(card).join('\n')}</section>`).join('\n')}
  <section data-section="References"><h2>References</h2>
    <p class="lede">What the advanced components were built against. Full notes, including what was not done, are in <code>docs/REFERENCES.md</code>.</p>
    <ul class="refs">${refs.map(([n, u, d]) => `<li><a href="${u}" target="_blank" rel="noreferrer">${esc(n)}</a> <span class="muted">${esc(d)}</span></li>`).join('\n    ')}</ul>
  </section>
  <div class="fullpage"><h2>Full pages</h2>
    <a href="screenshots/light/_full-page.png">Full page, light (${kb('light/_full-page.png')})</a>
    <a href="screenshots/dark/_full-page.png">Full page, dark (${kb('dark/_full-page.png')})</a>
  </div>
</main>
<script>
const $ = (s, r = document) => [...r.querySelectorAll(s)]
const save = (k, v) => { try { localStorage.setItem(k, v) } catch {} }
const load = (k) => { try { return localStorage.getItem(k) } catch { return null } }
function press(buttons, active) { buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === active))) }
const viewBtns = $('[data-view]', document.querySelector('.bar')).filter((b) => b.tagName === 'BUTTON')
viewBtns.forEach((b) => b.addEventListener('click', () => { document.body.dataset.view = b.dataset.view; press(viewBtns, b); save('ic-view', b.dataset.view) }))
const groupBtns = $('[data-group]', document.querySelector('.bar'))
groupBtns.forEach((b) => b.addEventListener('click', () => {
  press(groupBtns, b)
  $('[data-section]').forEach((s) => s.classList.toggle('hidden', b.dataset.group !== 'all' && s.dataset.section !== b.dataset.group))
}))
const uiBtns = $('[data-ui]')
function setUi(v) { if (v === 'auto') document.documentElement.removeAttribute('data-ui'); else document.documentElement.dataset.ui = v; press(uiBtns, uiBtns.find((b) => b.dataset.ui === v)); save('ic-ui', v) }
uiBtns.forEach((b) => b.addEventListener('click', () => setUi(b.dataset.ui)))
const v = load('ic-view'); if (v) viewBtns.find((b) => b.dataset.view === v)?.click()
const u = load('ic-ui'); if (u) setUi(u)
$('.copy').forEach((el) => { const go = () => navigator.clipboard?.writeText(el.textContent.trim()).then(() => { el.dataset.done = 'true'; setTimeout(() => delete el.dataset.done, 1500) }); el.addEventListener('click', go); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } }) })
</script>
</body>
</html>
`
writeFileSync(new URL('../docs/index.html', import.meta.url), html)
console.log(`docs/index.html: ${specimens.length} specimens`)
