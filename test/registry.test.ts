import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), 'utf8')
const registry = JSON.parse(read('registry.json')) as { items: { name: string; type: string; files: { path: string; target: string }[]; registryDependencies?: string[] }[] }
const names = new Set(registry.items.map((i) => i.name))

describe('registry', () => {
  it('has an item JSON for every registry entry, and no strays', () => {
    const built = readdirSync(new URL('r/', root)).filter((f) => f !== 'registry.json').map((f) => f.replace('.json', '')).sort()
    expect(built).toEqual([...names].sort())
  })

  it('points every dependency at an item that exists', () => {
    for (const item of registry.items) {
      for (const dep of item.registryDependencies ?? []) {
        const name = dep.split('/').pop()!.replace('.json', '')
        expect(names.has(name), `${item.name} depends on missing ${name}`).toBe(true)
      }
    }
  })

  it('lists only files that exist, installed under components/orlune', () => {
    for (const item of registry.items) {
      for (const file of item.files) {
        expect(existsSync(new URL(file.path, root)), file.path).toBe(true)
        expect(file.target.startsWith('components/orlune/')).toBe(true)
      }
    }
  })

  it('inlines code with no .js import extensions, so it installs into any bundler project', () => {
    for (const item of registry.items) {
      const built = JSON.parse(read(`r/${item.name}.json`)) as { files: { content: string; path: string }[] }
      for (const f of built.files) {
        expect(f.content.length, f.path).toBeGreaterThan(0)
        expect(/from\s+'\.[^']*\.js'/.test(f.content), `${f.path} still has a .js import`).toBe(false)
      }
    }
  })

  it('covers every component the package exports', () => {
    const exported = [...read('src/index.ts').matchAll(/export \{ ([A-Z][A-Za-z]+)[ ,]/g)].map((m) => m[1]!)
    const kebab = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    for (const name of exported.filter((n) => n !== 'RecordProvider' && n !== 'SourcesProvider')) expect(names.has(kebab(name)), `no registry item for ${name}`).toBe(true)
  })

  it('keeps the model-facing set free of verification state', () => {
    const openui = JSON.parse(read('r/openui.json')) as { files: { content: string }[] }
    const code = openui.files[0]!.content
    expect(code).not.toMatch(/import[^\n]*(RetestClock|ApprovalGate)|name: '(RetestClock|ApprovalGate)'/)
    expect(code).toMatch(/name: 'VerifyStatus'/)
  })
})

describe('registry installs', () => {
  type Item = { name: string; files: { path: string; target: string }[]; registryDependencies?: string[] }
  const items = registry.items as Item[]
  const byName = new Map(items.map((i) => [i.name, i]))
  const closure = (name: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(name)) return seen
    seen.add(name)
    for (const dep of byName.get(name)?.registryDependencies ?? []) closure(dep.split('/').pop()!.replace('.json', ''), seen)
    return seen
  }
  const strip = (t: string) => t.replace(/\.(tsx?|css)$/, '')
  const resolve = (from: string, rel: string) => {
    const parts = from.split('/').slice(0, -1)
    for (const seg of rel.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg) }
    return parts.join('/')
  }

  it('every relative import in every file resolves inside the item or its dependencies', () => {
    for (const item of items) {
      const available = new Set([...closure(item.name)].flatMap((n) => byName.get(n)?.files ?? []).map((f) => strip(f.target)))
      const built = JSON.parse(read(`r/${item.name}.json`)) as { files: { target: string; content: string }[] }
      for (const f of built.files) {
        for (const m of f.content.matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)) {
          const target = strip(resolve(f.target, m[1]!))
          expect(available.has(target), `${item.name}: ${f.target} imports ${m[1]}, which would not be installed`).toBe(true)
        }
      }
    }
  })
})
