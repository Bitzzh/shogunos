/**
 * Offline icon set for the Slide Designer.
 *
 * The app previously referenced a "ti ti-*" icon font (Tabler Icons) in a
 * few places, but no such font/package was ever bundled — those classNames
 * render nothing. Since ShogunOS is offline-first and pulling a webfont
 * from a CDN isn't an option, icons here are small hand-authored inline
 * SVGs (stroke-based, 24x24 viewBox, `currentColor`) bundled directly in
 * the app. No network, no font file, no external dependency.
 *
 * `svg` holds the *inner* markup of each icon (the <path>/<line>/<circle>
 * elements) rather than a full <svg> — that lets both the React editor
 * (SlideIcon below) and the plain-JS live.html renderer share the same
 * shape definitions without sharing a build step (live.html is a static
 * file, not bundled). See the ICON_DEFS mirror at the top of live.html —
 * if you add/change an icon here, update it there too.
 */

import type { CSSProperties } from 'react'

export interface IconDef {
  id: string
  label: string
  svg: string // inner SVG markup, uses currentColor via inherited `stroke`
}

export const ICONS: IconDef[] = [
  { id: 'cross',    label: 'Cross',    svg: '<line x1="12" y1="2" x2="12" y2="22"/><line x1="5" y1="8" x2="19" y2="8"/>' },
  { id: 'heart',    label: 'Heart',    svg: '<path d="M12 20 C12 20 3 13.5 3 8.5 C3 5.5 5.5 3 8.5 3 C10.2 3 11.4 3.9 12 5 C12.6 3.9 13.8 3 15.5 3 C18.5 3 21 5.5 21 8.5 C21 13.5 12 20 12 20 Z"/>' },
  { id: 'star',     label: 'Star',     svg: '<polygon points="12,2 14.9,9.1 22,9.6 16.5,14.3 18.2,21.3 12,17.3 5.8,21.3 7.5,14.3 2,9.6 9.1,9.1"/>' },
  { id: 'dove',     label: 'Dove',     svg: '<path d="M3 15 C7 10 10 9 13 9 C13 9 12 7 14 5 C14 8 16 8 17 7 C16.5 9 15 10 13 10.5 C16 11 19 12 21 10 C19 15 14 17 9 16.5 C6.5 16.5 4.5 16 3 15 Z"/>' },
  { id: 'book',     label: 'Book',     svg: '<path d="M12 6 C10 4.5 6.5 4 4 4.5 L4 18 C6.5 17.5 10 18 12 19.5 C14 18 17.5 17.5 20 18 L20 4.5 C17.5 4 14 4.5 12 6 Z"/><line x1="12" y1="6" x2="12" y2="19.5"/>' },
  { id: 'music',    label: 'Music',    svg: '<circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/><path d="M9 18 V4 L19 2 V16"/>' },
  { id: 'flame',    label: 'Flame',    svg: '<path d="M12 2 C9 6 7 9 7 12.5 C7 16 9.5 18 12 18 C14.5 18 17 16 17 12.5 C17 11 16.3 9.5 15.3 8.5 C15.3 10 14.3 11 13.3 10.7 C13.9 8.5 12.8 5.5 12 2 Z"/>' },
  { id: 'sun',      label: 'Sun',      svg: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="4.2" y1="4.2" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"/><line x1="4.2" y1="19.8" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.8" y2="4.2"/>' },
  { id: 'bell',     label: 'Bell',     svg: '<path d="M12 3 C9.5 3 8 5 8 8 C8 12 6.5 13 6 14.5 H18 C17.5 13 16 12 16 8 C16 5 14.5 3 12 3 Z"/><path d="M10 17 C10 18.5 10.9 19.5 12 19.5 C13.1 19.5 14 18.5 14 17"/>' },
  { id: 'mic',      label: 'Mic',      svg: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11 C5 15 8 18 12 18 C16 18 19 15 19 11"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>' },
  { id: 'calendar', label: 'Calendar', svg: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>' },
  { id: 'gift',     label: 'Gift',     svg: '<rect x="3" y="9" width="18" height="12" rx="1"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="12" y1="9" x2="12" y2="21"/><path d="M12 9 C12 9 9 9 8 6.5 C7.3 4.8 8.7 3 10.3 3.5 C11.8 4 12 6.5 12 9 Z"/><path d="M12 9 C12 9 15 9 16 6.5 C16.7 4.8 15.3 3 13.7 3.5 C12.2 4 12 6.5 12 9 Z"/>' },
  { id: 'globe',    label: 'Globe',    svg: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/>' },
  { id: 'quote',    label: 'Quote',    svg: '<path d="M7 8 C5 8 4 9.5 4 11.5 C4 13.5 5.5 15 7.5 15 L6.5 20"/><path d="M16 8 C14 8 13 9.5 13 11.5 C13 13.5 14.5 15 16.5 15 L15.5 20"/>' },
  { id: 'frame',    label: 'Slide',    svg: '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="15.5" x2="9" y2="10.5" stroke-linejoin="round"/><line x1="9" y1="10.5" x2="13" y2="13.5"/><line x1="13" y1="13.5" x2="16" y2="10.5"/><line x1="16" y1="10.5" x2="21" y2="15"/><circle cx="8" cy="9" r="1.4" fill="currentColor" stroke="none"/>' },
]

export const ICON_MAP: Record<string, IconDef> = Object.fromEntries(ICONS.map(i => [i.id, i]))

// Where the icon sits relative to the slide. 'behind' centers a large,
// low-opacity icon behind the text — a watermark rather than a badge.
export type IconPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'behind'

export const ICON_POSITIONS: { id: IconPosition; label: string }[] = [
  { id: 'top-left',      label: '↖' },
  { id: 'top-center',    label: '↑' },
  { id: 'top-right',     label: '↗' },
  { id: 'bottom-left',   label: '↙' },
  { id: 'bottom-center', label: '↓' },
  { id: 'bottom-right',  label: '↘' },
  { id: 'behind',        label: '⊙' },
]

export function iconPositionStyle(pos: string | undefined, small = false): CSSProperties {
  const pad = small ? 4 : 24
  const base: CSSProperties = { position: 'absolute', zIndex: pos === 'behind' ? 0 : 2, pointerEvents: 'none' }
  switch (pos) {
    case 'top-left':      return { ...base, top: pad, left: pad }
    case 'top-right':     return { ...base, top: pad, right: pad }
    case 'bottom-left':   return { ...base, bottom: pad, left: pad }
    case 'bottom-right':  return { ...base, bottom: pad, right: pad }
    case 'bottom-center': return { ...base, bottom: pad, left: '50%', transform: 'translateX(-50%)' }
    case 'behind':        return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.16 }
    case 'top-center':
    default:              return { ...base, top: pad, left: '50%', transform: 'translateX(-50%)' }
  }
}

export function SlideIcon({ id, color = '#ffffff', size = 48, style }: { id: string; color?: string; size?: number; style?: CSSProperties }) {
  const def = ICON_MAP[id]
  if (!def) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: def.svg }}
    />
  )
}
