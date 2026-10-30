/**
 * Small inline-SVG icons for the DOM overlays, ported from the UI mockups (docs/mockups).
 * Pure string builders: no DOM access, safe to unit-test.
 */
import { DRINK_IDS } from '../data/drinks';
import type { DrinkId, ItemKind, SupplyId } from '../sim/types';

const CHROME = '<linearGradient id="ui-chrome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b7c3c9"/><stop offset=".45" stop-color="#f6fafb"/><stop offset="1" stop-color="#9fadb4"/></linearGradient>';

function itemShape(kind: ItemKind): string {
  if (kind === 'grounds')
    return '<rect x="2" y="-3" width="14" height="5" rx="2.5" fill="#2b2b30"/><ellipse cx="-4" cy="0" rx="10" ry="6" fill="url(#ui-chrome)" stroke="#7d8a91" stroke-width="1"/><ellipse cx="-4" cy="-1" rx="7" ry="3.6" fill="#5b3a24"/>';
  if (kind === 'espresso')
    return '<ellipse cx="0" cy="6" rx="12" ry="3.5" fill="#fff" stroke="#e5d6c2"/><path d="M-7 -6 h14 l-2 11 h-10z" fill="#fff" stroke="#e5d6c2"/><ellipse cx="0" cy="-6" rx="7" ry="2.2" fill="#5a3320"/><path d="M7 -3 q5 1 1 5" stroke="#fff" stroke-width="2.4" fill="none"/>';
  if (kind === 'latte')
    return '<path d="M-8 -12 h16 l-2 20 h-12z" fill="#fff" stroke="#e5d6c2"/><rect x="-8.5" y="-6" width="17" height="6" fill="#e0564a" opacity=".85"/><ellipse cx="0" cy="-12" rx="8" ry="2.6" fill="#e9c79c"/><path d="M-2.5 -12.5 q2.5 -2.5 5 0 q-2.5 2 -5 0" fill="#fff"/>';
  if (kind === 'icedLatte')
    return '<path d="M-8 -12 h16 l-2 20 h-12z" fill="#c9e7f7" opacity=".9" stroke="#9fc9e2"/><path d="M-7.5 -8 h15 l-1.7 15.5 h-11.6z" fill="#c89a6a"/><path d="M-7.3 -1 h14.6 l-1 8.5 h-12.6z" fill="#e8d2b4" opacity=".8"/><rect x="-5" y="-7" width="5" height="5" rx="1" fill="#e6f5ff" opacity=".85"/><rect x="1" y="-4" width="4.5" height="4.5" rx="1" fill="#e6f5ff" opacity=".8"/><rect x="2" y="-21" width="2.6" height="14" rx="1" fill="#e0564a" transform="rotate(12 3 -14)"/>';
  if (kind === 'mocha')
    return '<path d="M-8 -10 h16 l-2 18 h-12z" fill="#fff" stroke="#e5d6c2"/><rect x="-8" y="-4" width="16" height="6" fill="#6b3a22" opacity=".9"/><circle cx="-4" cy="-11" r="4" fill="#fff8ee" stroke="#ead9c2"/><circle cx="3" cy="-11" r="4.5" fill="#fff8ee" stroke="#ead9c2"/><circle cx="0" cy="-15" r="3.6" fill="#fff8ee" stroke="#ead9c2"/><path d="M-5 -12 q3 -3 5 0 q3 -3 5 0" stroke="#6b3a22" stroke-width="1.6" fill="none"/>';
  if (kind === 'matcha')
    return '<path d="M-8 -12 h16 l-2 20 h-12z" fill="#fff" stroke="#e5d6c2"/><rect x="-8.5" y="-6" width="17" height="6" fill="#6fa84a" opacity=".9"/><ellipse cx="0" cy="-12" rx="8" ry="2.6" fill="#a8d07a"/><path d="M-3 -12.4 q3 -3 6 0 q-3 2 -6 0" fill="#e9f5dc"/>';
  if (kind === 'special')
    return '<path d="M-8 -12 h16 l-2 20 h-12z" fill="#c9e7f7" opacity=".9" stroke="#9fc9e2"/><path d="M-7.3 -4 h14.6 l-1.3 11.5 h-12z" fill="#5b3420"/><path d="M-7.9 -12 h15.8 l-.6 8 h-14.6z" fill="#f2c48d"/><path d="M0 -19 l1.6 2.6 2.8 -1 -1 2.8 2.4 1.4 -3.4.6 .4 2.6 -2.8 -1.8 -2.8 1.8 .4 -2.6 -3.4 -.6 2.4 -1.4 -1 -2.8 2.8 1z" fill="#d9542b"/>';
  if (kind === 'americano')
    return '<path d="M-7 -11 h14 l-1 19 h-12z" fill="#fff" stroke="#e5d6c2"/><ellipse cx="0" cy="-11" rx="7" ry="2.3" fill="#3e2416"/><path d="M7 -7 q6 2 0 9" stroke="#fff" stroke-width="2.4" fill="none"/><path d="M-2 -14 q-3 -4 1 -7" stroke="#c9b9a6" stroke-width="1.4" fill="none"/>';
  if (kind === 'cappuccino')
    return '<ellipse cx="0" cy="7" rx="11" ry="3" fill="#fff" stroke="#e5d6c2"/><path d="M-9 -6 h18 l-3 12 h-12z" fill="#fff" stroke="#e5d6c2"/><rect x="-8.4" y="-2" width="16.8" height="4" fill="#4c8fd6" opacity=".85"/><ellipse cx="0" cy="-7" rx="9" ry="5.5" fill="#fff8ee" stroke="#ead9c2"/><circle cx="-3" cy="-8" r=".9" fill="#8a5a3a"/><circle cx="1" cy="-10" r=".9" fill="#8a5a3a"/><circle cx="3" cy="-7" r=".9" fill="#8a5a3a"/>';
  if (kind === 'drip')
    return '<path d="M-7 -9 h14 v17 h-14z" fill="#e8e1d6" stroke="#c9bca8"/><rect x="-7" y="-3" width="14" height="3" fill="#7fcfb4"/><ellipse cx="0" cy="-9" rx="7" ry="2.2" fill="#4a2a18"/><path d="M7 -5 q6 2 0 9" stroke="#e8e1d6" stroke-width="2.6" fill="none"/>';
  return '<path d="M-8 -12 h16 l-2 20 h-12z" fill="#c9e7f7" opacity=".9" stroke="#9fc9e2"/><path d="M-7.3 -6 h14.6 l-1.4 13.5 h-11.8z" fill="#5b3420"/><rect x="-5" y="-5" width="5" height="5" rx="1" fill="#e6f5ff" opacity=".85"/><rect x="1" y="-2" width="4.5" height="4.5" rx="1" fill="#e6f5ff" opacity=".8"/><rect x="2" y="-21" width="2.6" height="14" rx="1" fill="#7fcfb4" transform="rotate(12 3 -14)"/>';
}

