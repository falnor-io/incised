import { useState } from 'react'
import { useCopy } from './hooks.js'
import { cx } from './util.js'

const MAX_CHILDREN = 100

type Props = { value: unknown; label?: string; defaultExpandDepth?: number; maxString?: number; className?: string }

/**
 * A collapsible view of any JSON-like value: typed colours, click a key to copy its path, long strings fold,
 * big arrays show the first 100 entries, and circular references are cut instead of looped on.
 */
export function JsonTree({ value, label = 'root', defaultExpandDepth = 1, maxString = 160, className }: Props) {
  return (
    <div className={cx('ic-json', className)} role="tree" aria-label={label}>
      <Node name={label} path="$" value={value} depth={0} open={defaultExpandDepth} maxString={maxString} seen={new WeakSet()} />
    </div>
  )
}

function kindOf(v: unknown): 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'other' {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return 'array'
  const t = typeof v
  if (t === 'object') return 'object'
  if (t === 'string' || t === 'number' || t === 'boolean') return t
  return 'other'
}

function Node({ name, path, value, depth, open, maxString, seen }: { name: string; path: string; value: unknown; depth: number; open: number; maxString: number; seen: WeakSet<object> }) {
  const kind = kindOf(value)
  const container = kind === 'array' || kind === 'object'
  const [expanded, setExpanded] = useState(depth < open)
  const [full, setFull] = useState(false)
  const [copied, copy] = useCopy()
  const cyclic = container && seen.has(value as object)

  const entries: [string, unknown][] = !container || cyclic ? [] : kind === 'array' ? (value as unknown[]).map((v, i) => [String(i), v]) : Object.entries(value as object)
  if (container && !cyclic) seen.add(value as object)
  const [shown, setShown] = useState(MAX_CHILDREN)

  const keyEl = (
    <button type="button" className="ic-json-key" onClick={() => copy(path)} title={`Copy path ${path}`}>
      {name}
      {copied && <span className="ic-json-copied"> copied</span>}
    </button>
  )

  if (!container || cyclic) {
    const text = cyclic ? '[circular]' : kind === 'string' ? (value as string) : kind === 'null' ? 'null' : String(value)
    const long = kind === 'string' && text.length > maxString
    return (
      <div className="ic-json-row" role="treeitem" aria-selected="false" style={{ paddingLeft: depth * 14 }}>
        <span className="ic-json-twist" aria-hidden="true" />
        {keyEl}
        <span className="ic-json-colon">:</span>{' '}
        <span className="ic-json-val" data-kind={cyclic ? 'other' : kind}>
          {kind === 'string' ? `"${long && !full ? text.slice(0, maxString) + '…' : text}"` : text}
        </span>
        {long && <button type="button" className="ic-json-more" onClick={() => setFull((f) => !f)}>{full ? 'show less' : `show all ${text.length}`}</button>}
      </div>
    )
  }

  const count = entries.length
  const bracket = kind === 'array' ? ['[', ']'] : ['{', '}']
  return (
    <div role="treeitem" aria-expanded={expanded} aria-selected="false">
      <div className="ic-json-row" style={{ paddingLeft: depth * 14 }}>
        <button type="button" className="ic-json-twist" onClick={() => setExpanded((e) => !e)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}>{expanded ? '▾' : '▸'}</button>
        {keyEl}
        <span className="ic-json-colon">:</span>{' '}
        <span className="ic-json-punct">{bracket[0]}{!expanded && <span className="ic-json-summary"> {count} {kind === 'array' ? (count === 1 ? 'item' : 'items') : count === 1 ? 'key' : 'keys'} </span>}{!expanded && bracket[1]}</span>
      </div>
      {expanded && (
        <div role="group">
          {entries.slice(0, shown).map(([k, v]) => (
            <Node key={k} name={k} path={kind === 'array' ? `${path}[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`} value={v} depth={depth + 1} open={open} maxString={maxString} seen={seen} />
          ))}
          {count > shown && <div className="ic-json-row" style={{ paddingLeft: (depth + 1) * 14 }}><button type="button" className="ic-json-more" onClick={() => setShown((s) => s + MAX_CHILDREN)}>show {Math.min(MAX_CHILDREN, count - shown)} more of {count - shown} left</button></div>}
          <div className="ic-json-row ic-json-punct" style={{ paddingLeft: depth * 14 }}><span className="ic-json-twist" aria-hidden="true" />{bracket[1]}</div>
        </div>
      )}
    </div>
  )
}
