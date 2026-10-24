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

/** Publishing metadata and the docs that tell people how to install it. Skipped for projects without a package.json. */
export function lintPackage(root = '.') {
  const pj = join(root, 'package.json')
  if (!existsSync(pj)) return []
  const out = []
  const pkg = JSON.parse(read(pj))
  const bad = (msg, match = '') => out.push(F('package-meta', 'package.json', 0, msg, match))
  for (const f of ['name', 'version', 'description', 'license']) if (!pkg[f]) bad(`"${f}" is missing.`, f)
  if (pkg.private) bad('"private": true stops npm publish.', 'private')
  if (pkg.version && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pkg.version)) bad(`"${pkg.version}" is not a semver version.`, pkg.version)
  if (!pkg.repository?.url) bad('"repository.url" is missing, so the npm page cannot link to the source.', 'repository')
  if (!pkg.homepage) bad('"homepage" is missing.', 'homepage')
  if (!pkg.bugs?.url) bad('"bugs.url" is missing.', 'bugs')
  if (!pkg.keywords?.length) bad('"keywords" is empty, so the package is hard to find.', 'keywords')
  if (!pkg.engines?.node) bad('"engines.node" is missing.', 'engines')
  if (pkg.name?.startsWith('@') && pkg.publishConfig?.access !== 'public') bad('A scoped package is private unless publishConfig.access is "public".', 'publishConfig')
  if (!(pkg.files ?? []).includes('dist')) bad('"files" must include dist, or the tarball has no code.', 'files')
  for (const [k, v] of Object.entries(pkg.exports ?? {})) {
    const targets = typeof v === 'string' ? [v] : Object.values(v)
    for (const target of targets) if (target !== './package.json' && !String(target).startsWith('./dist/')) bad(`exports["${k}"] points outside dist: ${target}`, k)
  }
  for (const f of ['main', 'module', 'types']) if (pkg[f] && !pkg[f].startsWith('./dist/')) bad(`"${f}" points outside dist.`, f)
  const pre = pkg.scripts?.prepublishOnly ?? ''
  if (!/\bcheck\b/.test(pre) || !/smoke:pack/.test(pre)) bad('prepublishOnly must run check and smoke:pack, so nothing unchecked reaches npm.', 'prepublishOnly')
  if (!pkg.peerDependencies?.react) bad('react must be a peer dependency.', 'peerDependencies')
  const readme = existsSync(join(root, 'README.md')) ? read(join(root, 'README.md')) : ''
  const install = /npm install (@?[\w./-]+)/.exec(readme)
  if (install && install[1] !== pkg.name) out.push(F('package-meta', 'README.md', 0, `README says "npm install ${install[1]}" but the package is "${pkg.name}".`, install[0]))
  // The package name inside an import specifier: "@scope/name/sub" is "@scope/name", "name/sub" is "name".
  const pkgOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
  for (const m of readme.matchAll(/from '([^'.][^']*)'/g)) {
    const name = pkgOf(m[1])
    if (/(^|\/)orlune$/.test(name) && name !== pkg.name) out.push(F('package-meta', 'README.md', 0, `README imports from "${name}" but the package is "${pkg.name}".`, m[0]))
  }
  const log = existsSync(join(root, 'CHANGELOG.md')) ? read(join(root, 'CHANGELOG.md')) : ''
  if (pkg.version && !new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')}\\b`, 'm').test(log)) out.push(F('package-meta', 'CHANGELOG.md', 0, `CHANGELOG.md has no "## ${pkg.version}" entry.`, pkg.version))
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
