// Source lint for .ts and .tsx: accessible names, copy, text budget, colours and debris.
// JSX is read with the TypeScript parser, so a rule sees elements and text, not lines.
import ts from 'typescript'

const F = (rule, file, line, message, match = '') => ({ rule, file, line, message, match: String(match).replace(/\s+/g, ' ').slice(0, 80) })

// Stock marketing and AI-sounding words. Say the specific thing instead.
export const SLOP_WORDS = /\b(unlock(s|ed|ing)?|unleash(es|ed|ing)?|supercharge[sd]?|seamless(ly)?|elevate[sd]?|empower(s|ed|ing)?|revolutioni[sz]e[sd]?|game[- ]chang(er|ing)|cutting[- ]edge|next[- ]gen(eration)?|world[- ]class|best[- ]in[- ]class|all[- ]in[- ]one|effortless(ly)?|blazing(ly)?[- ]fast|lightning[- ]fast|reimagin(e|ed|ing)|delve[sd]?|tapestry|leverag(e|es|ed|ing)|synergy|streamlin(e|es|ed|ing)|robust|holistic|turbocharge[sd]?|powerful|intuitive|beautiful(ly)?|stunning|magic(al)?|journey)\b/i
export const GENERIC_LABELS = /^\s*(learn more|get started|click here|read more|discover more|explore now|submit|ok|yes|no)\s*$/i
const PLACEHOLDER = /\b(acme( inc| corp)?|lorem ipsum|dolor sit amet|john doe|jane doe|test ?user|user ?\d+|foo ?bar|firstname lastname|123 main st)\b/i
const EMOJI = /[\p{Extended_Pictographic}✓✔✗✘✕✖⤳⋯]/u
const DASH = /[—–]/
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/

const src = (text, file) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
const attr = (el, name) => (el.attributes?.properties ?? []).find((a) => ts.isJsxAttribute(a) && a.name.getText() === name)
const tagName = (el) => (el.tagName ? el.tagName.getText() : '')
const words = (s) => (s.trim().match(/\S+/g) ?? []).length

/** Lines carrying `lint-allow(rule)` (or `lint-allow(*)`) on themselves or the line above are exempt for that rule. */
function allowed(text) {
  const map = new Map()
  text.split('\n').forEach((l, i) => {
    const m = /lint-allow\(([\w*,\s-]+)\)/.exec(l)
    if (m) for (const r of m[1].split(',').map((x) => x.trim())) { (map.get(i + 1) ?? map.set(i + 1, new Set()).get(i + 1)).add(r); (map.get(i + 2) ?? map.set(i + 2, new Set()).get(i + 2)).add(r) }
  })
  return map
}

