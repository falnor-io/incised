import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Manifest, VerifyResult } from '../verify/types.js'

type RecordValue = { result: VerifyResult | null; manifest: Manifest | null }
const RecordContext = createContext<RecordValue>({ result: null, manifest: null })

/**
 * Hands a verifier result (and optionally the manifest) to the record components below it. The OpenUI
 * versions of VerifyStatus, LedgerTimeline and GuaranteeCard read from here and cannot be given a result,
 * so a model can place them but cannot write what they say.
 */
export function RecordProvider({ result, manifest = null, children }: { result: VerifyResult | null; manifest?: Manifest | null; children: ReactNode }) {
  const value = useMemo(() => ({ result, manifest }), [result, manifest])
  return <RecordContext.Provider value={value}>{children}</RecordContext.Provider>
}

export function useRecordResult(): VerifyResult | null {
  return useContext(RecordContext).result
}

export function useRecordManifest(): Manifest | null {
  return useContext(RecordContext).manifest
}
