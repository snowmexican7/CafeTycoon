/**
 * ui-3.5.2 (Round 4 e): what a barista look's ids mean. The sim only checks the shape (`cleanLook`, src/sim/look.ts);
 * the UI owns the catalogue. Pure data and lookups, shared by the creator screen (src/ui/creator.ts) and the drawing
 * (src/render/layers/actors.ts). Body style rides in the outfit id as `<body>-<outfit>` (PlayerLook has no body field).
 */
import type { PlayerLook } from '../sim/types';

export interface LookOption<T> { id: string; name: string; value: T }

export type BodyStyle = 'slim' | 'broad';
export type HairStyle = 'short' | 'buzz' | 'spiky' | 'curly' | 'bob' | 'long' | 'ponytail' | 'bun';
export type OutfitStyle = 'apron' | 'dress' | 'skirt' | 'overalls' | 'hoodie' | 'vest';

export const BODIES: LookOption<BodyStyle>[] = [
  { id: 'slim', name: 'Slim', value: 'slim' },
  { id: 'broad', name: 'Broad', value: 'broad' },
];

export const HAIR_STYLES: LookOption<HairStyle>[] = [
  { id: 'short', name: 'Short', value: 'short' },
  { id: 'buzz', name: 'Buzz cut', value: 'buzz' },
  { id: 'spiky', name: 'Spiky', value: 'spiky' },
  { id: 'curly', name: 'Curly', value: 'curly' },
  { id: 'bob', name: 'Bob', value: 'bob' },
  { id: 'long', name: 'Long', value: 'long' },
  { id: 'ponytail', name: 'Ponytail', value: 'ponytail' },
  { id: 'bun', name: 'Top bun', value: 'bun' },
];

export const HAIR_COLOURS: LookOption<number>[] = [
  { id: 'black', name: 'Black', value: 0x2b1a12 },
  { id: 'dark', name: 'Dark brown', value: 0x3b2a20 },
  { id: 'brown', name: 'Brown', value: 0x7a4a2a },
  { id: 'blonde', name: 'Blonde', value: 0xd8a35a },
  { id: 'red', name: 'Red', value: 0xa2502c },
  { id: 'grey', name: 'Grey', value: 0x9a958f },
  { id: 'blue', name: 'Blue', value: 0x4c7fd6 },
  { id: 'pink', name: 'Pink', value: 0xe98aa6 },
];

export const SKIN_TONES: LookOption<number>[] = [
  { id: 's1', name: 'Very light', value: 0xf6d2b4 },
  { id: 's2', name: 'Light', value: 0xf2c6a0 },
  { id: 's3', name: 'Medium light', value: 0xe8b896 },
  { id: 's4', name: 'Medium', value: 0xc98d62 },
  { id: 's5', name: 'Medium dark', value: 0x9c6a48 },
  { id: 's6', name: 'Dark', value: 0x7a4f35 },
];

export const SHIRT_COLOURS: LookOption<number>[] = [
  { id: 'red', name: 'Red', value: 0xe0564a },
  { id: 'blue', name: 'Blue', value: 0x4c8fd6 },
  { id: 'green', name: 'Green', value: 0x4fae7b },
  { id: 'purple', name: 'Purple', value: 0x8a6bbf },
  { id: 'yellow', name: 'Yellow', value: 0xf6c35b },
  { id: 'pink', name: 'Pink', value: 0xe98aa6 },
  { id: 'teal', name: 'Teal', value: 0x3f9e9a },
  { id: 'black', name: 'Black', value: 0x3a3438 },
];

export const OUTFITS: LookOption<OutfitStyle>[] = [
  { id: 'apron', name: 'Shirt and apron', value: 'apron' },
  { id: 'dress', name: 'Dress and apron', value: 'dress' },
  { id: 'skirt', name: 'Skirt and apron', value: 'skirt' },
  { id: 'overalls', name: 'Overalls', value: 'overalls' },
  { id: 'hoodie', name: 'Hoodie and apron', value: 'hoodie' },
  { id: 'vest', name: 'Waistcoat', value: 'vest' },
];

