import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error plain ESM modules with no types
import { classesIn, lintContrast, lintCssCollisions, lintCssRules, parseCss, ratio } from '../scripts/lint/css.mjs'
// @ts-expect-error plain ESM modules with no types
import { lintPlain, lintSource } from '../scripts/lint/source.mjs'
// @ts-expect-error plain ESM modules with no types
import { compareRegistry, lintPackage, lintProject, lintRegistry } from '../scripts/lint/project.mjs'

type Finding = { rule: string; line: number; message: string }
const css = (text: string): string[] => (lintCssRules(parseCss(text), 'x.css') as Finding[]).map((f) => f.rule)
const tsx = (text: string, opts: object = {}): string[] => (lintSource(text, 'src/components/X.tsx', opts).findings as Finding[]).map((f) => f.rule)

describe('css rules', () => {
  it('bans tracked uppercase captions', () => {
    expect(css('.a { text-transform: uppercase; }')).toContain('no-uppercase-caps')
    expect(css('.a { letter-spacing: 0.06em; }')).toContain('no-letter-spacing')
    expect(css('.a { letter-spacing: 0; text-transform: none; }')).toEqual([])
  })
  it('bans gradients but allows hatching', () => {
    expect(css('.a { background: linear-gradient(red, blue); }')).toContain('no-gradient')
    expect(css('.a { background: radial-gradient(red, blue); }')).toContain('no-gradient')
    expect(css('.a { background: repeating-linear-gradient(135deg, red 0 2px, transparent 2px 5px); }')).toEqual([])
  })
  it('bans shadows on resting surfaces, glows and glass', () => {
    expect(css('.card { box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }')).toContain('no-resting-shadow')
    expect(css('.ol-tip { box-shadow: 0 6px 20px rgb(0 0 0 / 0.2); }')).toEqual([])
    expect(css('.row { box-shadow: inset 3px 0 red; }')).toEqual([])
    expect(css('.a { box-shadow: none; }')).toEqual([])
    expect(css('.a { text-shadow: 0 1px 1px black; }')).toContain('no-text-shadow')
    expect(css('.a { filter: drop-shadow(0 0 8px red); }')).toContain('no-drop-shadow')
    expect(css('.a { backdrop-filter: blur(8px); }')).toContain('no-glass')
  })
  it('bans text under 11px', () => {
    expect(css('.a { font-size: 10px; }')).toContain('min-font-size')
    expect(css('.a { font: 500 9px system-ui; }')).toContain('min-font-size')
    expect(css('.a { font-size: 11px; font: 600 12.5px system-ui; }')).toEqual([])
  })
  it('keeps monospace to ids and code', () => {
    expect(css('.card { font-family: monospace; }')).toContain('mono-scope')
    expect(css('.card { font: 12px var(--ol-mono); }')).toContain('mono-scope')
    expect(css('.ol-id { font-family: var(--ol-mono); }')).toEqual([])
    expect(css('.ol { --ol-mono: ui-monospace, Menlo, monospace; }')).toEqual([])
  })
  it('reads nested at-rules and reports the right line', () => {
    const found = lintCssRules(parseCss('/* c */\n@media (min-width: 1px) {\n  .a {\n    text-transform: uppercase;\n  }\n}'), 'x.css') as Finding[]
    expect(found).toHaveLength(1)
    expect(found[0]!.line).toBe(4)
  })
  it('catches two components fighting over one class name', () => {
    const rules = parseCss('.ol-grid { display: grid; }\n.ol-grid { display: flex; }')
    expect((lintCssCollisions(rules, 'x.css') as Finding[]).map((f) => f.rule)).toEqual(['class-collision'])
    expect(lintCssCollisions(parseCss('.ol-a { display: grid; }\n.ol-a .b { display: flex; }'), 'x.css')).toEqual([])
  })
})

