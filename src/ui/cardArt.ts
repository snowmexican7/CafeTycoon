/** Header art for the night-shop index cards, one per catalogue category (from docs/mockups/night.png). */
import type { CatalogueItem } from '../sim/types';

type Category = CatalogueItem['category'];

const svg = (inner: string) => `<svg width="110" height="96" viewBox="0 0 110 96" aria-hidden="true">${inner}</svg>`;

const ART: Record<Category, string> = {
  equipment: svg(
    '<ellipse cx="55" cy="86" rx="44" ry="7" fill="#0002"/><rect x="18" y="26" width="74" height="54" rx="12" fill="#e0564a"/><rect x="18" y="20" width="74" height="12" rx="6" fill="#dfe6ea"/><circle cx="55" cy="46" r="9" fill="#fff" stroke="#9aa7ae" stroke-width="3"/><path d="M55 46l6-4" stroke="#e0564a" stroke-width="2.5"/><rect x="30" y="58" width="14" height="10" rx="3" fill="#dfe6ea"/><rect x="66" y="58" width="14" height="10" rx="3" fill="#dfe6ea"/><rect x="36" y="66" width="20" height="5" rx="2.5" fill="#2b2b30" transform="rotate(12 36 66)"/><rect x="72" y="66" width="20" height="5" rx="2.5" fill="#2b2b30" transform="rotate(12 72 66)"/><path d="M42 10q4 5 0 9M56 6q4 6 0 11M70 10q4 5 0 9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>',
  ),
  marketing: svg(
    '<rect x="22" y="10" width="66" height="80" rx="12" fill="#2f3440"/><rect x="27" y="18" width="56" height="64" rx="6" fill="#fff"/><circle cx="38" cy="28" r="6" fill="#e98aa6"/><rect x="47" y="25" width="28" height="6" rx="3" fill="#e6d6bf"/><rect x="32" y="38" width="46" height="34" rx="5" fill="#f3dfc1"/><path d="M48 55q7-10 14 0q-7 7-14 0" fill="#fff"/><path d="M38 77l3-3 3 3M50 77h10" stroke="#e0564a" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="86" cy="22" r="12" fill="#e0564a"/><path d="M80 22l4 4 8-8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  pos: svg(
    '<ellipse cx="55" cy="88" rx="30" ry="5" fill="#0002"/><rect x="50" y="56" width="10" height="30" fill="#9aa7ae"/><rect x="26" y="12" width="58" height="48" rx="8" fill="#2f3440"/><rect x="31" y="17" width="48" height="38" rx="4" fill="#7fcfb4"/><rect x="36" y="23" width="18" height="12" rx="3" fill="#fff"/><rect x="57" y="23" width="17" height="12" rx="3" fill="#fff9"/><rect x="36" y="38" width="38" height="11" rx="4" fill="#e08a3c"/>',
  ),
  staff: svg(
    '<ellipse cx="55" cy="84" rx="40" ry="6" fill="#0002"/><path d="M18 70q0-22 22-24l14 4q10 2 14 12l22 4q6 1 6 8v4H18z" fill="#4c8fd6"/><rect x="18" y="74" width="80" height="8" rx="4" fill="#2b2b30"/><path d="M40 48l-2 16M48 50l-2 14" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M80 30q6-8 0-16M90 34q8-10 0-22" stroke="#7fcfb4" stroke-width="4" fill="none" stroke-linecap="round"/>',
  ),
  oddball: svg(
    '<ellipse cx="55" cy="86" rx="36" ry="6" fill="#0002"/><path d="M28 30h54l-6 54H34z" fill="#c99b5f"/><path d="M28 30q27-14 54 0" fill="#b58449"/><rect x="40" y="46" width="30" height="22" rx="4" fill="#fff4e2"/><text x="55" y="63" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="700" font-size="18" fill="#8a6bbf">?</text><path d="M30 18l4 6M55 10v8M80 18l-4 6" stroke="#f6c35b" stroke-width="3.5" stroke-linecap="round"/>',
  ),
  decor: svg(
    '<ellipse cx="55" cy="88" rx="30" ry="5" fill="#0002"/><path d="M38 60h34l-4 26H42z" fill="#d9774f"/><rect x="35" y="56" width="40" height="8" rx="4" fill="#c4643f"/><path d="M55 56q-2-22-20-30q18 2 20 24q2-26 22-32q-18 12-20 38" fill="#4fae7b"/><path d="M55 56q-12-12-26-10q14 4 26 10" fill="#3f9e80"/><circle cx="84" cy="22" r="4" fill="#f6c35b"/><circle cx="24" cy="30" r="3" fill="#f6c35b"/>',
  ),
  seating: svg(
    '<ellipse cx="55" cy="88" rx="38" ry="5" fill="#0002"/><rect x="30" y="18" width="50" height="36" rx="10" fill="#8a6bbf"/><rect x="24" y="50" width="62" height="16" rx="8" fill="#a68ad6"/><rect x="30" y="64" width="6" height="22" rx="3" fill="#6b4430"/><rect x="74" y="64" width="6" height="22" rx="3" fill="#6b4430"/><rect x="38" y="26" width="34" height="4" rx="2" fill="#fff6"/>',
  ),
};

export const CATEGORY_TINT: Record<Category, string> = {
  equipment: '#fde3d6',
  marketing: '#fbe0ea',
  pos: '#dcf3ea',
  staff: '#dceaf8',
  oddball: '#ece3f7',
  decor: '#e3f1d9',
  seating: '#e9e1f6',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  equipment: 'EQUIPMENT',
  marketing: 'MARKETING',
  pos: 'REGISTER',
  staff: 'STAFF',
  oddball: 'ODDBALL',
  decor: 'DECOR',
  seating: 'SEATING',
};

export const cardArt = (c: Category): string => ART[c] ?? ART.oddball;