/** The look a new player starts from in the creator. */
export const DEFAULT_LOOK: PlayerLook = { hair: 'short', hairColor: 'brown', skin: 's3', outfit: 'slim-apron', shirtColor: 'green' };

const find = <T>(list: LookOption<T>[], id: string | undefined): LookOption<T> => list.find((o) => o.id === id) ?? list[0];

/** Split an outfit id into its body style and outfit (`broad-dress` → broad + dress; a bare `dress` is slim). */
export function splitOutfit(outfit: string): { body: string; outfit: string } {
  const i = outfit.indexOf('-');
  return i < 0 ? { body: 'slim', outfit } : { body: outfit.slice(0, i), outfit: outfit.slice(i + 1) };
}

export const joinOutfit = (body: string, outfit: string): string => `${body}-${outfit}`;

/** What a look draws as. Unknown ids (an older or newer build's) fall back to the first option, never throw. */
export interface LookArt { body: BodyStyle; hairStyle: HairStyle; hair: number; skin: number; outfit: OutfitStyle; shirt: number }

export function lookArt(look: PlayerLook): LookArt {
  const o = splitOutfit(look.outfit);
  return {
    body: find(BODIES, o.body).value,
    hairStyle: find(HAIR_STYLES, look.hair).value,
    hair: find(HAIR_COLOURS, look.hairColor).value,
    skin: find(SKIN_TONES, look.skin).value,
    outfit: find(OUTFITS, o.outfit).value,
    shirt: find(SHIRT_COLOURS, look.shirtColor).value,
  };
}

/** The creator's rows, in order, as (label, options, read, write) so arrows can step through any of them. */
export type LookPart = 'body' | 'hair' | 'hairColor' | 'skin' | 'shirtColor' | 'outfit';

export const LOOK_PARTS: { part: LookPart; label: string; options: LookOption<unknown>[] }[] = [
  { part: 'body', label: 'Body style', options: BODIES },
  { part: 'hair', label: 'Hairstyle', options: HAIR_STYLES },
  { part: 'hairColor', label: 'Hair colour', options: HAIR_COLOURS },
  { part: 'skin', label: 'Skin tone', options: SKIN_TONES },
  { part: 'outfit', label: 'Outfit', options: OUTFITS },
  { part: 'shirtColor', label: 'Shirt colour', options: SHIRT_COLOURS },
];

export function partId(look: PlayerLook, part: LookPart): string {
  const o = splitOutfit(look.outfit);
  if (part === 'body') return o.body;
  if (part === 'outfit') return o.outfit;
  if (part === 'hairColor') return look.hairColor ?? HAIR_COLOURS[0].id;
  return look[part];
}

/** Step one part of a look by ±1 (wrapping), returning a new look. */
export function stepLook(look: PlayerLook, part: LookPart, dir: 1 | -1): PlayerLook {
  const row = LOOK_PARTS.find((r) => r.part === part)!;
  const ids = row.options.map((o) => o.id);
  const at = Math.max(0, ids.indexOf(partId(look, part)));
  const next = ids[(at + dir + ids.length) % ids.length];
  const o = splitOutfit(look.outfit);
  if (part === 'body') return { ...look, outfit: joinOutfit(next, o.outfit) };
  if (part === 'outfit') return { ...look, outfit: joinOutfit(o.body, next) };
  return { ...look, [part]: next };
}

/** A random look (the creator's "Surprise me"), from a 0..1 random source. */
export function randomLook(rand: () => number): PlayerLook {
  const pick = <T>(l: LookOption<T>[]) => l[Math.floor(rand() * l.length) % l.length].id;
  return { hair: pick(HAIR_STYLES), hairColor: pick(HAIR_COLOURS), skin: pick(SKIN_TONES), outfit: joinOutfit(pick(BODIES), pick(OUTFITS)), shirtColor: pick(SHIRT_COLOURS) };
}
