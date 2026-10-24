// Project-wide lint: runs every rule over the right files and adds the checks that need more than one file.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { classesIn, lintContrast, lintCssCollisions, lintCssRules, parseCss } from './css.mjs'
import { lintPlain, lintSource } from './source.mjs'

const F = (rule, file, line, message, match = '') => ({ rule, file, line, message, match })
const read = (p) => readFileSync(p, 'utf8')
const walk = (dir, pred, out = []) => {
  if (!existsSync(dir)) return out
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { if (!['node_modules', 'dist', '.git'].includes(n)) walk(p, pred, out) }
    else if (pred(p)) out.push(p)
  }
  return out
}

/** CSS inside an html or template file, with the line offset kept so reported lines are right. */
function styleBlocks(text) {
  const blocks = []
  for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const before = text.slice(0, m.index + m[0].indexOf('>') + 1)
    blocks.push({ css: m[1], offset: before.split('\n').length - 1 })
  }
  return blocks
}

export function lintProject(root = '.', config = {}) {
  const cfg = { ...JSON.parse(read(join(root, 'scripts/lint/config.json'))), ...config }
  const out = []
  const rel = (p) => relative(root, p).split('\\').join('/')

  // --- stylesheet
  const cssPath = join(root, 'src/styles.css')
  const cssText = read(cssPath)
  const rules = parseCss(cssText)
  out.push(...lintCssRules(rules, 'src/styles.css'), ...lintCssCollisions(rules, 'src/styles.css'), ...lintContrast(rules, 'src/styles.css'))

  // --- CSS that lives in other files (the demo page, the reference page template)
  for (const f of ['demo/index.html', 'scripts/build-gallery.mjs']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    for (const b of styleBlocks(read(p))) {
      const rs = parseCss(b.css)
      out.push(...[...lintCssRules(rs, f), ...lintCssCollisions(rs, f)].map((x) => ({ ...x, line: x.line + b.offset })))
    }
  }

  // --- TypeScript and TSX in src
  const srcFiles = walk(join(root, 'src'), (p) => /\.tsx?$/.test(p))
  const usedClasses = new Set()
  for (const p of srcFiles) {
    const text = read(p)
    const r = lintSource(text, rel(p), { textBudget: cfg.textBudget, textBudgetOverrides: cfg.textBudgetOverrides })
    out.push(...r.findings)
    if (/\.tsx$/.test(p)) for (const m of text.matchAll(/(?<![\w-])(ol-[a-z0-9-]+)/g)) usedClasses.add(m[1])
  }

  // --- plain-text rules for demo and scripts (not the lint code itself, which contains the patterns)
  const plain = [
    ...walk(join(root, 'demo'), (p) => /\.(tsx?|html)$/.test(p) && !p.includes('/dist/')),
    ...walk(join(root, 'scripts'), (p) => /\.(mjs|py)$/.test(p) && !p.includes('/lint/')),
  ]
  for (const p of plain) out.push(...lintPlain(read(p), rel(p)))
  for (const p of walk(join(root, 'demo'), (p) => /\.tsx$/.test(p) && !p.includes('/dist/'))) {
    out.push(...lintSource(read(p), rel(p), { isComponent: false }).findings.filter((f) => ['a11y-button-name', 'a11y-input-label', 'a11y-img-alt', 'copy-slop', 'no-dashes', 'no-debug'].includes(f.rule)))
  }

  // --- every class a component uses must exist, and every class in the stylesheet must be used
  const defined = classesIn(rules)
  const alias = new Set(cfg.classAllow ?? [])
  for (const c of usedClasses) if (!defined.has(c) && !alias.has(c)) out.push(F('class-missing', 'src/components', 0, `Class "${c}" is used in a component but has no rule in styles.css.`, c))
  const lines = cssText.split('\n')
  for (const c of defined) if (!usedClasses.has(c) && !alias.has(c)) {
    const at = lines.findIndex((l) => l.includes(`.${c}`)) + 1
    out.push(F('dead-css', 'src/styles.css', at, `Class "${c}" is in the stylesheet but no component uses it. Delete it.`, c))
  }

  // --- filenames that differ only by case break on case-insensitive filesystems
  for (const dir of ['src', 'src/components', 'src/verify', 'scripts', 'test']) {
    const p = join(root, dir)
    if (!existsSync(p)) continue
    const seen = new Map()
    for (const n of readdirSync(p)) {
      if (!/\.(tsx?|jsx?|mjs)$/.test(n) || statSync(join(p, n)).isDirectory()) continue
      const k = n.toLowerCase().replace(/\.(tsx?|jsx?|mjs)$/, '')
      if (seen.has(k) && seen.get(k) !== n) out.push(F('file-case-collision', `${dir}/${n}`, 0, `"${n}" and "${seen.get(k)}" resolve to the same import on a case-insensitive filesystem (macOS, Windows). Rename one.`, n))
      seen.set(k, n)
    }
  }

  // --- every exported component has a demo specimen and a screenshot in both themes
  const index = read(join(root, 'src/index.ts'))
  const demo = existsSync(join(root, 'demo/main.tsx')) ? read(join(root, 'demo/main.tsx')) : ''
  const exported = [...index.matchAll(/export \{ ([A-Z][A-Za-z]+)[ ,]/g)].map((m) => m[1]).filter((n) => !(cfg.coverageExempt ?? []).includes(n))
  for (const n of exported) {
    if (!new RegExp(`<Spec name="${n}"`).test(demo)) out.push(F('coverage-demo', 'demo/main.tsx', 0, `${n} is exported but has no specimen in the demo.`, n))
    for (const theme of ['light', 'dark']) if (!existsSync(join(root, `docs/screenshots/${theme}/${n}.png`))) out.push(F('coverage-screenshot', `docs/screenshots/${theme}`, 0, `${n} has no ${theme} screenshot. Run npm run gallery.`, n))
  }
  return out
}

const REGISTRY_BASE = 'https://raw.githubusercontent.com/falnor-io/orlune/main/r'

/** Pure comparison, so it can be tested: what the builder would write against what is on disk. */
export function compareRegistry(outputs, readDisk, listDisk) {
  const out = []
  for (const [path, text] of outputs) {
    const disk = readDisk(path)
    if (disk === null) out.push(F('registry-stale', path, 0, 'Registry file is missing. Run npm run registry.', path))
    else if (disk !== text) out.push(F('registry-stale', path, 0, 'Registry file is out of date with src/. Run npm run registry and commit the result.', path))
  }
  for (const path of listDisk()) if (!outputs.has(path)) out.push(F('registry-stale', path, 0, 'Registry file no longer belongs to any item. Run npm run registry.', path))
  return out
}

/** Fails when r/ and registry.json do not match what src/ would build. CI used to be the only place this was checked. */
export async function lintRegistry(root = '.') {
  const script = join(root, 'scripts/build-registry.mjs')
  if (!existsSync(script) || !existsSync(join(root, 'registry.json'))) return []
  const { buildRegistry } = await import(pathToFileURL(script).href)
  const outputs = buildRegistry(REGISTRY_BASE, pathToFileURL(root.endsWith('/') ? root : root + '/'))
  const readDisk = (p) => (existsSync(join(root, p)) ? read(join(root, p)) : null)
  const listDisk = () => (existsSync(join(root, 'r')) ? readdirSync(join(root, 'r')).map((n) => `r/${n}`) : [])
  return compareRegistry(outputs, readDisk, listDisk)
}
