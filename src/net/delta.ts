/**
 * Snapshot deltas (2.0.1). The host sends a full state now and then (a keyframe) and otherwise
 * only what changed since the snapshot before, as a small JSON patch:
 *   ['r', value]                 replace with value
 *   ['o', {key: patch}, [dels]]  object: patch some keys, delete others
 *   ['a', [[index, patch]], len] array: patch some slots, then trim or grow to len
 * Floats are rounded to 3 decimals on the wire (a thousandth of a tile); peers only draw them.
 * Patches never mutate the base: unchanged branches are shared, changed ones are copied.
 */
export type Patch = ['r', unknown] | ['o', Record<string, Patch>, string[]?] | ['a', [number, Patch][], number];

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Round every non-integer number to 3 decimals (deep copy for objects and arrays). */
export function roundFloats<T>(v: T): T {
  // `|| 0` turns -0 into 0, as JSON would on the wire.
  if (typeof v === 'number') return ((Number.isInteger(v) || !Number.isFinite(v) ? v : Math.round(v * 1000) / 1000) || 0) as T;
  if (Array.isArray(v)) return v.map(roundFloats) as T;
  if (isPlain(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) out[k] = roundFloats(v[k]);
    return out as T;
  }
  return v;
}

/**
 * Patch from `prev` (already rounded, as the peer holds it) to `next` (raw), or null when nothing
 * changed. Compare against the rounded value so sub-millimetre jitter sends nothing.
 */
export function diff(prev: unknown, next: unknown): Patch | null {
  if (typeof next === 'number') {
    const r = roundFloats(next);
    return Object.is(prev, r) ? null : ['r', r];
  }
  if (next === null || typeof next !== 'object') return prev === next ? null : ['r', next];
  if (Array.isArray(next)) {
    if (!Array.isArray(prev)) return ['r', roundFloats(next)];
    const slots: [number, Patch][] = [];
    for (let i = 0; i < next.length; i++) {
      const p = i < prev.length ? diff(prev[i], next[i]) : ['r', roundFloats(next[i])] as Patch;
      if (p) slots.push([i, p]);
    }
    if (!slots.length && prev.length === next.length) return null;
    // A rewritten array (customers shifting down the queue) is cheaper sent whole.
    const patch: Patch = ['a', slots, next.length];
    if (slots.length > next.length / 2 && next.length > 1) {
      const whole: Patch = ['r', roundFloats(next)];
      if (JSON.stringify(whole).length < JSON.stringify(patch).length) return whole;
    }
    return patch;
  }
  if (!isPlain(prev)) return ['r', roundFloats(next)];
  const keys: Record<string, Patch> = {};
  let any = false;
  for (const k of Object.keys(next)) {
    const v = (next as Record<string, unknown>)[k];
    if (v === undefined) continue;
    const p = k in prev && prev[k] !== undefined ? diff(prev[k], v) : (['r', roundFloats(v)] as Patch);
    if (p) { keys[k] = p; any = true; }
  }
  const dels = Object.keys(prev).filter((k) => !(k in next) || (next as Record<string, unknown>)[k] === undefined);
  if (!any && !dels.length) return null;
  return dels.length ? ['o', keys, dels] : ['o', keys];
}

/** Apply a patch to `base` without mutating it. Throws on a malformed patch. */
export function applyPatch(base: unknown, patch: Patch): unknown {
  if (!Array.isArray(patch)) throw new Error('bad patch');
  if (patch[0] === 'r') return patch[1];
  if (patch[0] === 'o') {
    if (!isPlain(base) || !isPlain(patch[1])) throw new Error('bad object patch');
    const out: Record<string, unknown> = { ...base };
    for (const [k, p] of Object.entries(patch[1])) {
      if (k === '__proto__') throw new Error('bad key');
      out[k] = applyPatch(base[k], p);
    }
    for (const k of patch[2] ?? []) delete out[k];
    return out;
  }
  if (patch[0] === 'a') {
    if (!Array.isArray(base) || !Array.isArray(patch[1]) || typeof patch[2] !== 'number') throw new Error('bad array patch');
    const out = base.slice(0, patch[2]);
    for (const [i, p] of patch[1]) {
      if (!Number.isInteger(i) || i < 0 || i >= patch[2]) throw new Error('bad array slot');
      out[i] = applyPatch(base[i], p);
    }
    if (out.length !== patch[2]) throw new Error('bad array length');
    return out;
  }
  throw new Error('bad patch kind');
}
