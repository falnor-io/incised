import { Link } from '@tanstack/react-router';
import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import 'orlune/styles.css';
import { entries, groups, type PlaygroundEntry } from './entries';
import { brief, codeFor, controlsFor, decodeShare, encodeShare, kebab, type Props, parseProps, withKey } from './lib';

type Tab = 'controls' | 'json' | 'code' | 'events';
type Width = 'full' | 768 | 480 | 360;
type LogLine = { id: number; name: string; text: string };

const pretty = (v: unknown) => JSON.stringify(v, null, 2);
const WIDTHS: Width[] = ['full', 768, 480, 360];

// A component that throws on props it cannot use should say so in the preview, not blank the page.
class Guard extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.error ? (
      <div className="pg-error" role="alert">
        <b>This component could not draw these props.</b>
        <p>{this.state.error}</p>
      </div>
    ) : (
      this.props.children
    );
  }
}

export function Playground() {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('Funnel');
  const [defaults, setDefaults] = useState<Props>({});
  const [props, setProps] = useState<Props>({});
  const [text, setText] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [width, setWidth] = useState<Width>('full');
  const [still, setStill] = useState(false);
  const [tab, setTab] = useState<Tab>('controls');
  const [log, setLog] = useState<LogLine[]>([]);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const shared = useRef<{ name?: string; props?: Props }>({});
  const lineId = useRef(0);

  const entry: PlaygroundEntry = entries.find((e) => e.name === name) ?? entries[0]!;

  // Read the link once, after mount, then follow the site's theme.
  useEffect(() => {
    shared.current = decodeShare(window.location.search);
    if (shared.current.name && entries.some((e) => e.name === shared.current.name)) setName(shared.current.name);
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    setMounted(true);
  }, []);

  // Open an entry: its starting props, plus whatever it has to load first.
  useEffect(() => {
    if (!mounted) return;
    let live = true;
    setLoading(Boolean(entry.load));
    const open = (loaded: Props) => {
      if (!live) return;
      const base = { ...entry.props, ...loaded };
      const fromLink = shared.current.name === entry.name ? shared.current.props : undefined;
      shared.current = {};
      const next = fromLink ? { ...base, ...fromLink } : base;
      setDefaults(base);
      setProps(next);
      setText(pretty(next));
      setJsonError(null);
      setLog([]);
      setRev((r) => r + 1);
      setLoading(false);
    };
    if (entry.load) entry.load().then(open, () => open({}));
    else open({});
    return () => {
      live = false;
    };
  }, [mounted, entry]);

  // Keep the address in step, so the page can be shared as it stands.
  useEffect(() => {
    if (!mounted || loading) return;
    window.history.replaceState(null, '', `?${encodeShare(entry.name, defaults, props)}`);
  }, [mounted, loading, entry.name, defaults, props]);

  const eventProps = useMemo(
    () =>
      Object.fromEntries(
        (entry.events ?? []).map((n) => [
          n,
          (...args: unknown[]) => setLog((l) => [{ id: ++lineId.current, name: n, text: args.map((a) => brief(a)).join(', ') }, ...l].slice(0, 50)),
        ]),
      ),
    [entry],
  );

  const live = useMemo(() => {
    try {
      return { props: { ...(entry.adapt ? entry.adapt(props) : props), ...eventProps }, error: null as string | null };
    } catch (e) {
      return { props: {}, error: e instanceof Error ? e.message : String(e) };
    }
  }, [entry, props, eventProps]);

  const set = (next: Props) => {
    setProps(next);
    setText(pretty(next));
    setJsonError(null);
    setRev((r) => r + 1);
  };
  const onText = (t: string) => {
    setText(t);
    const r = parseProps(t);
    if (r.ok) {
      setProps(r.value);
      setJsonError(null);
      setRev((n) => n + 1);
    } else setJsonError(r.error);
  };
  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    } catch {
      setCopied(null);
    }
  };

  const needle = query.trim().toLowerCase();
  const shown = entries.filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.summary.toLowerCase().includes(needle));
  const controls = controlsFor(props);
  const Live = entry.component;
  const code = codeFor(entry.name, props, entry.events);

  return (
    <div className="pg">
      <aside className="pg-list" aria-label="Components">
        <input
          className="pg-input"
          type="search"
          placeholder="Find a component"
          aria-label="Find a component"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {groups.map((g) => {
          const items = shown.filter((e) => e.group === g);
          if (items.length === 0) return null;
          return (
            <div key={g} className="pg-group">
              <p className="pg-group-name">{g}</p>
              {items.map((e) => (
                <button key={e.name} type="button" className="pg-item" aria-current={e.name === entry.name ? 'true' : undefined} onClick={() => setName(e.name)}>
                  {e.name}
                </button>
              ))}
            </div>
          );
        })}
        {shown.length === 0 && <p className="pg-muted">Nothing matches.</p>}
      </aside>

      <section className="pg-main" aria-label={`${entry.name} preview`}>
        <header className="pg-head">
          <div>
            <h1 className="pg-title">{entry.name}</h1>
            <p className="pg-muted">{entry.summary}</p>
          </div>
          <div className="pg-actions">
            <Link to="/docs/$" params={{ _splat: `components/${kebab(entry.name)}` }} className="pg-btn">
              Docs
            </Link>
            <button type="button" className="pg-btn" onClick={() => copy('link', window.location.href)}>
              {copied === 'link' ? 'Link copied' : 'Copy link'}
            </button>
          </div>
        </header>

        <div className="pg-toolbar" role="toolbar" aria-label="Preview options">
          <fieldset className="pg-seg">
            <legend className="pg-sr">Theme</legend>
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>
                {t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </fieldset>
          <fieldset className="pg-seg">
            <legend className="pg-sr">Width</legend>
            {WIDTHS.map((w) => (
              <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>
                {w === 'full' ? 'Full' : `${w}`}
              </button>
            ))}
          </fieldset>
          <label className="pg-check">
            <input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} /> Stop motion
          </label>
          {entry.presets && entry.presets.length > 0 && (
            <fieldset className="pg-seg">
              <legend className="pg-sr">Presets</legend>
              {entry.presets.map((p) => (
                <button key={p.label} type="button" onClick={() => set({ ...defaults, ...p.props })}>
                  {p.label}
                </button>
              ))}
            </fieldset>
          )}
          <button type="button" className="pg-btn" onClick={() => set(defaults)}>
            Reset
          </button>
        </div>

        <div className={`pg-canvas${still ? ' pg-still' : ''}`} data-theme={theme}>
          <div className="pg-frame" style={{ maxWidth: width === 'full' ? undefined : width }}>
            {!mounted || loading ? (
              <div className="pg-wait" aria-hidden="true" />
            ) : live.error ? (
              <div className="pg-error" role="alert">
                <b>These props could not be turned into a component.</b>
                <p>{live.error}</p>
              </div>
            ) : (
              <Guard key={`${entry.name}-${rev}`}>
                <Live {...live.props} />
              </Guard>
            )}
          </div>
        </div>
      </section>

      <aside className="pg-panel" aria-label="Props">
        <div className="pg-tabs" role="tablist" aria-label="Props panel">
          {(['controls', 'json', 'code', 'events'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === 'controls' ? 'Controls' : t === 'json' ? 'JSON' : t === 'code' ? 'Code' : `Events${log.length ? ` (${log.length})` : ''}`}
            </button>
          ))}
        </div>

        {tab === 'controls' && (
          <div className="pg-controls" role="tabpanel">
            {controls.length === 0 && <p className="pg-muted">No props yet.</p>}
            {controls.map((c) => (
              <div key={c.key} className="pg-control">
                <label htmlFor={`pg-${c.key}`}>{c.key}</label>
                {c.kind === 'string' &&
                  (String(c.value).length > 50 ? (
                    <textarea id={`pg-${c.key}`} className="pg-input" rows={3} value={String(c.value)} onChange={(e) => set(withKey(props, c.key, e.target.value))} />
                  ) : (
                    <input id={`pg-${c.key}`} className="pg-input" value={String(c.value)} onChange={(e) => set(withKey(props, c.key, e.target.value))} />
                  ))}
                {c.kind === 'number' && (
                  <input
                    id={`pg-${c.key}`}
                    className="pg-input"
                    type="number"
                    step="any"
                    value={Number.isFinite(c.value as number) ? (c.value as number) : ''}
                    onChange={(e) => e.target.value !== '' && set(withKey(props, c.key, Number(e.target.value)))}
                  />
                )}
                {c.kind === 'boolean' && <input id={`pg-${c.key}`} type="checkbox" checked={c.value as boolean} onChange={(e) => set(withKey(props, c.key, e.target.checked))} />}
                {c.kind === 'json' && (
                  <button type="button" className="pg-link" onClick={() => setTab('json')}>
                    {Array.isArray(c.value) ? `${c.value.length} items` : c.value === null ? 'null' : 'object'}, edit as JSON
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'json' && (
          <div className="pg-json" role="tabpanel">
            <textarea className="pg-code" spellCheck={false} value={text} aria-label="Props as JSON" aria-invalid={Boolean(jsonError)} onChange={(e) => onText(e.target.value)} />
            {jsonError ? (
              <p className="pg-error-text" role="alert">
                {jsonError}. The preview keeps the last props that were valid.
              </p>
            ) : (
              <p className="pg-muted">Valid. The preview updates as you type.</p>
            )}
          </div>
        )}

        {tab === 'code' && (
          <div className="pg-json" role="tabpanel">
            <pre className="pg-code pg-pre" tabIndex={0}>{code}</pre>
            <button type="button" className="pg-btn" onClick={() => copy('code', code)}>
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
          </div>
        )}

        {tab === 'events' && (
          <div className="pg-json" role="tabpanel">
            {(entry.events ?? []).length === 0 ? (
              <p className="pg-muted">This component has no callbacks to log.</p>
            ) : log.length === 0 ? (
              <p className="pg-muted">Try it. Each call to {(entry.events ?? []).join(', ')} shows here.</p>
            ) : (
              <>
                <ul className="pg-log" aria-live="polite">
                  {log.map((l) => (
                    <li key={l.id}>
                      <b>{l.name}</b> <span>{l.text}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="pg-btn" onClick={() => setLog([])}>
                  Clear
                </button>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
