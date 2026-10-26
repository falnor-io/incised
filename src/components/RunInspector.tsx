'use client'

import { useId, useMemo, useState } from 'react'
import { EvidenceTable } from './EvidenceTable.js'
import { judgeEvidence, type EvidenceRow } from './evidence.js'
import { alignPlan, type ActualStep, type PlanStep } from './planactual.js'
import { PlanVsActual } from './PlanVsActual.js'
import { summarizeRun } from './run.js'
import { TraceExplorer } from './TraceExplorer.js'
import type { Span } from './trace.js'
import { cx, formatHours, pct } from './util.js'

export type RunInspectorProps = {
  title: string
  spans: Span[]
  /** With `actual`, adds the plan tab. */
  plan?: PlanStep[]
  actual?: ActualStep[]
  /** Adds the evidence tab. */
  evidence?: EvidenceRow[]
  className?: string
}

type Tab = 'trace' | 'plan' | 'evidence' | 'cost'
const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`)
const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`)

/**
 * One agent run, seen four ways, with the four questions people ask of a run answered first: did it finish, did it
 * follow the plan, were the tool calls sound, and does each value have a source. Every answer is worked out from the
 * spans, the plan and the evidence you pass in.
 */
export function RunInspector({ title, spans, plan, actual, evidence, className }: RunInspectorProps) {
  const run = useMemo(() => summarizeRun(spans), [spans])
  const path = useMemo(() => (plan && actual ? alignPlan(plan, actual) : null), [plan, actual])
  const proof = useMemo(() => (evidence ? judgeEvidence(evidence) : null), [evidence])
  const tabs: [Tab, string][] = [['trace', 'Trace'], ...(path ? [['plan', 'Plan'] as [Tab, string]] : []), ...(proof ? [['evidence', 'Evidence'] as [Tab, string]] : []), ['cost', 'Cost']]
  const [tab, setTab] = useState<Tab>('trace')
  const base = useId()

  const finishedTone = run.outcome === 'finished' ? 'good' : run.outcome === 'empty' ? undefined : run.outcome === 'finished-with-errors' || run.outcome === 'stopped' ? 'warn' : 'bad'
  const facts: { tab: Tab; q: string; a: string; tone?: 'good' | 'warn' | 'bad' }[] = [
    { tab: 'trace', q: 'Did it finish', a: run.outcomeText, tone: finishedTone },
    ...(path ? [{ tab: 'plan' as Tab, q: 'Did it follow the plan', a: path.summary, tone: path.counts.asPlanned === path.counts.planned && !path.counts.extra ? ('good' as const) : ('warn' as const) }] : []),
    { tab: 'trace', q: 'Were the tool calls sound', a: run.toolCalls === 0 ? 'No tool calls.' : `${run.toolCalls - run.toolFailures} of ${run.toolCalls} tool calls succeeded.`, tone: run.toolFailures ? ('warn' as const) : ('good' as const) },
    ...(proof ? [{ tab: 'evidence' as Tab, q: 'Is every value sourced', a: proof.summary.text + '.', tone: proof.summary.conflicts ? ('bad' as const) : proof.summary.unsourced ? ('warn' as const) : ('good' as const) }] : []),
  ]

  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-sub ol-mono">{secs(run.durationMs)} · {run.spans} spans · {usd(run.costUsd)}</span>
      </div>
      <ul className="ol-runfacts">
        {facts.map((f) => (
          <li key={f.q}>
            <button type="button" className="ol-runfact" data-tone={f.tone} aria-label={`${f.q}. ${f.a} Open the ${f.tab} tab.`} onClick={() => setTab(f.tab)}>
              <span className="ol-sub">{f.q}</span>
              <span>{f.a}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="ol-tabs" role="tablist" aria-label="Run views">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`${base}-t-${id}`} className="ol-tab" aria-selected={tab === id} aria-controls={`${base}-p-${id}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-p-${tab}`} aria-labelledby={`${base}-t-${tab}`} className="ol-runpanel">
        {tab === 'trace' && <TraceExplorer title="Trace" spans={spans} />}
        {tab === 'plan' && path && plan && actual && <PlanVsActual title="Plan against actual" plan={plan} actual={actual} />}
        {tab === 'evidence' && evidence && <EvidenceTable title="Values and their sources" rows={evidence} />}
        {tab === 'cost' && (
          <div>
            <div className="ol-figs">
              <span><b>{usd(run.costUsd)}</b> <span className="ol-sub">total</span></span>
              <span><b>{(run.tokensIn + run.tokensOut).toLocaleString('en-US')}</b> <span className="ol-sub">tokens</span></span>
              <span><b>{formatHours(run.humanMs / 3_600_000)}</b> <span className="ol-sub">waiting on people</span></span>
            </div>
            <table className="ol-table">
              <thead><tr><th>Kind</th><th>Spans</th><th>Share of time</th><th>Tokens</th><th>Cost</th></tr></thead>
              <tbody>
                {run.byKind.map((k) => (
                  <tr key={k.kind}><td>{k.kind}</td><td className="ol-num">{k.count}</td><td className="ol-num">{pct(k.share, 0)}</td><td className="ol-num">{(k.tokensIn + k.tokensOut).toLocaleString('en-US')}</td><td className="ol-num">{usd(k.costUsd)}</td></tr>
                ))}
              </tbody>
            </table>
            {run.costliest.length > 0 && (
              <div className="ol-gatelist">
                <p className="ol-sub">Most expensive</p>
                <ul>{run.costliest.map((s) => <li key={s.id}><span>{s.name}</span><span className="ol-mono">{usd(s.costUsd ?? 0)}</span></li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