describe('contrast of the colour tokens', () => {
  const base = (over = '') => `.ol { --ol-bg: #ffffff; --ol-fg: #111111; --ol-muted: #5d6470; --ol-surface: #f4f4f4; --ol-accent: #1d232b; --ol-good: #1b7249; --ol-warn: #8f4f00; --ol-bad: #b3261e; --ol-c1: #2563c7; --ol-c2: #a85a0a; --ol-c3: #1d7a56; --ol-c4: #7a4cc2; --ol-c5: #bf3557; --ol-c6: #17788a; --ol-c7: #7d6a0f; --ol-c8: #5b6470; --ol-on-c: #ffffff; ${over} }
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) .ol { --ol-bg: #0e1115; --ol-fg: #ececec; --ol-muted: #9aa1ab; --ol-surface: #171a1f; --ol-accent: #e7b65c; --ol-good: #5fcf94; --ol-warn: #f0a85a; --ol-bad: #ff8a80; --ol-c1: #6ea0ff; --ol-c2: #f0a85a; --ol-c3: #5fcf94; --ol-c4: #b896f0; --ol-c5: #f27f9a; --ol-c6: #5ccbdc; --ol-c7: #d8c35a; --ol-c8: #9aa1ab; --ol-on-c: #0e1115; } }`
  const run = (text: string) => (lintContrast(parseCss(text), 'x.css') as Finding[]).map((f) => f.message)
  it('passes a readable token set in both themes', () => expect(run(base())).toEqual([]))
  it('fails muted text that is too faint', () => expect(run(base('--ol-muted: #bbbbbb;')).join()).toMatch(/light theme: muted text on ground/))
  it('fails white label text on a pale bar colour, the 1.9:1 bug', () => expect(run(base('--ol-c6: #5ccbdc;')).join()).toMatch(/--ol-c6 behind label text/))
  it('fails a dark theme that lightens status colours but keeps a white ground', () => {
    const broken = `.ol { --ol-bg: var(--background, #ffffff); --ol-fg: #111111; --ol-muted: #5d6470; --ol-surface: #f4f4f4; --ol-accent: #1d232b; --ol-good: #1b7249; --ol-warn: #8f4f00; --ol-bad: #b3261e; --ol-on-c: #ffffff; }
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) .ol { --ol-good: #5fcf94; } }`
    expect(run(broken).join()).toMatch(/dark theme: good text on ground/)
  })
  it('computes known ratios', () => {
    expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0)
    expect(ratio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5)
  })
})

