/** Canonical JSON with sorted keys, so hashes are stable across writers. Matches the guarantee registry. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const encoder = new TextEncoder()

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Import an Ed25519 public key from a PEM (SPKI) string. */
export async function importPublicKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
  return crypto.subtle.importKey('spki', base64ToBytes(body), { name: 'Ed25519' }, false, ['verify'])
}

export async function verifyEd25519(key: CryptoKey, text: string, sigB64: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, base64ToBytes(sigB64), encoder.encode(text))
  } catch {
    return false
  }
}
