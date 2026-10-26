import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { verifyRecord, clopperPearson, zeroFailureUpperBound } from '../src/verify/index.js'
import type { RecordBundle } from '../src/verify/index.js'

const load = (): RecordBundle => JSON.parse(readFileSync(new URL('../demo/sample-record.json', import.meta.url), 'utf8'))
const NOW = new Date('2026-06-10T00:00:00Z')

describe('verifyRecord', () => {
  it('passes a breached-then-remedied record', async () => {
    const r = await verifyRecord(load(), { now: NOW })
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.ledger).toEqual({ events: 7, intact: true })
    expect(r.signatures.every((s) => s.valid)).toBe(true)
    const g3 = r.guarantees.find((g) => g.id === 'G3-ROOTCAUSE-24H')
    expect(g3?.status).toBe('remedied')
    expect(r.guarantees.find((g) => g.id === 'G2-RETEST-48H')?.status).toBe('honored')
  })

  it('detects an edited ledger event', async () => {
    const rec = load()
    rec.ledger[3]!.result = 'fail'
    const r = await verifyRecord(rec, { now: NOW })
    expect(r.ok).toBe(false)
    expect(r.ledger.intact).toBe(false)
    expect(r.events[3]!.signatureValid).toBe(false)
    expect(r.events[4]!.chainValid).toBe(false)
  })

  it('detects a deleted event', async () => {
    const rec = load()
    rec.ledger.splice(2, 1)
    const r = await verifyRecord(rec, { now: NOW })
    expect(r.ok).toBe(false)
    expect(r.ledger.intact).toBe(false)
  })

  it('detects an edited manifest', async () => {
    const rec = load()
    rec.manifest.guarantees[1]!.remedy = 'None.'
    const r = await verifyRecord(rec, { now: NOW })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/Manifest has been modified/)
    expect(r.signatures.every((s) => s.valid)).toBe(true)
  })

  it('fails when a breach has no remedy', async () => {
    const rec = load()
    rec.ledger.pop()
    const r = await verifyRecord(rec, { now: NOW })
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(false)
    expect(r.guarantees.find((g) => g.id === 'G3-ROOTCAUSE-24H')?.remedyOutstanding).toBe(true)
  })

  it('fails when a party has not signed', async () => {
    const rec = load()
    delete rec.signatures.signatures['northwind']
    const r = await verifyRecord(rec, { now: NOW })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/not signed by northwind/)
  })

  it('marks an overdue open re-test as breached', async () => {
    const rec = load()
    rec.ledger = rec.ledger.slice(0, 3)
    const r = await verifyRecord(rec, { now: new Date('2026-06-10T00:00:00Z') })
    expect(r.guarantees.find((g) => g.id === 'G2-RETEST-48H')?.status).toBe('breached')
    const soon = await verifyRecord(rec, { now: new Date('2026-06-04T00:00:00Z') })
    expect(soon.guarantees.find((g) => g.id === 'G2-RETEST-48H')?.status).toBe('pending')
  })
})

describe('stats', () => {
  it('matches known Clopper-Pearson values', () => {
    const { lower, upper } = clopperPearson(45, 50, 0.95)
    expect(lower).toBeCloseTo(0.7819, 3)
    expect(upper).toBeCloseTo(0.9667, 3)
  })
  it('handles the edges', () => {
    expect(clopperPearson(0, 20).lower).toBe(0)
    expect(clopperPearson(20, 20).upper).toBe(1)
    expect(zeroFailureUpperBound(50)).toBeCloseTo(0.0582, 3)
  })
  it('rejects invalid counts', () => {
    expect(() => clopperPearson(5, 4)).toThrow(RangeError)
    expect(() => clopperPearson(1, 0)).toThrow(RangeError)
  })
})

import { keyFingerprint } from '../src/verify/index.js'
import { summarizeRecord } from '../src/components/recordview.js'

describe('valid is not trusted', () => {
  it('checks only validity when no list is given, and still names each key', async () => {
    const r = await verifyRecord(load(), { now: NOW })
    expect(r.trust).toBe('not-checked')
    expect(r.signatures.every((s) => s.trusted === undefined && /^[0-9a-f]{16}$/.test(s.keyId!))).toBe(true)
    expect(summarizeRecord(r).trust).toBe('verified')
  })
  it('is trusted when every signing key is on the list', async () => {
    const rec = load()
    const all = await Promise.all(Object.values(rec.publicKeys).map(keyFingerprint))
    const r = await verifyRecord(rec, { now: NOW, trustedKeys: all })
    expect(r.trust).toBe('trusted')
    expect(r.signatures.every((s) => s.trusted === true)).toBe(true)
    expect(summarizeRecord(r).trust).toBe('verified')
  })
  it('says valid, unknown signer when one key is not on the list, without failing the record', async () => {
    const rec = load()
    const [first] = Object.values(rec.publicKeys)
    const r = await verifyRecord(rec, { now: NOW, trustedKeys: [await keyFingerprint(first!)] })
    expect(r.ok).toBe(true)
    expect(r.trust).toBe('valid-unknown-signer')
    expect(r.signatures.filter((s) => s.trusted === false)).toHaveLength(1)
    const s = summarizeRecord(r)
    expect(s.trust).toBe('unknown-signer')
    expect(s.text).toMatch(/not on your list\. Valid is not the same as trusted/)
  })
  it('an empty list trusts nobody', async () => {
    expect((await verifyRecord(load(), { now: NOW, trustedKeys: [] })).trust).toBe('valid-unknown-signer')
  })
  it('compares fingerprints without regard to case', async () => {
    const rec = load()
    const all = await Promise.all(Object.values(rec.publicKeys).map(async (k) => (await keyFingerprint(k)).toUpperCase()))
    expect((await verifyRecord(rec, { now: NOW, trustedKeys: all })).trust).toBe('trusted')
  })
  it('does not call a tampered record trusted', async () => {
    const rec = load()
    rec.ledger[3]!.result = 'fail'
    const all = await Promise.all(Object.values(rec.publicKeys).map(keyFingerprint))
    const r = await verifyRecord(rec, { now: NOW, trustedKeys: all })
    expect(r.ok).toBe(false)
    expect(summarizeRecord(r).trust).toBe('failed')
  })
})
