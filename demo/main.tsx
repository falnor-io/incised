import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Renderer } from '@openuidev/react-lang'
import {
  ApprovalGate, NELSON, fieldsFromJsonSchema, TraceExplorer, DiffViewer, FlowCanvas, DataGrid, ControlChart, Sankey, ApprovalQueue, DeadlineGantt, ActivityHeatmap, planDigest, type QueueItem, type Column, Bottlenecks, ChainGraph, Compare, ConfidenceBar, EvalMatrix, FleetBoard,
  Funnel, GuaranteeCard, LedgerTimeline, AutonomyGate, EvidenceTable, PlanVsActual, RunInspector, ApprovalChain, HandoffPacket, ApprovalWorkspace, PermissionGrant, BudgetMeter, AutonomyBoard, RecordViewer, InputRequest, Priority, ReceiptCard, RecordProvider, RetestClock, SourcesProvider, Swimlane, Trail, VerifyStatus,
} from '../src/index.js'
import { buildOrluneLibrary } from '../src/openui/index.js'
import { verifyRecord, type RecordBundle, type VerifyResult } from '../src/verify/index.js'
import '../src/styles.css'
import sample from './sample-record.json'
import { traceSpans, diffFiles, diffComments, flowNodes, flowEdges, runRows, spcData, sankeyNodes, sankeyLinks, ganttRows, heatDays, NOW_ISO, grantRows, budgetSamples, fleetAgents, gateCasesBlocked, evidenceDocs, evidenceRowsChecked, evidenceAvailable, buildQueue, gateCases, gateCasesReady, evidenceRows, planSteps, actualSteps, chainSteps, chainDecisions, lateChainDecisions, handoffFull, handoffThin, workspaceExtras, type RunRow } from './data.js'

const NOW = new Date('2026-06-10T00:00:00Z')
const record = sample as unknown as RecordBundle
const library = buildOrluneLibrary()

function Spec({ name, kind, note, children }: { name: string; kind: 'Workflow' | 'Record' | 'Complex' | 'Judgement' | 'Workspace' | 'OpenUI'; note: string; children: ReactNode }) {
  return (
    <figure className="spec" data-name={name} id={name.toLowerCase()}>
      <figcaption>{name.replace('-tampered', ' (tampered record)')}</figcaption>
      <div className="spec-body">{children}</div>
    </figure>
  )
}

const runColumns: Column<RunRow>[] = [
  { id: 'id', header: 'Run', value: (r) => r.id, width: 120, pin: true },
  { id: 'deployment', header: 'Deployment', value: (r) => r.deployment, width: 170 },
  { id: 'model', header: 'Model', value: (r) => r.model, width: 110 },
  { id: 'status', header: 'Status', value: (r) => r.status, type: 'status', width: 110 },
  { id: 'duration', header: 'Duration', value: (r) => r.durationMs, type: 'duration', width: 110, aggregate: 'avg' },
  { id: 'cost', header: 'Cost', value: (r) => r.costUsd, type: 'usd', width: 100, aggregate: 'sum' },
  { id: 'pass', header: 'Pass rate', value: (r) => r.passRate, type: 'percent', width: 150, aggregate: 'avg' },
  { id: 'trend', header: 'Trend', value: (r) => r.trend, type: 'spark', width: 110, sortable: false },
  { id: 'steps', header: 'Steps', value: (r) => r.steps, type: 'number', width: 80 },
  { id: 'started', header: 'Started (UTC)', value: (r) => r.startedAt, type: 'date', width: 140 },
]

const cases = ['Duplicate invoice', 'Missing PO number', 'Vendor name mismatch', 'Over approval limit', 'Currency conversion', 'Late-fee dispute', 'Split shipment', 'Tax ID missing', 'Credit note', 'Rush payment'].map((label, i) => ({ id: `c${i}`, label }))
const allPass = Object.fromEntries(cases.map((c) => [c.id, true]))

