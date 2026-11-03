/*
 * Round 5 block 5: pure model for the night Gear shop "Layout" map.
 * Click a machine, then a highlighted tile (validStationSpots) to send moveStation.
 * Fixtures stay put. Honest: only tiles canSetDown would accept are highlighted.
 */
import { layoutFor } from '../data/layout';
import { floorWidth } from '../sim/growth';
import { slotOf, validStationSpots } from '../sim/rearrange';
import type { GameState, PlayerId, Station, StationKind, Vec2 } from '../sim/types';

export type LayoutCellKind = 'empty' | 'machine' | 'fixture' | 'spot';

export interface LayoutCell {
  x: number;
  y: number;
  kind: LayoutCellKind;
  /** Station id when kind is machine or fixture. */
  id?: string;
  label: string;
  stationKind?: StationKind;
}

/** Precomputed map + per-machine spots for the Gear shop (selection is local UI state). */
export interface GearLayoutBase {
  width: number;
  height: number;
  /** Machines, fixtures, and empty tiles (no spot highlighting). */
  cells: LayoutCell[];
  /** station id → tiles a moveStation would accept (includes its own tile). */
  spotsById: Record<string, Vec2[]>;
}

export interface NightLayoutVM {
  width: number;
  height: number;
  cells: LayoutCell[];
  /** Selected machine id, or null. */
  selected: string | null;
  /** Short copy under the map. */
  blurb: string;
  /** Last refuse line, if any. */
  refuse?: string;
  /** Keyboard focus tile (optional). */
  focus?: Vec2;
}

const FIXTURE_LABEL: Record<string, string> = {
  counter: 'Till',
  pickup: 'Pickup',
  condiments: 'Bar',
  sink: 'Sink',
  fridge: 'Fridge',
  supply: 'Milk',
  trayTable: 'Tray',
  syrups: 'Syrups',
};

const MACHINE_LABEL: Record<StationKind, string> = {
  grinder: 'Grind',
  espresso: 'Esp.',
  steamer: 'Steam',
  coldBrewTap: 'Cold',
  drip: 'Drip',
  trash: 'Bin',
  counter: 'Till',
};

/** Stations that belong to a gear slot (movable); fixtures return false. */
export function isMovableStation(state: GameState, st: Station): boolean {
  return slotOf(state, st.id) >= 0;
}

/** Bar map + honest spots for every movable machine (Gear night board). */
export function gearLayoutBase(state: GameState): GearLayoutBase {
  const w = floorWidth(state);
  const tillY =
    state.stations.find((s) => s.id === 'counter')?.pos.y ??
    layoutFor(state.tier).stations.find((s) => s.kind === 'counter')?.pos.y ??
    6;
  const height = Math.max(1, tillY - 1); // bar rows 1..tillY-1
  const byPos = new Map<string, Station>();
  for (const st of state.stations) {
    const k = `${Math.round(st.pos.x)},${Math.round(st.pos.y)}`;
    if (!byPos.has(k) || !('twin' in st && st.twin)) byPos.set(k, st);
  }
  const cells: LayoutCell[] = [];
  for (let y = 1; y <= height; y++) {
    for (let x = 1; x <= w - 1; x++) {
      const st = byPos.get(`${x},${y}`);
      if (st) {
        const movable = isMovableStation(state, st);
        cells.push({
          x,
          y,
          kind: movable ? 'machine' : 'fixture',
          id: st.id,
          label: movable ? MACHINE_LABEL[st.kind] : (FIXTURE_LABEL[st.id] ?? st.kind),
          stationKind: st.kind,
        });
      } else {
        cells.push({ x, y, kind: 'empty', label: '' });
      }
    }
  }
  const spotsById: Record<string, Vec2[]> = {};
  for (const st of state.stations) {
    if (!isMovableStation(state, st)) continue;
    if (spotsById[st.id]) continue;
    spotsById[st.id] = validStationSpots(state, st.id);
  }
  return { width: w - 1, height, cells, spotsById };
}

