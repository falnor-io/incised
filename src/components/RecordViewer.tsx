'use client'

import { useId, useMemo, useState } from 'react'
import type { Manifest, VerifyResult } from '../verify/types.js'
import { ChainGraph } from './ChainGraph.js'
import { GuaranteeCard } from './GuaranteeCard.js'
import { LedgerTimeline } from './LedgerTimeline.js'
import { joinGuarantees, recordExport, summarizeRecord } from './recordview.js'
import { VerifyStatus } from './VerifyStatus.js'
import { ViewReceiptCard } from './ViewReceiptCard.js'
import type { ViewReceiptRow } from './viewreceipt.js'
import { cx } from './util.js'

export type RecordViewerProps = {
  title: string
  /** What `verifyRecord` returned. Without one the viewer says "Not verified". */
  result: VerifyResult | null
  manifest?: Manifest | null
  /** Receipts of what people were shown, each with the result of `verifyViewReceipt`. Adds a Views tab. */
  receipts?: ViewReceiptRow[]
  className?: string
}

type Tab = 'guarantees' | 'ledger' | 'chain' | 'views'

/**
 * One record on one page: the verifier's verdict, each guarantee against what was found, the signed events and the
 * hash chain. It renders only what the verifier returned, and shows a record as verified only when the verdict and
 * its own details agree. The export is the verifier's output, not a new signature.
 */
export function RecordViewer({ title, result, manifest = null, receipts, className }: RecordViewerProps) {
  const [tab, setTab] = useState<Tab>('guarantees')
  const base = useId()
  const summary = useMemo(() => (result ? summarizeRecord(result) : null), [result])
  const lines = useMemo(() => (result ? joinGuarantees(manifest, result.guarantees) : []), [manifest, result])
  if (!result || !summary) {
    return (
      <section role="group" className={cx('ol', className)} aria-label={title}>
        <div className="ol-head-row"><h3 className="ol-title">{title}</h3></div>
        <VerifyStatus result={null} />
      </section>
    )
  }
  const tabs: [Tab, string][] = [['guarantees', `Guarantees (${lines.length})`], ['ledger', `Ledger (${result.events.length})`], ['chain', 'Chain'], ...(receipts?.length ? [['views', `Views (${receipts.length})`] as [Tab, string]] : [])]
  const save = () => {
    const url = URL.createObjectURL(new Blob([recordExport(result, manifest)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.engagement.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'record'}-verification.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <button type="button" className="ol-tab ol-export" onClick={save}>Save verifier output</button>
      </div>
      <div className="ol-recordtop" data-trust={summary.trust}>
        <span className="ol-pill" data-tone={summary.trust === 'verified' ? 'good' : summary.trust === 'unknown-signer' ? 'warn' : 'bad'}>
          {summary.trust === 'verified' ? 'Verified' : summary.trust === 'unknown-signer' ? 'Valid, unknown signer' : summary.trust === 'inconsistent' ? 'Do not rely on this' : 'Failed'}
        </span>
        <p>{summary.text}</p>
      </div>
      <div className="ol-tabs" role="tablist" aria-label="Record views">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`${base}-t-${id}`} className="ol-tab" aria-selected={tab === id} aria-controls={`${base}-p-${id}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-p-${tab}`} aria-labelledby={`${base}-t-${tab}`} className="ol-runpanel">
        {tab === 'guarantees' && (
          <div className="ol-recordlist">
            {lines.length === 0 && <p className="ol-sub">This record makes no guarantees.</p>}
            {lines.map((g) => <GuaranteeCard key={g.id} {...g} />)}
          </div>
        )}
        {tab === 'ledger' && <LedgerTimeline events={result.events} />}
        {tab === 'chain' && <ChainGraph events={result.events} />}
        {tab === 'views' && receipts && (
          <div className="ol-recordlist">
            {receipts.map((r) => <ViewReceiptCard key={`${r.receipt.kind}/${r.receipt.source}/${r.receipt.shownAt}/${r.receipt.by}`} {...r} />)}
          </div>
        )}
      </div>
    </section>
  )
}