describe('source rules', () => {
  const wrap = (body: string) => `export const X = () => (<div>${body}</div>)`
  it('requires accessible names and types on buttons', () => {
    expect(tsx(wrap('<button type="button"><Icon /></button>'))).toContain('a11y-button-name')
    expect(tsx(wrap('<button type="button" aria-label="Close"><Icon /></button>'))).toEqual([])
    expect(tsx(wrap('<button type="button">Save</button>'))).toEqual([])
    expect(tsx(wrap('<button type="button">{label}</button>'))).toEqual([])
    expect(tsx(wrap('<button>Save</button>'))).toContain('button-type')
  })
  it('requires alt, svg semantics and input labels', () => {
    expect(tsx(wrap('<img src="a.png" />'))).toContain('a11y-img-alt')
    expect(tsx(wrap('<img src="a.png" alt="" />'))).toEqual([])
    expect(tsx(wrap('<svg width="1"></svg>'))).toContain('a11y-svg')
    expect(tsx(wrap('<svg aria-hidden="true"></svg>'))).toEqual([])
    expect(tsx(wrap('<svg {...base}></svg>'))).toEqual([])
    expect(tsx(wrap('<input type="search" />'))).toContain('a11y-input-label')
    expect(tsx(wrap('<input aria-label="Search" />'))).toEqual([])
    expect(tsx(wrap('<label>Name <input /></label>'))).toEqual([])
    expect(tsx(wrap('<a>go</a>'))).toContain('a11y-link-href')
  })
  it('bans stock marketing wording, dashes, emoji and placeholder data', () => {
    expect(tsx(wrap('<p>Unlock seamless insights</p>'))).toContain('copy-slop')
    expect(tsx(wrap('<p>A powerful dashboard</p>'))).toContain('copy-slop')
    expect(tsx(wrap('<p>Paid — on time</p>'))).toContain('no-dashes')
    expect(tsx(wrap('<p>Done ✓</p>'))).toContain('no-emoji')
    expect(tsx(wrap('<p>Rocket 🚀</p>'))).toContain('no-emoji')
    expect(tsx(wrap('<p>Invoice from Acme Inc</p>'))).toContain('placeholder-data')
    expect(tsx(wrap('<p>Invoice from Northwind Ltd</p>'))).toEqual([])
    expect(tsx(wrap('<button type="button">Submit</button>'))).toContain('generic-label')
    expect(tsx(wrap('<i title="Seamless" />'))).toContain('copy-slop')
  })
  it('catches string children in expressions too', () => {
    expect(tsx(wrap("<p>{ok ? 'Seamless sync' : 'Retry'}</p>"))).toContain('copy-slop')
  })
  it('keeps components from carrying prose', () => {
    expect(tsx(wrap(`<p>${'word '.repeat(30)}</p>`))).toContain('too-texty')
    expect(tsx(wrap('<p>One. Two. Three.</p>'))).toContain('too-texty')
    expect(tsx(wrap(`<p>${'a '.repeat(50)}</p><p>${'b '.repeat(50)}</p>`), { textBudget: 60 })).toContain('text-budget')
    expect(tsx(wrap('<p>Short and clear.</p>'))).toEqual([])
    // code is allowed to be long
    expect(tsx(wrap(`<code>${'x'.repeat(200)}</code>`))).toEqual([])
  })
  it('keeps raw colours out of components', () => {
    expect(tsx("export const c = '#ff0000'")).toContain('no-raw-colour')
    expect(tsx("export const c = 'rgb(1 2 3)'")).toContain('no-raw-colour')
    expect(tsx("export const c = 'var(--ol-bad)'")).toEqual([])
  })
  it('keeps debris out', () => {
    expect(tsx('console.log(1)')).toContain('no-debug')
    expect(tsx('debugger')).toContain('no-debug')
    expect(tsx('// TODO later\nexport const a = 1')).toContain('no-todo')
    expect(tsx('export const a: any = 1')).toContain('no-any')
    expect(tsx('export const a = 1 as any')).toContain('no-any')
  })
  it('lets a line opt out with a stated rule, and only that rule', () => {
    expect(tsx('// lint-allow(no-any): boundary\nexport const a: any = 1')).toEqual([])
    expect(tsx('// lint-allow(no-debug): boundary\nexport const a: any = 1')).toContain('no-any')
  })
  it('reads plain files for placeholder data and symbols', () => {
    expect((lintPlain('const a = "Acme"', 'd.ts') as Finding[]).map((f) => f.rule)).toContain('placeholder-data')
    expect((lintPlain('x = "✓"', 'd.ts') as Finding[]).map((f) => f.rule)).toContain('no-emoji')
    expect(lintPlain('const a = "Northwind"', 'd.ts')).toEqual([])
  })
})

