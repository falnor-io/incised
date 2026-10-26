'use client'

import type { VerifyResult } from '../verify/types.js'
import { useRecordResult } from './RecordContext.js'
import { VerifyStatus } from './VerifyStatus.js'
import { summarizeRecord } from './recordview.js'
import { cx } from './util.js'

/**
 * A small mark that says whether a record checked out, and opens to the full result. It fits inside a table row or a
 * header. It shows "Verified" only when the verifier's verdict and its own details agree, and says "Not verified" when it
 * has no result, never a tick it was not given.
 */
export function VerifyBadge({ result, className }: { result?: VerifyResult | null; className?: string }) {
  const fromContext = useRecordResult()
  const r = result ?? fromContext
  const s = r ? summarizeRecord(r) : null
  const tone = !s ? undefined : s.trust === 'verified' ? 'good' : s.trust === 'unknown-signer' ? 'warn' : 'bad'
  const word = !s ? 'Not verified' : s.trust === 'verified' ? 'Verified' : s.trust === 'unknown-signer' ? 'Valid, unknown signer' : s.trust === 'inconsistent' ? 'Do not rely on this' : 'Failed'
  return (
    <details className={cx('ol', 'ol-badge', className)}>
      <summary><span className="ol-pill" data-tone={tone}>{word}</span></summary>
      <VerifyStatus result={r} />
    </details>
  )
}