/** A held item or drink, drawn like the scene's props. */
export const itemIcon = (kind: ItemKind, size = 28): string =>
  `<svg class="ic-item" width="${size}" height="${size}" viewBox="-16 -18 32 32" aria-hidden="true">${kind === 'grounds' ? `<defs>${CHROME}</defs>` : ''}<g transform="scale(1.1)">${itemShape(kind)}</g></svg>`;

export const coin = (s = 22): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f6c35b" stroke="#c9902a" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="700" font-size="12" fill="#9a6a14">$</text></svg>`;

let starSeq = 0;
/** A star filled from 0 (empty) to 1 (full). */
export const star = (fill = 1, s = 18): string => {
  const id = `ui-sg${starSeq++}`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}"><stop offset="${fill}" stop-color="#f6c35b"/><stop offset="${fill}" stop-color="#e9d9c0"/></linearGradient></defs><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill="url(#${id})" stroke="#c9902a" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
};

/** Five stars for a 0..5 rating, in halves. */
export function stars(rating: number, s = 18): string {
  const r = Math.round(Math.max(0, Math.min(5, rating)) * 2) / 2;
  let out = '';
  for (let i = 0; i < 5; i++) out += star(Math.max(0, Math.min(1, r - i)), s);
  return out;
}

export const sun = (s = 26): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="#f6c35b"/>${[0, 45, 90, 135, 180, 225, 270, 315]
    .map((a) => `<rect x="11" y="1.5" width="2" height="4" rx="1" fill="#f6c35b" transform="rotate(${a} 12 12)"/>`)
    .join('')}</svg>`;

export const moon = (s = 26): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3a9 9 0 1 0 6 13A7.5 7.5 0 0 1 15 3z" fill="#ffd98a"/><circle cx="19" cy="5" r="1" fill="#fff"/><circle cx="21" cy="10" r=".7" fill="#fff"/></svg>`;

/** A pantry jar filled 0..1 with a colour. */
export const jar = (fill: number, color: string, s = 28): string => {
  const f = Math.max(0, Math.min(1, fill));
  return `<svg width="${s}" height="${s * 1.2}" viewBox="0 0 30 36" aria-hidden="true"><rect x="4" y="6" width="22" height="28" rx="6" fill="#ffffffaa" stroke="#e6d2b4" stroke-width="1.5"/><rect x="5.5" y="${(7.5 + 25 * (1 - f)).toFixed(1)}" width="19" height="${(25 * f).toFixed(1)}" rx="4.5" fill="${color}"/><rect x="3" y="2" width="24" height="6" rx="2.5" fill="#7b4c2f"/><rect x="8" y="12" width="4" height="14" rx="2" fill="#fff" opacity=".5"/></svg>`;
};

export const SUPPLY_COLOR: Record<SupplyId, string> = { beans: '#7b4a2c', milk: '#f4efe6', concentrate: '#5b3420', flavour: '#d9862b', pastry: '#e0a95a' };

export const logoCup = (s = 30): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 12h18v8a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8z" fill="#e08a3c"/><path d="M23 14h2a4 4 0 0 1 0 8h-2" stroke="#e08a3c" stroke-width="3" fill="none"/><path d="M11 4q2 3 0 5M16 3q2 3 0 6" stroke="#fff4e2" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;

export const pauseGlyph = (s = 18): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 18 18" aria-hidden="true"><rect x="3" y="2" width="4" height="14" rx="2" fill="currentColor"/><rect x="11" y="2" width="4" height="14" rx="2" fill="currentColor"/></svg>`;

/** A speaker, with sound waves or (muted) a cross. */
export const speakerGlyph = (muted: boolean, s = 18): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3l4-3.5v12l-4-3.5H2z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>${
    muted
      ? '<path d="M12 6.5l4 5M16 6.5l-4 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>'
      : '<path d="M11.5 6.5a3.5 3.5 0 0 1 0 5M13.5 4.5a6.4 6.4 0 0 1 0 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
  }</svg>`;

export const DRINKS: DrinkId[] = DRINK_IDS;