function App() {
  const [good, setGood] = useState<VerifyResult | null>(null)
  const [bad, setBad] = useState<VerifyResult | null>(null)
  const [queue, setQueue] = useState<QueueItem[] | null>(null)

  useEffect(() => {
    buildQueue(planDigest).then((q) => setQueue(q as unknown as QueueItem[]))
    verifyRecord(record, { now: NOW }).then(setGood)
    const edited = structuredClone(record)
    edited.ledger[3]!.result = 'fail'
    verifyRecord(edited, { now: NOW }).then(setBad)
  }, [])

  return (
    <main>
      <h1>orlune</h1>
            <nav className="toc" aria-label="Components">
        {['Workflow', 'Record', 'Complex', 'OpenUI'].map((k) => <a key={k} href={`#group-${k}`}>{k}</a>)}
      </nav>

      <h2 id="group-Workflow">Workflow</h2>
      <div className="grid">
        <Spec name="Swimlane" kind="Workflow" note="Who does what and where it waits.">
          <Swimlane title="Client onboarding: who does what" lanes={[
            { owner: 'Sales', steps: [{ name: 'Proposal signed' }, { name: 'Handoff email', waiting: true }] },
            { owner: 'Operations', steps: [{ name: 'Project set up', waiting: true }, { name: 'Kickoff booked' }] },
          ]} />
        </Spec>
        <Spec name="Trail" kind="Workflow" note="One request, stop by stop. Total wait is computed.">
          <Trail title="Where one request waits" request="Referral 1042" stops={[
            { owner: 'Front desk', name: 'Referral received', note: 'Logged in the inbox', waitDays: 0 },
            { owner: 'Doctor', name: 'Sign-off', note: 'Waits for the next clinic day', waitDays: 3 },
            { owner: 'Admin', name: 'Letter sent', note: 'Printed and posted', waitDays: 1 },
            { owner: 'Patient', name: 'Appointment booked', note: 'Phone tag', waitDays: 2 },
          ]} />
        </Spec>
        <Spec name="Bottlenecks" kind="Workflow" note="Where work waits most.">
          <Bottlenecks title="Where work waits most" unit="days" items={[{ stage: 'Handoff', amount: 2 }, { stage: 'Set up', amount: 3 }, { stage: 'Kickoff', amount: 2 }]} />
        </Spec>
        <Spec name="Funnel" kind="Workflow" note="Share kept at each step is computed.">
          <Funnel title="How many make it through" unit="deals" steps={[{ label: 'Signed', value: 40 }, { label: 'Set up', value: 31 }, { label: 'Kickoff held', value: 22 }]} />
        </Spec>
        <Spec name="Priority" kind="Workflow" note="Impact against effort. Labelled as a judgement.">
          <Priority title="Where to start" items={[
            { label: 'Handoff to operations', impact: 'high', effort: 'low' },
            { label: 'Project set up', impact: 'high', effort: 'high' },
            { label: 'Kickoff booked', impact: 'low', effort: 'low' },
          ]} />
        </Spec>
        <Spec name="Compare" kind="Workflow" note="Today against a mapped version.">
          <Compare title="Who holds the handoff" leftLabel="Today" rightLabel="Mapped" rows={[
            { label: 'Owner', left: 'Whoever sees the email', right: 'One named person' },
            { label: 'Written down', left: "In people's heads", right: 'In the workflow' },
            { label: 'Checked', left: 'When someone remembers', right: 'At every signed deal' },
          ]} />
        </Spec>
      </div>

      <h2 id="group-Record">Record</h2>
      <div className="grid">
        <Spec name="VerifyStatus" kind="Record" note="Verdict from the verifier. Intact record.">
          <VerifyStatus result={good} />
        </Spec>
        <Spec name="VerifyStatus-tampered" kind="Record" note="One ledger event edited after signing.">
          <VerifyStatus result={bad} />
        </Spec>
        <Spec name="LedgerTimeline" kind="Record" note="Signed events. Incident, re-test and remedy stand out.">
          <LedgerTimeline events={good?.events} />
        </Spec>
        <Spec name="GuaranteeCard" kind="Record" note="One guarantee and its status, from the record.">
          <GuaranteeCard {...record.manifest.guarantees[2]!} status="remedied" detail="incident #5 root cause in 36.0h" />
        </Spec>
        <Spec name="RetestClock" kind="Record" note="Met, missed or time left, from the dates.">
          <div className="stack">
            <RetestClock label="Re-test after model release #3" startedAt="2026-06-03T00:00:00Z" resolvedAt="2026-06-04T06:00:00Z" deadlineHours={48} result="pass" />
            <RetestClock label="Root cause after incident #5" startedAt="2026-06-05T08:00:00Z" resolvedAt="2026-06-06T20:00:00Z" deadlineHours={24} remedied />
          </div>
        </Spec>
        <Spec name="ConfidenceBar" kind="Record" note="Exact interval. 45 of 50 cannot support a 90% claim.">
          <div className="stack">
            <ConfidenceBar label="Exception routing accuracy (45 of 50)" passes={45} n={50} threshold={0.9} />
            <ConfidenceBar label="Same rate, 900 of 1000" passes={900} n={1000} threshold={0.85} />
          </div>
        </Spec>
        <Spec name="ApprovalGate" kind="Record" note="Escalation counts as a correct outcome.">
          <ApprovalGate action="Release payment over the approval limit" approver="Controller" state="escalated" note="The agent held the payment and asked a person." />
        </Spec>
      </div>

      <h2 id="group-Complex">Complex</h2>
      <div className="grid wide">
        <Spec name="TraceExplorer" kind="Complex" note="Flame graph, waterfall and ranked list over one axis, with minimap, zoom, critical path and a detail panel.">
          <TraceExplorer title="Invoice exception run" spans={traceSpans} defaultSelected="vendor" />
        </Spec>
        <Spec name="DiffViewer" kind="Complex" note="Review-grade diff: file list, hunks, line numbers, folded context, changed words, reviewer comments.">
          <DiffViewer title="Approval policy and prompt, v3 to v4" files={diffFiles} comments={diffComments} />
        </Spec>
        <Spec name="FlowCanvas" kind="Complex" note="Pan, zoom, minimap, swimlanes by owner, and click a step to trace what feeds it.">
          <FlowCanvas title="Payment approval" nodes={flowNodes as never} edges={flowEdges as never} height={420} defaultSelected="limit" />
        </Spec>
        <Spec name="DataGrid" kind="Complex" note="2,400 rows, only the visible ones drawn. Multi-sort, filters like >5 or 10..20, resize, range select, CSV.">
          <DataGrid title="Agent runs" rows={runRows} columns={runColumns} rowId={(r) => r.id} height={400} noun="runs" defaultSort={[{ id: 'status', dir: 'asc' }, { id: 'duration', dir: 'desc' }]} initialFilters={{ model: 'model-x', duration: '>3000' }} initialSelected={['run-2101', 'run-0976', 'run-2353']} />
        </Spec>
        <Spec name="ControlChart" kind="Complex" note="Failure rate with 3-sigma limits per sample size and the standard run rules. A signal says look closer, never that it broke.">
          <ControlChart title="Daily failure rate, invoice exceptions" data={spcData} baseline={10} markers={[{ at: 11, label: 'Model X.1 released' }]} />
        </Spec>
        <Spec name="ControlChart-nelson" kind="Complex" note="The same data under all eight Nelson rules. Rules 5 to 8 catch a slow drift, a rate that is too steady, a zigzag and a sustained wobble that the four Western Electric rules miss.">
          <ControlChart title="Daily failure rate, all eight Nelson rules" data={spcData} baseline={10} rules={NELSON} markers={[{ at: 11, label: 'Model X.1 released' }]} />
        </Spec>
        <Spec name="Sankey" kind="Complex" note="Where cases go, sized by volume. A node that loses cases says so.">
          <Sankey title="Where 1,900 invoices went" nodes={sankeyNodes} links={sankeyLinks} unit="invoices" />
        </Spec>
        <Spec name="ApprovalQueue" kind="Complex" note="Approvals bound to the exact plan by hash. Edited plans go stale, two approvers must differ, and anything undecided expires. The dispute letter can also be rejected with a reason, answered without running, or edited.">
          {queue && <ApprovalQueue title="Approvals waiting" items={queue} reviewer="raj" now={NOW_ISO} defaultSelected="q1" />}
        </Spec>
        <Spec name="DeadlineGantt" kind="Complex" note="Every deadline clock on one axis. Met, running, overdue and remedied come from the dates.">
          <DeadlineGantt title="Deadline clocks" rows={ganttRows} now={NOW_ISO} />
        </Spec>
        <Spec name="ActivityHeatmap" kind="Complex" note="Six months of activity, with the days a guarantee was breached marked in red.">
          <ActivityHeatmap title="Re-tests and incidents" days={heatDays} noun="events" />
        </Spec>
        <Spec name="EvalMatrix" kind="Complex" note="Pass rates with intervals and an exact paired comparison.">
          <EvalMatrix title="Re-test after model release" cases={cases} runs={[
            { label: 'Model X', results: allPass },
            { label: 'Model X.1', results: { ...allPass, c1: false, c3: false, c5: false, c6: false, c8: false, c9: false } },
            { label: 'Model Y', results: { ...allPass, c4: false } },
          ]} />
        </Spec>
        <Spec name="FleetBoard" kind="Complex" note="Sort, filter, tightest deadline computed.">
          <FleetBoard title="Deployments" now={NOW} rows={[
            { name: 'AP exceptions', model: 'model-x', status: 'ok', clocks: [{ label: 'Re-test after release', startedAt: '2026-06-09T06:00:00Z', deadlineHours: 48 }] },
            { name: 'Claims intake', model: 'model-x', status: 'breached', clocks: [{ label: 'Root cause for incident', startedAt: '2026-06-08T12:00:00Z', deadlineHours: 24 }] },
            { name: 'Referral triage', model: 'model-y', status: 'watch', clocks: [{ label: 'Re-test after release', startedAt: '2026-06-08T20:00:00Z', deadlineHours: 48 }] },
            { name: 'Renewals follow-up', model: 'model-y', status: 'ok', clocks: [] },
          ]} />
        </Spec>
        <Spec name="ChainGraph" kind="Complex" note="Hash chain. The break shows where trust stops.">
          <ChainGraph events={bad?.events} />
        </Spec>
        <Spec name="ReceiptCard" kind="Complex" note="Printable signed receipt for one action.">
          <ReceiptCard title="Payment held for review" issuedAt="2026-06-05T08:00:00Z" hash="09cfbff6cb9d1e3a7b2c4f80d5a6e1b39c7d02f4a8e5b6c1d3f70a92e4b8c615"
            rows={[{ label: 'Invoice', value: 'INV-2291, Northwind' }, { label: 'Amount', value: '$12,400.00' }, { label: 'Reason', value: 'Over the $5,000 approval limit' }, { label: 'Decision', value: 'Escalated to the controller' }]}
            signers={[{ party: 'meridian-ai', valid: true }, { party: 'northwind', valid: true }]} />
        </Spec>
      </div>

      <h2 id="group-Judgement">Judgement</h2>
      <div className="grid wide">
        <Spec name="AutonomyGate" kind="Judgement" note="Whether an agent has earned more autonomy. It counts agreement with a person, widens the interval for repeated looks and compares the lower bound with your rule.">
          <AutonomyGate title="Invoice agent, shadow period" tier="T2" cases={gateCases} rule={{ rate: 0.9, minCases: 30 }} looks={2} />
        </Spec>
        <Spec name="AutonomyGate-ready" kind="Judgement" note="With enough agreement the lower bound clears the rule. It says eligible, and a person still decides.">
          <AutonomyGate title="Invoice agent, six weeks on" tier="T2" cases={gateCasesReady} rule={{ rate: 0.9, minCases: 30 }} />
        </Spec>
        <Spec name="AutonomyGate-blocked" kind="Judgement" note="The total passes, but the dispute letters are a critical task at 50%, a control is missing and most approvals took two seconds. Each is named, and the verdict is to stay.">
          <AutonomyGate title="Invoice agent, all tasks" tier="T2" cases={gateCasesBlocked}
            rule={{ rate: 0.9, minCases: 30, critical: ['Dispute letters'], reviewFloor: { underMs: 5000, maxShare: 0.5 }, controls: [{ label: 'an incident process', done: false }, { label: 'monitoring', done: true }] }} />
        </Spec>
        <Spec name="EvidenceTable" kind="Judgement" note="Each value with where it was read from. Coverage and conflicts are counted from the sources, and there is no confidence score.">
          <EvidenceTable title="Invoice INV-2291, extracted values" rows={evidenceRows} />
        </Spec>
        <Spec name="EvidenceTable-checked" kind="Judgement" note="The same extraction, checked against the text of the documents. Each quote is looked up, and values the invoice contains that were never extracted are named.">
          <EvidenceTable title="Invoice INV-2291, checked against the documents" rows={evidenceRowsChecked} documents={evidenceDocs} available={evidenceAvailable} />
        </Spec>
        <Spec name="ApprovalChain" kind="Judgement" note="Who has to approve, in order, with a time limit on each step. The controller has approved, so it is waiting on the CFO.">
          <ApprovalChain title="Payment of $12,400.00" requester="agent" startedAt="2026-06-10T08:00:00Z" steps={chainSteps} decisions={chainDecisions} now={NOW_ISO} />
        </Spec>
        <Spec name="ApprovalChain-late" kind="Judgement" note="The requester's own approval does not count, and the step is late, so it says who it goes to.">
          <ApprovalChain title="Payment of $12,400.00, a day later" requester="agent" startedAt="2026-06-10T08:00:00Z" steps={chainSteps} decisions={lateChainDecisions} now="2026-06-10T13:00:00Z" />
        </Spec>
        <Spec name="HandoffPacket" kind="Judgement" note="What the agent handed over when it stopped. Complete, so a person can act without asking it anything.">
          <HandoffPacket title="Invoice INV-2291, handed to a person" handoff={handoffFull} now={NOW_ISO} />
        </Spec>
        <Spec name="HandoffPacket-incomplete" kind="Judgement" note="The same check on a thin handoff. Every missing part is named.">
          <HandoffPacket title="Dispute letter, handed to a person" handoff={handoffThin} now={NOW_ISO} />
        </Spec>
        <Spec name="PermissionGrant" kind="Judgement" note="What the agent may do. The email grant is over its limit, the bank-update grant ends tonight, and the revoked wire grant is shown last, so nothing relies on the agent describing its own access.">
          <PermissionGrant title="Invoice agent, permissions" grants={grantRows} now={NOW_ISO} />
        </Spec>
        <Spec name="BudgetMeter" kind="Judgement" note="Spend against a limit. The marker is how much of the month has gone. Used so far is ahead of it, so at the recent rate the limit is reached before the month ends.">
          <BudgetMeter title="Model and tool spend, June" limit={1500} used={860} unit="USD" periodStart="2026-06-01T00:00:00Z" periodEnd="2026-07-01T00:00:00Z" samples={budgetSamples} now="2026-06-10T00:00:00Z" />
        </Spec>
        <Spec name="InputRequest" kind="Judgement" note="A form the agent hands to a person when it needs something it does not have. Try sending it empty: each answer is checked against the field it was asked for.">
          <InputRequest title="Confirm the refund" asked="The invoice was paid twice, and I cannot tell which payment to reverse." context={[{ label: 'Invoice', value: 'INV-2291' }, { label: 'Paid', value: '$12,400.00 twice' }]}
            fields={[
              { name: 'payment', label: 'Payment to reverse', type: 'select', required: true, options: ['10 Jun, bank transfer', '12 Jun, card'] },
              { name: 'amount', label: 'Amount to refund', type: 'currency', required: true, min: 1, max: 12400, help: 'In US dollars.' },
              { name: 'notify', label: 'Tell the vendor', type: 'checkbox', default: true },
              { name: 'note', label: 'Note for the record', type: 'textarea' },
            ]} onDecline={() => {}} />
        </Spec>
        <Spec name="InputRequest-elicitation" kind="Judgement" note="A request in the shape an MCP server sends. The schema is read into fields, the password it also asked for is refused, and a link is offered with the site named. The answer goes back as accept, decline or cancel.">
          <InputRequest title="Connect the billing account" from="billing-server" asked="I need to know which account to bill. For the sign-in, use the link."
            fields={[...fieldsFromJsonSchema({ type: 'object', required: ['account', 'email'], properties: {
              account: { type: 'string', title: 'Billing account', oneOf: [{ const: 'northwind-us', title: 'Northwind US' }, { const: 'northwind-uk', title: 'Northwind UK' }] },
              email: { type: 'string', title: 'Contact email', format: 'email' },
              seats: { type: 'integer', title: 'Seats', minimum: 1, maximum: 500 },
              password: { type: 'string', title: 'Account password' },
            } }).fields]}
            link={{ url: 'https://billing.example.com/connect', label: 'Sign in' }} onDecline={() => {}} onCancel={() => {}} />
        </Spec>
        <Spec name="PlanVsActual" kind="Judgement" note="What the agent planned next to what it did. Skipped, failed, blocked, late and unplanned steps are found by comparing the two lists.">
          <PlanVsActual title="Invoice run, plan against actual" plan={planSteps} actual={actualSteps} />
        </Spec>
      </div>

      <h2 id="group-Workspace">Workspace</h2>
      <div className="grid wide">
        <Spec name="ApprovalWorkspace" kind="Workspace" note="The queue with, for the request you are looking at, who has to approve, where the values came from and what the agent handed over. A tab appears only when the request has that part.">
          {queue && <ApprovalWorkspace title="Approvals waiting" items={queue.map((q) => ({ queue: q, ...(workspaceExtras[q.id] ?? {}) }))} reviewer="raj" now={NOW_ISO} />}
        </Spec>
        <Spec name="AutonomyBoard" kind="Workspace" note="Every agent in one list. The invoice agent has agreed with a person often enough to be eligible, but its email grant is over the limit and its spend is ahead of pace, so it sorts first. Eligible is a prompt for a person, not a promotion.">
          <AutonomyBoard title="Agents in production" agents={fleetAgents} now="2026-06-10T12:00:00Z" />
        </Spec>
        <Spec name="RecordViewer" kind="Workspace" note="One record on one page: the verdict, each guarantee against what the verifier found, the signed events and the hash chain. It can save the verifier's output.">
          <RecordViewer title="Engagement record" result={good} manifest={record.manifest} />
        </Spec>
        <Spec name="RecordViewer-tampered" kind="Workspace" note="One event edited after signing. The page names it, and does not call the record verified.">
          <RecordViewer title="Engagement record, after an edit" result={bad} manifest={record.manifest} />
        </Spec>
        <Spec name="RunInspector" kind="Workspace" note="One run in four views. The four questions are answered first from the spans, the plan and the evidence, and each opens the view that backs it up.">
          <RunInspector title="Invoice INV-2291, run 8f3a" spans={traceSpans} plan={planSteps} actual={actualSteps} evidence={evidenceRows} />
        </Spec>
      </div>

      <h2 id="group-OpenUI">OpenUI</h2>
      <div className="grid wide">
        <Spec name="OpenUI" kind="OpenUI" note="A model-written reply. It can place VerifyStatus and pick a trace or a Sankey by id, but cannot set what they say.">
          <RecordProvider result={good} manifest={record.manifest}>
            <SourcesProvider sources={{ sankeys: { invoices: { nodes: sankeyNodes, links: sankeyLinks, unit: 'invoices' } } }}>
              <Renderer library={library} isStreaming={false} response={
                'root = Reply([Funnel("How many make it through", "deals", [FunnelStep("Signed", 40), FunnelStep("Set up", 31), FunnelStep("Kickoff held", 22)]), Sankey("invoices", "Where this month\'s invoices went"), VerifyStatus(), GuaranteeCard("G2-RETEST-48H")])'
              } />
            </SourcesProvider>
          </RecordProvider>
        </Spec>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
