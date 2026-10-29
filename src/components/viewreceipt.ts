import type { ViewReceipt } from '../verify/receipt.js'

/** A receipt and what the host found when it checked it with `verifyViewReceipt`. Unset means it was not checked. */
export type ViewReceiptRow = { receipt: ViewReceipt; signatureValid?: boolean; dataMatches?: boolean }

export type ViewJudgement = { tone: 'good' | 'warn' | 'bad' | undefined; word: string; text: string }

/**
 * What a receipt amounts to. Only a valid signature on data that still matches is "unchanged"; a receipt nobody checked
 * says so, and never reads as a pass.
 */
export function judgeView(row: ViewReceiptRow): ViewJudgement {
  if (row.signatureValid === false) return { tone: 'bad', word: 'Signature invalid', text: 'This receipt was changed or signed with another key. Do not rely on it.' }
  if (row.signatureValid === undefined) return { tone: undefined, word: 'Not checked', text: 'Nobody has checked this receipt yet.' }
  if (row.dataMatches === false) return { tone: 'bad', word: 'Data has changed', text: 'The data now differs from what was shown. The decision was made on something else.' }
  if (row.dataMatches === true) return { tone: 'good', word: 'Shown and unchanged', text: `Shown to ${row.receipt.by}, and the data is the same now.` }
  return { tone: 'warn', word: 'Signed, not compared', text: 'The signature is valid. The data has not been compared with what is held now.' }
}