export function lintSource(text, file, opts = {}) {
  const { textBudget = 60, textBudgetOverrides = {}, maxTextChars = 110, maxSentences = 2, isComponent = /(^|\/)src\/components\/[^/]+\.tsx$/.test(file) } = opts
  const sf = src(text, file)
  const out = []
  const okLines = allowed(text)
  const add = (f) => { const a = okLines.get(f.line); if (!a || !(a.has(f.rule) || a.has('*'))) out.push(f) }

  let staticWords = 0
  const copy = (value, node, kind) => {
    if (!value.trim()) return
    const line = lineOf(sf, node)
    if (SLOP_WORDS.test(value)) add(F('copy-slop', file, line, 'Stock marketing wording. Say the specific thing.', value.match(SLOP_WORDS)[0]))
    if (DASH.test(value)) add(F('no-dashes', file, line, 'Em and en dashes in UI copy. Use a full stop, a comma or a hyphen.', value))
    if (EMOJI.test(value)) add(F('no-emoji', file, line, 'Emoji and symbol glyphs as UI. Use the inline marks in icons.tsx or words.', value))
    if (PLACEHOLDER.test(value)) add(F('placeholder-data', file, line, 'Placeholder data. Use believable names and figures for the product.', value))
    if (kind === 'label' && GENERIC_LABELS.test(value)) add(F('generic-label', file, line, 'Generic label. Name the action.', value))
  }

  const visit = (node) => {
    // Component source only: copy rules on JSX text and string children.
    if (ts.isJsxText(node)) {
      const t = node.getText(sf).replace(/\s+/g, ' ').trim()
      if (t) {
        const parentTag = ts.isJsxElement(node.parent) ? tagName(node.parent.openingElement) : ''
        const isCode = /^(code|pre|kbd)$/.test(parentTag)
        copy(t, node, /^(button|a|summary)$/.test(parentTag) ? 'label' : 'text')
        if (!isCode) {
          staticWords += words(t)
          if (t.length > maxTextChars) add(F('too-texty', file, lineOf(sf, node), `A single run of text is ${t.length} characters (limit ${maxTextChars}). Cut it, or move it to a title attribute or a fold.`, t))
          const sentences = (t.match(/[.!?]\s+[A-Z]/g) ?? []).length + 1
          if (sentences > maxSentences) add(F('too-texty', file, lineOf(sf, node), `${sentences} sentences in one text run (limit ${maxSentences}). Say less.`, t))
        }
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.parent && ts.isJsxExpression(node.parent) === false) {
      // String children inside JSX expressions: { cond ? 'Words' : 'Other' }
      let p = node.parent
      let inChild = false
      while (p && !ts.isSourceFile(p)) {
        if (ts.isJsxAttribute(p)) { inChild = false; break }
        if (ts.isJsxExpression(p) && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent))) { inChild = true; break }
        p = p.parent
      }
      if (inChild && node.text.trim() && !/^[\w-]+$/.test(node.text) ) {
        copy(node.text, node, 'text')
        staticWords += words(node.text)
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parentAttr = ts.isJsxAttribute(node.parent) ? node.parent.name.getText() : ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent) ? node.parent.parent.name.getText() : ''
      if (/^(title|aria-label|alt|placeholder)$/.test(parentAttr)) copy(node.text, node, 'attr')
      if (isComponent && RAW_COLOUR.test(node.text)) add(F('no-raw-colour', file, lineOf(sf, node), 'Raw colour in a component. Colours live in the tokens in styles.css.', node.text))
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node)
      const el = node
      const line = lineOf(sf, node)
      const has = (n) => !!attr(el, n)
      if (tag === 'img' && !has('alt')) add(F('a11y-img-alt', file, line, '<img> needs alt text (empty alt for decoration).', '<img>'))
      const spread = (el.attributes?.properties ?? []).some((a) => ts.isJsxSpreadAttribute(a)) // cannot see through a spread
      if (tag === 'svg' && !spread && !(has('aria-hidden') || has('role') || has('aria-label'))) add(F('a11y-svg', file, line, '<svg> needs aria-hidden (decoration) or role and aria-label (meaning).', '<svg>'))
      if (/^(input|select|textarea)$/.test(tag) && !(has('aria-label') || has('aria-labelledby') || has('id'))) {
        // An input inside a <label> is labelled by it.
        let p = node.parent
        let inLabel = false
        while (p && !ts.isSourceFile(p)) { if (ts.isJsxElement(p) && tagName(p.openingElement) === 'label') { inLabel = true; break } p = p.parent }
        if (!inLabel) add(F('a11y-input-label', file, line, `<${tag}> needs aria-label, aria-labelledby, an id with a label, or a wrapping <label>.`, `<${tag}>`))
      }
      if (tag === 'button' && ts.isJsxOpeningElement(node)) {
        const parent = node.parent
        const kids = ts.isJsxElement(parent) ? parent.children : []
        const named = has('aria-label') || has('aria-labelledby') || has('title') || kids.some((k) => (ts.isJsxText(k) && k.getText(sf).trim()) || ts.isJsxExpression(k))
        if (!named) add(F('a11y-button-name', file, line, '<button> has no accessible name. Add text or aria-label (icon-only buttons need aria-label).', '<button>'))
        if (!has('type')) add(F('button-type', file, line, '<button> without type submits forms by accident. Add type="button".', '<button>'))
      }
      if (tag === 'a' && !has('href')) add(F('a11y-link-href', file, line, '<a> without href is not a link. Use a button.', '<a>'))
      const style = attr(el, 'style')
      if (style && isComponent) {
        const t = style.getText(sf)
        if (/boxShadow|textShadow|backdropFilter|filter\s*:/.test(t)) add(F('no-inline-effects', file, line, 'Shadow and filter effects belong in the stylesheet rules that allow them.', t))
      }
    }
    if (ts.isCallExpression(node) && /^console\.(log|debug|info)$/.test(node.expression.getText(sf))) add(F('no-debug', file, lineOf(sf, node), 'console output left in source.', node.getText(sf)))
    if (node.kind === ts.SyntaxKind.DebuggerStatement) add(F('no-debug', file, lineOf(sf, node), 'debugger statement left in source.', 'debugger'))
    if (node.kind === ts.SyntaxKind.AnyKeyword) add(F('no-any', file, lineOf(sf, node), '`any` hides mistakes. Use a real type, or unknown. A genuine boundary can carry lint-allow(no-any) with a reason.', 'any'))
    ts.forEachChild(node, visit)
  }
  visit(sf)

  // Comments: TODO and friends, and commented-out code
  text.split('\n').forEach((l, i) => {
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(l)) add(F('no-todo', file, i + 1, 'Unfinished marker in source. Do it, or open an issue.', l.trim()))
  })

  if (isComponent) {
    const limit = textBudgetOverrides[file.split('/').pop()] ?? textBudget
    if (staticWords > limit) add(F('text-budget', file, 1, `${staticWords} words of static text in this component (budget ${limit}). The component is carrying too much prose. Cut it or fold it into a title attribute.`, `${staticWords} words`))
  }
  return { findings: out, staticWords }
}

/** Plain-text rules for files the TypeScript parser should not read: demo data, scripts and the sample generator. */
export function lintPlain(text, file) {
  const out = []
  const okLines = allowed(text)
  text.split('\n').forEach((l, i) => {
    if (okLines.get(i + 1)?.has('placeholder-data')) return
    if (PLACEHOLDER.test(l)) out.push(F('placeholder-data', file, i + 1, 'Placeholder data. Use believable names and figures for the product.', l.trim()))
    if (EMOJI.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)) out.push(F('no-emoji', file, i + 1, 'Emoji and symbol glyphs as UI. Use the inline marks in icons.tsx or words.', l.trim()))
  })
  return out
}
