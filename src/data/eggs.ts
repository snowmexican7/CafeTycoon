/**
 * Easter egg pack 2 (B8) — rare, seeded gags. Numbers stay small so a day never sinks on a joke.
 */
export const EGGS = {
  /** Chance each finished warm-station brew that the shop cat naps on it. */
  catChance: 0.04,
  /** How long the cat blocks the station (seconds). Pet/shoo to clear early. */
  catNapSeconds: 8,
  /** Chance on a named regular arriving that their cup gets a mangled name. */
  nameMixChance: 0.08,
  /** Chance each arrival (day ≥ 2) to be a Wi-Fi camper instead of a normal order. */
  camperChance: 0.03,
  /** How long a camper sits before they leave on their own (seconds). */
  camperSitSeconds: 45,
  /** Espresso output sitting this long (seconds) before the soft smoke alarm. */
  burnSeconds: 18,
  /** Chance a finished steamed drink gets a latte-art fail caption. */
  latteArtChance: 0.06,
  /** Tiny tip (or joke) paid with a latte-art fail. */
  latteArtTip: 0.5,
  /** Secret menu code (case-insensitive). Also accepted as a Konami-ish arrow string. */
  secretCode: 'FOAM',
  /** Konami-style sequence encoded as arrow chars. */
  secretKonami: 'UUDDLRLRBA',
  /** Silly drink label when the secret is unlocked (mechanically today's special). */
  secretLabel: '🦄 Unicorn foam',
  /** Bonus tip on the first secret-menu serve of the day. */
  secretTip: 3,
} as const;

/** Mangled name stickers for the cup. */
export const NAME_MANGLES: readonly string[] = [
  'Kennedee',
  'Ashleeigh',
  'Bort',
  'Aña',
  'Something with a J',
  'Chief',
  'That one',
  'Espresso?',
];

/** Floating review captions for a latte-art fail. */
export const LATTE_ART_CAPTIONS: readonly string[] = [
  '2★ looks like a potato',
  '2★ is that a duck?',
  '2★ abstract… brave',
  '2★ my kid could pour that',
  '2★ blob supremacy',
];
