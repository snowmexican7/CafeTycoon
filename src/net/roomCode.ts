/** No I or O, so codes read aloud over voice chat survive. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 5;

/** A fresh room code from a random source in [0, 1). */
export function makeRoomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(random() * ROOM_CODE_ALPHABET.length));
    code += ROOM_CODE_ALPHABET[idx];
  }
  return code;
}

/** Trim and uppercase a typed code; null unless it is exactly five letters from the alphabet. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)) ? code : null;
}
