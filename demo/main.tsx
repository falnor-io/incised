import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ApprovalGate, Bottlenecks, Compare, ConfidenceBar, Funnel, GuaranteeCard, LedgerTimeline, Priority, RecordProvider,
  RetestClock, Swimlane, Trail, VerifyStatus,
} from '../src/index.js'
import { verifyRecord, type RecordBundle, type VerifyResult } from '../src/verify/index.js'
import '../src/styles.css'
import sample from './sample-record.json'

const NOW = new Date('2026-06-10T00:00:00Z')

function App() {
  const [tampered, setTampered] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)

  useEffect(() => {
    const record = structuredClone(sample) as unknown as RecordBundle
    // Flip the re-test result on event #4, the same edit a bad actor would make.
    if (tampered) record.ledger[3]!.result = 'fail'
    verifyRecord(record, { now: NOW }).then(setResult)
  }, [tampered])

  const manifest = (sample as unknown as RecordBundle).manifest
  return (
    <main>
      <h1>incised</h1>
      <p className="lede">Components for agents that put it in writing. Everything below is computed in your browser from a signed record and public keys.</p>

      <h2>Record</h2>
      <div className="bar">
        <button onClick={() => setTampered((t) => !t)} aria-pressed={tampered}>
          {tampered ? 'Undo the edit' : 'Edit event #4: change the re-test from pass to fail'}
        </button>
      </div>
      <RecordProvider result={result} manifest={manifest}>
        <div className="stack">
          <VerifyStatus />
          <LedgerTimeline />
          <div className="two">
            {manifest.guarantees.slice(1, 3).map((g) => {
              const r = result?.guarantees.find((x) => x.id === g.id)
              return <GuaranteeCard key={g.id} {...g} status={r?.status ?? 'pending'} detail={r?.detail} />
            })}
          </div>
          <div className="two">
            <RetestClock label="Re-test after model release #3" startedAt="2026-06-03T00:00:00Z" resolvedAt="2026-06-04T06:00:00Z" deadlineHours={48} result="pass" />
            <RetestClock label="Root cause after incident #5" startedAt="2026-06-05T08:00:00Z" resolvedAt="2026-06-06T20:00:00Z" deadlineHours={24} remedied />
          </div>
          <div className="two">
            <ConfidenceBar label="Exception routing accuracy (45 of 50 cases)" passes={45} n={50} threshold={0.9} />
            <ConfidenceBar label="Same, 900 of 1000 cases" passes={900} n={1000} threshold={0.85} />
          </div>
          <ApprovalGate action="Release payment over the approval limit" approver="Controller" state="escalated" note="The agent held the payment and asked a person." />
        </div>
      </RecordProvider>

      <h2>Workflow</h2>
      <div className="stack">
        <Swimlane title="Client onboarding: who does what" lanes={[
          { owner: 'Sales', steps: [{ name: 'Proposal signed' }, { name: 'Handoff email', waiting: true }] },
          { owner: 'Operations', steps: [{ name: 'Project set up', waiting: true }, { name: 'Kickoff booked' }] },
        ]} />
        <Trail title="Where one request waits" request="Referral 1042" stops={[
          { owner: 'Front desk', name: 'Referral received', note: 'Logged in the inbox', waitDays: 0 },
          { owner: 'Doctor', name: 'Sign-off', note: 'Waits for the next clinic day', waitDays: 3 },
          { owner: 'Admin', name: 'Letter sent', note: 'Printed and posted', waitDays: 1 },
          { owner: 'Patient', name: 'Appointment booked', note: 'Phone tag', waitDays: 2 },
        ]} />
        <div className="two">
          <Bottlenecks title="Where work waits most" unit="days" items={[{ stage: 'Handoff', amount: 2 }, { stage: 'Set up', amount: 3 }, { stage: 'Kickoff', amount: 2 }]} />
          <Funnel title="How many make it through" unit="deals" steps={[{ label: 'Signed', value: 40 }, { label: 'Set up', value: 31 }, { label: 'Kickoff held', value: 22 }]} />
        </div>
        <Priority title="Where to start" items={[
          { label: 'Handoff to operations', impact: 'high', effort: 'low' },
          { label: 'Project set up', impact: 'high', effort: 'high' },
          { label: 'Kickoff booked', impact: 'low', effort: 'low' },
        ]} />
        <Compare title="Who holds the handoff" leftLabel="Today" rightLabel="Mapped" rows={[
          { label: 'Owner', left: 'Whoever sees the email', right: 'One named person' },
          { label: 'Written down', left: "In people's heads", right: 'In the workflow' },
        ]} />
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
