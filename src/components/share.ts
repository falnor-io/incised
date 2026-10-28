export type ShareFigure = { label: string; value: string }
export type ShareCard = { title: string; verdict: string; tone?: 'good' | 'warn' | 'bad'; figures: ShareFigure[]; footer?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const INK = { good: '#1f7a4d', warn: '#a8620c', bad: '#b3261e' } as const

/**
 * A 1200 by 630 card as an SVG string, for link previews and pasted summaries. Plain text and shapes only, with
 * no fonts or images to load, so it renders anywhere and can be saved as a file. Up to four figures are drawn.
 */
export function shareCardSvg(c: ShareCard): string {
  const figs = c.figures.slice(0, 4)
  const w = figs.length ? 1040 / figs.length : 1040
  const cells = figs.map((f, i) => `<text x="${80 + i * w}" y="430" font-size="64" font-weight="600" fill="#15181d">${esc(f.value)}</text><text x="${80 + i * w}" y="476" font-size="26" fill="#5b6470">${esc(f.label)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="system-ui, sans-serif"><rect width="1200" height="630" fill="#f6f4ef"/><text x="80" y="140" font-size="30" fill="#5b6470">${esc(c.title)}</text><text x="80" y="260" font-size="84" font-weight="700" fill="${INK[c.tone ?? 'good']}">${esc(c.verdict)}</text>${cells}${c.footer ? `<text x="80" y="570" font-size="24" fill="#5b6470">${esc(c.footer)}</text>` : ''}</svg>`
}

// Mail clients drop quoted family names inside style attributes, so the stack is written without them.
const MAIL_FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'
const TONE_HEX = { good: '#1f7a4d', warn: '#a8620c', bad: '#b3261e' } as const

/**
 * The same card as an email-safe HTML table: inline styles and no scripts, fonts or images, so it survives a mail client.
 * Open it in a browser and print for a PDF; the layout is one column at 600px.
 */
export function shareCardHtml(c: ShareCard): string {
  const figs = c.figures.slice(0, 4).map((f) => `<td style="padding:12px 16px 0 0;vertical-align:top"><div style="font-size:22px;font-weight:600;color:#15181d">${esc(f.value)}</div><div style="font-size:13px;color:#5b6470">${esc(f.label)}</div></td>`).join('')
  return `<table role="presentation" width="600" style="max-width:100%;border:1px solid #e3e5ea;border-radius:10px;background:#ffffff;font-family:${MAIL_FONT}"><tr><td style="padding:20px 24px"><div style="font-size:14px;color:#5b6470">${esc(c.title)}</div><div style="font-size:26px;font-weight:600;margin-top:6px;color:${TONE_HEX[c.tone ?? 'good']}">${esc(c.verdict)}</div>${figs ? `<table role="presentation"><tr>${figs}</tr></table>` : ''}${c.footer ? `<div style="font-size:12px;color:#5b6470;margin-top:16px">${esc(c.footer)}</div>` : ''}</td></tr></table>`
}

/** The card as plain text, for a plain-text email part or a chat message. */
export function shareCardText(c: ShareCard): string {
  return [c.title, c.verdict, ...c.figures.map((f) => `${f.label}: ${f.value}`), ...(c.footer ? [c.footer] : [])].join('\n')
}

/** A card for a verified record, written only from what the verifier returned: the verdict, events, and guarantees honored. */
export function recordCard(r: { ok: boolean; engagement: string; ledger: { events: number; intact: boolean }; guarantees: { status: string }[]; verifiedAt: string }): ShareCard {
  const honored = r.guarantees.filter((g) => g.status === 'honored' || g.status === 'remedied').length
  return {
    title: r.engagement,
    verdict: r.ok ? 'Verified' : 'Not verified',
    tone: r.ok ? 'good' : 'bad',
    figures: [
      { label: 'ledger events', value: String(r.ledger.events) },
      { label: 'ledger', value: r.ledger.intact ? 'intact' : 'broken' },
      { label: 'guarantees met', value: `${honored} of ${r.guarantees.length}` },
    ],
    footer: `Verified ${r.verifiedAt}`,
  }
}
