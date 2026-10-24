// CSS lint: a small parser (so rules are judged in context, not line by line) and the style rules.
// Every finding is { rule, file, line, message, match }.

export function stripComments(text) {
  // Keep newlines so line numbers stay right.
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * Flattens CSS into rules: { selector, atRules: [...enclosing at-rules], decls: [{ prop, value, line }], line }.
 * Handles nested @media and @keyframes. It does not try to be a full CSS parser; it reads what this project writes.
 */
export function parseCss(text) {
  const src = stripComments(text)
  const rules = []
  const stack = []
  let buf = ''
  let line = 1
  let bufLine = 1
  const flushDecl = () => {
    const top = stack[stack.length - 1]
    const d = buf.trim()
    if (top && d && !top.isAt) {
      const i = d.indexOf(':')
      if (i > 0) top.decls.push({ prop: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim(), line: bufLine })
    }
    buf = ''
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '\n') line++
    if (ch === '{') {
      const selector = buf.trim().replace(/\s+/g, ' ')
      stack.push({ selector, isAt: selector.startsWith('@'), decls: [], line: bufLine, atRules: stack.filter((s) => s.isAt).map((s) => s.selector) })
      buf = ''
      bufLine = line
    } else if (ch === '}') {
      flushDecl()
      const done = stack.pop()
      if (done && !done.isAt) rules.push(done)
      buf = ''
      bufLine = line
    } else if (ch === ';') {
      flushDecl()
      bufLine = line
    } else {
      if (buf.trim() === '' && !/\s/.test(ch)) bufLine = line
      buf += ch
    }
  }
  return rules
}

const F = (rule, file, line, message, match = '') => ({ rule, file, line, message, match: String(match).slice(0, 80) })

// Mono is for ids, keys, hashes and code. These selectors are where it may appear.
const MONO_OK = /\.kl-id\b|\.kl-json|\.kl-ln\b|\.kl-sign\b|\.kl-code\b|\.kl-diff|\.kl-dtable|\bpre\b|\bcode\b|\bkbd\b/