describe('project rules', () => {
  function project(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'orlune-lint-'))
    const base: Record<string, string> = {
      'scripts/lint/config.json': JSON.stringify({ textBudget: 60, textBudgetOverrides: {}, coverageExempt: [] }),
      'src/styles.css': '.ol { --ol-bg: #fff; --ol-fg: #111; --ol-muted: #5d6470; --ol-surface: #f4f4f4; --ol-accent: #1d232b; --ol-good: #1b7249; --ol-warn: #8f4f00; --ol-bad: #b3261e; --ol-on-c: #fff; --ol-c1: #2563c7; --ol-c2: #a85a0a; --ol-c3: #1d7a56; --ol-c4: #7a4cc2; --ol-c5: #bf3557; --ol-c6: #17788a; --ol-c7: #7d6a0f; --ol-c8: #5b6470 }\n.ol-a { color: red }\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .ol { --ol-bg: #0e1115; --ol-fg: #ececec; --ol-muted: #9aa1ab; --ol-surface: #171a1f; --ol-accent: #e7b65c; --ol-good: #5fcf94; --ol-warn: #f0a85a; --ol-bad: #ff8a80; --ol-on-c: #0e1115; --ol-c1: #6ea0ff; --ol-c2: #f0a85a; --ol-c3: #5fcf94; --ol-c4: #b896f0; --ol-c5: #f27f9a; --ol-c6: #5ccbdc; --ol-c7: #d8c35a; --ol-c8: #9aa1ab } }',
      'src/index.ts': 'export { Alpha } from "./components/Alpha.js"\n',
      'src/components/Alpha.tsx': 'export const Alpha = () => <div className="ol ol-a">Hi</div>\n',
      'demo/main.tsx': '<Spec name="Alpha">x</Spec>\n',
      'docs/screenshots/light/Alpha.png': '', 'docs/screenshots/dark/Alpha.png': '',
    }
    for (const [p, c] of Object.entries({ ...base, ...files })) { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), c) }
    return root
  }
  const rules = (root: string) => (lintProject(root) as Finding[]).map((f) => f.rule)
  it('passes a small clean project', () => expect(rules(project({}))).toEqual([]))
  it('finds a class a component uses that the stylesheet lacks', () => expect(rules(project({ 'src/components/Alpha.tsx': 'export const Alpha = () => <div className="ol ol-a ol-nope">Hi</div>\n' }))).toContain('class-missing'))
  it('finds stylesheet classes nothing uses', () => expect(rules(project({ 'src/components/Alpha.tsx': 'export const Alpha = () => <div className="ol">Hi</div>\n' }))).toContain('dead-css'))
  it('finds an exported component with no demo specimen or screenshot', () => {
    const r = rules(project({ 'src/index.ts': 'export { Alpha } from "./components/Alpha.js"\nexport { Beta } from "./components/Beta.js"\n' }))
    expect(r).toContain('coverage-demo')
    expect(r).toContain('coverage-screenshot')
  })
  it('finds files that collide on a case-insensitive filesystem', () => {
    expect(rules(project({ 'src/components/alpha.ts': 'export const x = 1\n' }))).toContain('file-case-collision')
  })
})

