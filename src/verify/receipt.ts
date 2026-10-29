import { canonical, sha256Hex } from './canonical.js'

/**
 * A view receipt says what a person was shown: which component, which of your records, and the hash of the exact data
 * drawn. Signed and put in the ledger, it answers the question an approval alone cannot: what did the reviewer see when
 * they decided. Change one value of the data and the hash no longer matches.
 */
export type ViewReceipt = {
  schema: 'orlune.view.v1'
  component: string
  kind: string
  source: string
  /** SHA-256 of the canonical JSON of the data that was drawn. */
  dataHash: string
  /** Who it was shown to. */
  by: string
  shownAt: string
  /** The plan hash the reviewer was looking at, when the view was part of an approval. */
  planHash?: string
}

export type SignedViewReceipt = { receipt: ViewReceipt; sig: string }

export async function createViewReceipt(i: { component: string; kind: string; source: string; data: unknown; by: string; at?: Date; planHash?: string }): Promise<ViewReceipt> {
  return {
    schema: 'orlune.view.v1',
    component: i.component,
    kind: i.kind,
    source: i.source,
    dataHash: await sha256Hex(canonical(i.data)),
    by: i.by,
    shownAt: (i.at ?? new Date()).toISOString(),
    ...(i.planHash ? { planHash: i.planHash } : {}),
  }
}

const enc = new TextEncoder()
const toB64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const fromB64 = (b64: string) => Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0))

/** Import an Ed25519 private key from a PKCS8 PEM. Signing belongs on your server, never in the page a reviewer opens. */
export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
  return crypto.subtle.importKey('pkcs8', fromB64(body), { name: 'Ed25519' }, false, ['sign'])
}

/** Sign a receipt with an Ed25519 key. The signature covers the canonical JSON of the receipt. */
export async function signViewReceipt(receipt: ViewReceipt, key: CryptoKey): Promise<SignedViewReceipt> {
  return { receipt, sig: toB64(await crypto.subtle.sign({ name: 'Ed25519' }, key, enc.encode(canonical(receipt)))) }
}

export type ViewVerdict = {
  /** The signature is valid for this receipt and this key. */
  signatureValid: boolean
  /** Only set when you pass the data as it is now: whether it is the same data the reviewer was shown. */
  dataMatches?: boolean
}

/** Checks a signed receipt offline. Pass `data` (what your store holds now) to learn whether it still matches what was shown. */
export async function verifyViewReceipt(signed: SignedViewReceipt, publicKey: CryptoKey, data?: unknown): Promise<ViewVerdict> {
  let signatureValid = false
  try {
    signatureValid = await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, fromB64(signed.sig), enc.encode(canonical(signed.receipt)))
  } catch {
    signatureValid = false
  }
  return data === undefined ? { signatureValid } : { signatureValid, dataMatches: (await sha256Hex(canonical(data))) === signed.receipt.dataHash }
}

/** The hash of what a reviewer sees in an approval, so a decision can say it was made on exactly this. */
export const viewDigest = (shown: unknown): Promise<string> => sha256Hex(canonical(shown))
