/** Small inline marks, so no component depends on emoji or symbol fonts. They inherit the current colour. */
const base = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const

export const Check = () => <svg {...base} className="kl-icon"><path d="M2.5 7.5 5.6 10.5 11.5 3.8" /></svg>
export const Cross = () => <svg {...base} className="kl-icon"><path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" /></svg>
export const Lock = ({ open }: { open?: boolean }) => (
  <svg {...base} className="kl-icon"><rect x="2.6" y="6.2" width="8.8" height="6" rx="1.4" />{open ? <path d="M4.6 6.2V4.4a2.4 2.4 0 0 1 4.6-.9" /> : <path d="M4.6 6.2V4.4a2.4 2.4 0 0 1 4.8 0v1.8" />}</svg>
)
export const Fit = () => <svg {...base} className="kl-icon"><path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" /></svg>