describe('package rules', () => {
  const good = {
    name: '@falnor/orlune', version: '1.2.3', description: 'd', license: 'MIT', keywords: ['react'], homepage: 'https://x', bugs: { url: 'https://x' },
    repository: { type: 'git', url: 'git+https://x.git' }, engines: { node: '>=20' }, publishConfig: { access: 'public' }, files: ['dist'],
    main: './dist/index.js', types: './dist/index.d.ts', exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' }, './package.json': './package.json' },
    scripts: { prepublishOnly: 'npm run check && npm run build && npm run smoke:pack' }, peerDependencies: { react: '^19' },
  }
  const msgs = (pkg: object, readme = 'npm install @falnor/orlune zod\nimport { A } from \'@falnor/orlune/verify\'\n', changelog = '# Changelog\n\n## 1.2.3\n') => {
    const root = mkdtempSync(join(tmpdir(), 'orlune-pkg-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg))
    writeFileSync(join(root, 'README.md'), readme)
    writeFileSync(join(root, 'CHANGELOG.md'), changelog)
    return (lintPackage(root) as Finding[]).map((f) => f.message)
  }
  it('passes a complete, consistent package', () => expect(msgs(good)).toEqual([]))
  it('needs repository, homepage, bugs, keywords and engines', () => {
    const { repository: _r, homepage: _h, bugs: _b, keywords: _k, engines: _e, ...rest } = good
    expect(msgs(rest).join(' | ')).toMatch(/repository.*homepage.*bugs.*keywords.*engines/)
  })
  it('refuses a private package and a bad version', () => {
    expect(msgs({ ...good, private: true }).join()).toMatch(/private/)
    expect(msgs({ ...good, version: '1.2' }).join()).toMatch(/not a semver/)
  })
  it('keeps provenance out of the manifest, where it breaks a local publish', () => {
    expect(msgs({ ...good, publishConfig: { access: 'public', provenance: true } }).join()).toMatch(/provenance not supported/)
  })
  it('makes a scoped package public', () => expect(msgs({ ...good, publishConfig: {} }).join()).toMatch(/private unless publishConfig/))
  it('keeps exports and entry fields inside dist', () => {
    expect(msgs({ ...good, exports: { '.': './src/index.ts' } }).join()).toMatch(/points outside dist/)
    expect(msgs({ ...good, main: './src/index.js' }).join()).toMatch(/"main" points outside dist/)
    expect(msgs({ ...good, files: ['src'] }).join()).toMatch(/must include dist/)
  })
  it('requires the checks to run before publishing', () => {
    expect(msgs({ ...good, scripts: {} }).join()).toMatch(/prepublishOnly/)
    expect(msgs({ ...good, scripts: { prepublishOnly: 'npm run check' } }).join()).toMatch(/prepublishOnly/)
  })
  it('catches docs that name a different package than the one published', () => {
    expect(msgs(good, 'npm install orlune zod\n').join()).toMatch(/README says "npm install orlune"/)
    expect(msgs(good, "import { A } from 'orlune/verify'\n").join()).toMatch(/README imports from "orlune"/)
    expect(msgs({ ...good, name: 'orlune', publishConfig: {} }, "npm install orlune\nimport { A } from 'orlune/verify'\n")).toEqual([])
  })
  it('wants a changelog entry for the version being published', () => expect(msgs(good, undefined, '# Changelog\n\n## 1.0.0\n').join()).toMatch(/no "## 1.2.3" entry/))
})

describe('registry freshness', () => {
  const outputs = new Map([['r/a.json', 'A\n'], ['registry.json', 'R\n']])
  const rules = (disk: Record<string, string>) => (compareRegistry(outputs, (p: string) => disk[p] ?? null, () => Object.keys(disk).filter((k) => k.startsWith('r/'))) as Finding[]).map((f) => f.rule + ':' + (f as unknown as { file: string }).file)
  it('passes when disk matches what would be built', () => expect(rules({ 'r/a.json': 'A\n', 'registry.json': 'R\n' })).toEqual([]))
  it('fails on a file whose content is stale', () => expect(rules({ 'r/a.json': 'old\n', 'registry.json': 'R\n' })).toEqual(['registry-stale:r/a.json']))
  it('fails on a missing file', () => expect(rules({ 'registry.json': 'R\n' })).toEqual(['registry-stale:r/a.json']))
  it('fails on a leftover file no item owns', () => expect(rules({ 'r/a.json': 'A\n', 'registry.json': 'R\n', 'r/gone.json': 'x' })).toEqual(['registry-stale:r/gone.json']))
})

describe('this repository', () => {
  it('has a registry that matches src', async () => {
    expect(await lintRegistry(new URL('..', import.meta.url).pathname)).toEqual([])
  })
  it('is clean', () => {
    const found = lintProject(new URL('..', import.meta.url).pathname) as (Finding & { file: string; match: string })[]
    expect(found.map((f) => `${f.rule} ${f.file}:${f.line} ${f.match}`)).toEqual([])
  })
  it('lists every class it uses in the stylesheet', () => {
    expect(classesIn(parseCss('.ol-a .ol-b, .ol-c:hover {}')).size).toBe(3)
  })
})