/** Build the night layout map. `selected` is the machine the player has clicked (null = none). */
export function nightLayoutVM(state: GameState, _me: PlayerId, selected: string | null, refuse?: string, focus?: Vec2): NightLayoutVM {
  return layoutWithSelection(gearLayoutBase(state), selected, refuse, focus);
}

export function layoutWithSelection(
  base: GearLayoutBase,
  selected: string | null,
  refuse?: string,
  focus?: Vec2,
): NightLayoutVM {
  const spotSet = new Set((selected ? base.spotsById[selected] ?? [] : []).map((p) => `${p.x},${p.y}`));
  const cells = base.cells.map((c) => {
    if (c.kind === 'machine' || c.kind === 'fixture') return { ...c };
    if (spotSet.has(`${c.x},${c.y}`)) return { x: c.x, y: c.y, kind: 'spot' as const, label: '' };
    return { x: c.x, y: c.y, kind: 'empty' as const, label: '' };
  });
  const blurb = selected
    ? 'Click a highlighted tile to place it. Esc or click the machine again to cancel.'
    : 'Click a machine, then click where it goes. Fixtures (till, sink, fridge…) stay put.';
  return {
    width: base.width,
    height: base.height,
    cells,
    selected,
    blurb,
    ...(refuse ? { refuse } : {}),
    ...(focus ? { focus } : {}),
  };
}

/** Would clicking cell (x,y) with current selection send a move the map highlights? */
export function layoutClick(
  base: GearLayoutBase,
  selected: string | null,
  x: number,
  y: number,
): { selected: string | null; move?: { station: string; to: Vec2 }; refuse?: string } {
  const st = base.cells.find((c) => c.x === x && c.y === y && c.kind === 'machine');
  if (!selected) {
    return { selected: st && st.id ? st.id : null };
  }
  // Second click on the same machine cancels
  if (st && st.id === selected) return { selected: null };
  const spots = base.spotsById[selected] ?? [];
  if (spots.some((p) => p.x === x && p.y === y)) return { selected: null, move: { station: selected, to: { x, y } } };
  // Click another machine: switch selection
  if (st?.id) return { selected: st.id };
  return { selected, refuse: 'Pick a highlighted tile.' };
}

/** Short refuse line from the sim when a move is rejected. */
export function layoutRefuseLine(state: GameState, me?: PlayerId): string | undefined {
  if (!me) return undefined;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i]!;
    if (e.kind === 'station.place' && e.data.by === me) return undefined;
    if (e.kind === 'station.refuse' && e.data.by === me) {
      return "That spot won't work — it would block the floor or a station.";
    }
  }
  return undefined;
}

/** HTML for the Layout section (pure). */
export function layoutHtml(vm: NightLayoutVM): string {
  const cells = vm.cells
    .map((c) => {
      const focus = vm.focus && vm.focus.x === c.x && vm.focus.y === c.y ? ' focus' : '';
      const sel = c.kind === 'machine' && c.id === vm.selected ? ' sel' : '';
      const label = c.label ? `<span>${esc(c.label)}</span>` : '';
      return `<button type="button" class="lay-cell ${c.kind}${sel}${focus}" data-action="layout" data-x="${c.x}" data-y="${c.y}" ${c.id ? `data-id="${esc(c.id)}"` : ''} aria-label="${aria(c, vm.selected)}" tabindex="-1">${label}</button>`;
    })
    .join('');
  const refuse = vm.refuse ? `<p class="lay-refuse" role="status">${esc(vm.refuse)}</p>` : '';
  return `<div class="gr-layout" role="group" aria-label="Bar layout">
    <div class="st-shop-h">Layout <small>Move machines around before morning</small></div>
    <div class="lay-map" style="--lay-w:${vm.width};--lay-h:${vm.height}">${cells}</div>
    <p class="lay-blurb">${esc(vm.blurb)}</p>
    ${refuse}
  </div>`;
}

function aria(c: LayoutCell, selected: string | null): string {
  if (c.kind === 'machine') return selected === c.id ? `${c.label}, selected` : `${c.label} machine`;
  if (c.kind === 'fixture') return `${c.label} (stays put)`;
  if (c.kind === 'spot') return `Place here (${c.x}, ${c.y})`;
  return `Empty tile (${c.x}, ${c.y})`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