export function lintCssRules(rules, file) {
  const out = []
  for (const r of rules) {
    const sel = r.selector
    for (const d of r.decls) {
      const { prop, value, line } = d
      const where = `${sel} { ${prop}: ${value.slice(0, 40)} }`
      if (prop === 'text-transform' && /uppercase/.test(value)) out.push(F('no-uppercase-caps', file, line, 'Tracked uppercase captions read as a generated tell. Use sentence case at 12px or larger.', where))
      if (prop === 'letter-spacing' && !/^(0|0px|normal|0em)$/.test(value.trim())) out.push(F('no-letter-spacing', file, line, 'Letter-spacing is only for tracked caps, which are banned. Remove it.', where))
      if (/(^|[^-\w])(linear|radial|conic)-gradient\(/.test(value) && !/repeating-/.test(value.replace(/(^|[^-\w])(linear|radial|conic)-gradient\(/g, (m) => m))) out.push(F('no-gradient', file, line, 'Gradients are flat-colour decoration. Use a flat fill. (repeating-linear-gradient is allowed for hatching.)', where))
      else if (/(?<!repeating-)(linear|radial|conic)-gradient\(/.test(value)) out.push(F('no-gradient', file, line, 'Gradients are flat-colour decoration. Use a flat fill. (repeating-linear-gradient is allowed for hatching.)', where))
      if (prop === 'text-shadow' && !/^none$/.test(value)) out.push(F('no-text-shadow', file, line, 'Text shadows hurt legibility. Fix contrast instead.', where))
      if (/drop-shadow\(/.test(value)) out.push(F('no-drop-shadow', file, line, 'drop-shadow is a glow. Remove it.', where))
      if (prop === 'backdrop-filter' || prop === '-webkit-backdrop-filter') out.push(F('no-glass', file, line, 'Backdrop blur (glass). Use an opaque surface one tone step from the ground.', where))
      if (prop === 'box-shadow' && !/^none$/.test(value) && !/^inset\b/.test(value) && !/\.kl-tip\b|\.kl-fctl\b/.test(sel)) out.push(F('no-resting-shadow', file, line, 'Resting surfaces carry no shadow. Use a border, a tone step or an outline. Only floating tooltips may have one.', where))
      if (prop === 'font-size') {
        const m = /^([\d.]+)px$/.exec(value.trim())
        if (m && Number(m[1]) < 11) out.push(F('min-font-size', file, line, 'Text under 11px is unreadable.', where))
      }
      if (prop === 'font') {
        const m = /(?:^|\s)([\d.]+)px/.exec(value)
        if (m && Number(m[1]) < 11) out.push(F('min-font-size', file, line, 'Text under 11px is unreadable.', where))
      }
      if ((prop === 'font-family' || prop === 'font') && /var\(--kl-mono\)|monospace|ui-monospace|Menlo|Courier/i.test(value) && !MONO_OK.test(sel)) out.push(F('mono-scope', file, line, 'Monospace is for ids, hashes and code only. Figures use the text face with tabular numerals.', where))
    }
  }
  return out
}

/** Two bare single-class rules that both set `display` are two components fighting over one name. */
export function lintCssCollisions(rules, file) {
  const out = []
  const seen = new Map()
  for (const r of rules) {
    const m = /^\.(kl-[\w-]+)$/.exec(r.selector)
    if (!m || r.atRules.length) continue
    const display = r.decls.find((d) => d.prop === 'display')
    if (!display) continue
    const prev = seen.get(m[1])
    if (prev && prev.value !== display.value) out.push(F('class-collision', file, display.line, `.${m[1]} sets display twice (line ${prev.line}: ${prev.value}, here: ${display.value}). Two components share one class name.`, m[1]))
    else if (!prev) seen.set(m[1], { value: display.value, line: display.line })
  }
  return out
}

export const classesIn = (rules) => {
  const set = new Set()
  for (const r of rules) for (const m of r.selector.matchAll(/\.(kl-[\w-]+)/g)) set.add(m[1])
  return set
}

// ---- contrast of the colour tokens, per theme --------------------------------------------------------------
const hex = (s) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const mixRgb = (a, pa, b) => a.map((c, i) => Math.round(c * pa + b[i] * (1 - pa)))

/** Resolve a token to a colour with host variables treated as absent, so the fallbacks are what gets judged. */
function colourOf(env, name, depth = 0) {
  if (depth > 8) return null
  const raw = env[name]
  if (raw === undefined) return null
  return evalColour(raw, env, depth)
}
function evalColour(raw, env, depth) {
  let v = raw.trim()
  for (let guard = 0; guard < 8 && /var\(/.test(v); guard++) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/, (_, n, fb) => (env[n] !== undefined ? env[n] : fb ?? 'invalid'))
  }
  const h = hex(v)
  if (h) return h
  const cm = /^color-mix\(\s*in srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+)\)$/.exec(v)
  if (cm) {
    const a = evalColour(cm[1], env, depth + 1)
    const b = cm[3].trim() === 'transparent' ? null : evalColour(cm[3], env, depth + 1)
    if (a && b) return mixRgb(a, Number(cm[2]) / 100, b)
  }
  return null
}

export function lintContrast(rules, file) {
  const out = []
  const env = { light: {}, dark: {} }
  for (const r of rules) {
    if (!/(^|[\s,])\.kl$|\.kl$/.test(r.selector.split(',').pop().trim()) && !/\.kl\b/.test(r.selector)) continue
    const isDark = r.atRules.some((a) => /prefers-color-scheme:\s*dark/.test(a)) || /\[data-theme='dark'\]/.test(r.selector)
    const isLightForce = /\[data-theme='light'\]/.test(r.selector) && !isDark
    for (const d of r.decls) if (d.prop.startsWith('--kl-')) {
      if (isDark) env.dark[d.prop] = d.value
      else if (!isLightForce) env.light[d.prop] = d.value
    }
  }
  const themes = { light: env.light, dark: { ...env.light, ...env.dark } }
  for (const [name, e] of Object.entries(themes)) {
    const c = (t) => colourOf(e, t)
    const bg = c('--kl-bg')
    const fg = c('--kl-fg')
    if (!bg || !fg) { out.push(F('contrast-tokens', file, 1, `${name} theme: --kl-bg or --kl-fg does not resolve to a colour (give var() a hex fallback).`)); continue }
    const need = (label, a, b, min = 4.5) => {
      if (!a || !b) return out.push(F('contrast-tokens', file, 1, `${name} theme: ${label} does not resolve to a colour.`))
      const r = ratio(a, b)
      if (r < min) out.push(F('contrast-tokens', file, 1, `${name} theme: ${label} is ${r.toFixed(2)}:1, needs ${min}:1.`))
    }
    const surface = c('--kl-surface')
    need('text on ground (--kl-fg on --kl-bg)', fg, bg)
    need('muted text on ground', c('--kl-muted'), bg)
    need('muted text on surface', c('--kl-muted'), surface)
    need('accent text on ground', c('--kl-accent'), bg)
    for (const [tone, pct] of [['good', 0.13], ['warn', 0.14], ['bad', 0.12]]) {
      const col = c(`--kl-${tone}`)
      need(`${tone} text on ground`, col, bg)
      if (col) need(`${tone} pill text on its tint`, col, mixRgb(col, pct, bg))
    }
    const on = c('--kl-on-c')
    for (let i = 1; i <= 8; i++) need(`bar colour --kl-c${i} behind label text (--kl-on-c)`, on, c(`--kl-c${i}`))
  }
  return out
}
