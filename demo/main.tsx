import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Renderer } from '@openuidev/react-lang'
import {
  AgentTrace, ApprovalFlow, ApprovalGate, Bottlenecks, ChainGraph, Compare, ConfidenceBar, EvalMatrix, EvidenceDiff, FleetBoard,
  Funnel, GuaranteeCard, LedgerTimeline, Priority, ReceiptCard, RecordProvider, RetestClock, Swimlane, Trail, VerifyStatus,
} from '../src/index.js'
import { buildIncisedLibrary } from '../src/openui/index.js'
import { verifyRecord, type RecordBundle, type VerifyResult } from '../src/verify/index.js'
import '../src/styles.css'
import sample from './sample-record.json'

const NOW = new Date('2026-06-10T00:00:00Z')
const record = sample as unknown as RecordBundle
const library = buildIncisedLibrary()

function Spec({ name, kind, note, children }: { name: string; kind: 'Workflow' | 'Record' | 'Complex' | 'OpenUI'; note: string; children: ReactNode }) {
  return (
    <figure className="spec" data-name={name} id={name.toLowerCase()}>
      <figcaption>
        <strong>{name.replace('-tampered', ' (tampered record)')}</strong>
        <span className="tag">{kind}</span>
        <span className="note">{note}</span>
      </figcaption>
      <div className="spec-body">{children}</div>
    </figure>
  )
}

const cases = ['Duplicate invoice', 'Missing PO number', 'Vendor name mismatch', 'Over approval limit', 'Currency conversion', 'Late-fee dispute', 'Split shipment', 'Tax ID missing', 'Credit note', 'Rush payment'].map((label, i) => ({ id: `c${i}`, label }))
const allPass = Object.fromEntries(cases.map((c) => [c.id, true]))

function App() {
  const [good, setGood] = useState<VerifyResult | null>(null)
  const [bad, setBad] = useState<VerifyResult | null>(null)

  useEffect(() => {
    verifyRecord(record, { now: NOW }).then(setGood)
    const edited = structuredClone(record)
    edited.ledger[3]!.result = 'fail'
    verifyRecord(edited, { now: NOW }).then(setBad)
  }, [])

  return (
    <main>
      <h1>incised</h1>
      <p className="lede">Components for agents that put it in writing. Verification below is computed in your browser from a signed record and public keys. The “tampered” specimens use the same record with one ledger event edited.</p>
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
        <Spec name="AgentTrace" kind="Complex" note="Collapsible waterfall. Totals computed from spans.">
          <AgentTrace title="Invoice exception run" spans={[
            { id: 'run', name: 'Handle invoice INV-2291', kind: 'llm', startMs: 0, durationMs: 4200, status: 'ok' },
            { id: 'plan', parentId: 'run', name: 'Plan next steps', kind: 'llm', startMs: 0, durationMs: 900, status: 'ok' },
            { id: 'po', parentId: 'run', name: 'Look up purchase order', kind: 'retrieval', startMs: 900, durationMs: 650, status: 'ok' },
            { id: 'erp', parentId: 'run', name: 'Fetch vendor from ERP', kind: 'tool', startMs: 1550, durationMs: 1400, status: 'error', detail: 'ERP timed out after 1.4s, retried once.' },
            { id: 'retry', parentId: 'erp', name: 'Retry fetch', kind: 'tool', startMs: 2950, durationMs: 420, status: 'ok' },
            { id: 'gate', parentId: 'run', name: 'Payment over limit', kind: 'gate', startMs: 3370, durationMs: 60, status: 'blocked', detail: 'Held for controller approval.' },
            { id: 'human', parentId: 'run', name: 'Controller review', kind: 'human', startMs: 3430, durationMs: 770, status: 'ok' },
          ]} />
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
        <Spec name="EvidenceDiff" kind="Complex" note="What changed in a policy, prompt or output.">
          <EvidenceDiff title="Approval policy v3 to v4" beforeLabel="v3" afterLabel="v4"
            before={'Approve invoices under $500 automatically.\nEscalate duplicates to the controller.\nHold anything from a new vendor.\nLog every decision.'}
            after={'Approve invoices under $200 automatically.\nEscalate duplicates and mismatched totals to the controller.\nHold anything from a new vendor.\nLog every decision.\nRe-test after every model release.'} />
        </Spec>
        <Spec name="ApprovalFlow" kind="Complex" note="Layered diagram with gates and progress.">
          <ApprovalFlow title="Payment approval" completed={['in', 'match']} active="limit"
            nodes={[
              { id: 'in', label: 'Invoice in', kind: 'step' },
              { id: 'match', label: 'Match to PO', kind: 'step' },
              { id: 'limit', label: 'Over limit?', kind: 'gate' },
              { id: 'ctrl', label: 'Controller', kind: 'step' },
              { id: 'pay', label: 'Pay', kind: 'end' },
              { id: 'hold', label: 'Hold', kind: 'end' },
            ]}
            edges={[
              { from: 'in', to: 'match' }, { from: 'match', to: 'limit' },
              { from: 'limit', to: 'pay', label: 'no' }, { from: 'limit', to: 'ctrl', label: 'yes' },
              { from: 'ctrl', to: 'pay', label: 'approved' }, { from: 'ctrl', to: 'hold', label: 'declined' },
            ]} />
        </Spec>
        <Spec name="ChainGraph" kind="Complex" note="Hash chain. The break shows where trust stops.">
          <ChainGraph events={bad?.events} />
        </Spec>
        <Spec name="ReceiptCard" kind="Complex" note="Printable signed receipt for one action.">
          <ReceiptCard title="Payment held for review" issuedAt="2026-06-05T08:00:00Z" hash="09cfbff6cb9d1e3a7b2c4f80d5a6e1b39c7d02f4a8e5b6c1d3f70a92e4b8c615"
            rows={[{ label: 'Invoice', value: 'INV-2291, Northwind' }, { label: 'Amount', value: '$12,400.00' }, { label: 'Reason', value: 'Over the $5,000 approval limit' }, { label: 'Decision', value: 'Escalated to the controller' }]}
            signers={[{ party: 'acme-agents', valid: true }, { party: 'northwind', valid: true }]} />
        </Spec>
      </div>

      <h2 id="group-OpenUI">OpenUI</h2>
      <div className="grid wide">
        <Spec name="OpenUI" kind="OpenUI" note="A model-written reply. It can place VerifyStatus but cannot set what it says.">
          <RecordProvider result={good} manifest={record.manifest}>
            <Renderer library={library} isStreaming={false} response={
              'root = Reply([Funnel("How many make it through", "deals", [FunnelStep("Signed", 40), FunnelStep("Set up", 31), FunnelStep("Kickoff held", 22)]), VerifyStatus(), GuaranteeCard("G2-RETEST-48H")])'
            } />
          </RecordProvider>
        </Spec>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
