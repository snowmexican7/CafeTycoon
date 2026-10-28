import { ECONOMY } from '../data/economy';
import type { DrinkId } from '../sim/types';
import { esc, hide, show } from './dom';
import { coin, itemIcon, jar, logoCup, pauseGlyph, stars, sun, SUPPLY_COLOR } from './icons';
import { crewKey, DRINK_STEPS, handKey, ITEM_LABEL, ordersKey, type HudLive } from './live';
import { hudStructureKey, type HudVM } from './viewModels';

const SUPPLY_LABEL = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew' } as const;
const SUPPLY_UNIT = { beans: 'shots', milk: 'steams', concentrate: 'pours' } as const;
const DRINK_LABEL = { espresso: 'Espresso', latte: 'Latte', coldBrew: 'Cold brew' } as const;
const LOW_AT = 5;
const URGENT = 0.28;

const parseMoney = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const patienceHex = (f: number) => (f > 0.55 ? '#4fae7b' : f > URGENT ? '#f0a63a' : '#e0564a');
/** A tiny stable tilt per ticket so the rail looks pinned by hand. */
const tilt = (id: number) => (((id * 37) % 7) - 3) * 0.3;

/**
 * The in-day HUD: a top bar of pills, order tickets on the left, pantry/menu/note on the right and
 * what you hold along the bottom. Every block renders once, then only per-tick values are patched.
 */
export function createHud(container: HTMLElement): {
  render(vm: HudVM, live?: HudLive): void;
  toast(lines: string[]): void;
  setRoom(code: string | null): void;
  show(): void;
  hide(): void;
} {
  let roomCode: string | null = null;
  container.innerHTML = `
    <div class="hud-top">
      <div class="hud-logo">${logoCup()}<span>Cafe<b>Tycoon</b></span></div>
      <div class="pill hud-day"></div>
      <div class="pill hud-clock" role="timer" aria-label="Time left today">${sun()}<span class="lab"></span><span class="clock"></span><span class="daybar"><i></i></span></div>
      <div class="pill hud-cash">${coin()}<span class="cash"></span><span class="plus" hidden></span></div>
      <div class="pill hud-rep"></div>
      <div class="spacer"></div>
      <div class="pill hud-room" hidden></div>
      <div class="hud-crew"></div>
      <button class="iconbtn" data-action="pause" aria-label="Pause (Esc)" title="Pause (Esc)">${pauseGlyph()}</button>
    </div>
    <aside class="hud-side left" aria-label="Orders">
      <div class="h">Orders <span class="n">0</span></div>
      <div class="tickets"></div>
    </aside>
    <aside class="hud-side right">
      <div class="h">Pantry</div><div class="card pantry"></div>
      <div class="h">Menu</div><div class="card chalk menu"></div>
      <div class="card note" hidden></div>
    </aside>
    <div class="hud-bottom">
      <div class="hold hand"></div>
      <div class="hold hint"></div>
      <div class="spacer"></div>
      <div class="keys"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> move <span class="key">E</span> use <span class="key">Esc</span> pause <span class="seed"></span></div>
    </div>
    <div class="toast" role="status" hidden></div>`;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
  const el = {
    day: $('.hud-day'),
    lab: $('.hud-clock .lab'),
    clock: $('.hud-clock .clock'),
    bar: $('.hud-clock .daybar i'),
    cash: $('.hud-cash .cash'),
    plus: $('.hud-cash .plus'),
    rep: $('.hud-rep'),
    room: $('.hud-room'),
    crew: $('.hud-crew'),
    count: $('.hud-side.left .n'),
    tickets: $('.tickets'),
    pantry: $('.pantry'),
    menu: $('.menu'),
    note: $('.note'),
    hand: $('.hold.hand'),
    hint: $('.hold.hint'),
    seed: $('.keys .seed'),
    toast: $('.toast'),
  };
  $('.iconbtn').addEventListener('click', (ev) => {
    (ev.currentTarget as HTMLElement).blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  });

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let plusTimer: ReturnType<typeof setTimeout> | null = null;
  let lastKey = '';
  let lastWeekKey = '';
  let lastOrders = '';
  let lastCrew = '';
  let lastHand = '';
  let lastCash: number | null = null;
  let notes: string[] = [];
  let prices: Partial<Record<DrinkId, string>> = {};

  function renderStructure(vm: HudVM): void {
    const phaseLab = vm.phase === 'closing' ? 'CLOSING' : vm.phase === 'day' ? 'OPEN' : vm.phase === 'night' ? 'NIGHT' : '';
    el.lab.textContent = phaseLab;
    el.lab.classList.toggle('closing', vm.phase === 'closing');
    const rep = parseFloat(vm.reputation) || 0;
    el.rep.innerHTML = stars(rep);
    el.rep.title = `Reputation ${vm.reputation}`;
    el.rep.setAttribute('aria-label', `Reputation ${vm.reputation}`);
    el.pantry.innerHTML = vm.supplies
      .map((s) => {
        const low = s.count < LOW_AT;
        const fill = Math.min(1, s.count / (ECONOMY.startingSupplies[s.id] * 1.5));
        const sub = s.count === 0 ? 'all out!' : low ? 'running low' : `${s.count} ${SUPPLY_UNIT[s.id]} left`;
        return `<div class="supply ${low ? 'low' : ''}">${jar(fill, SUPPLY_COLOR[s.id])}<div class="lab">${SUPPLY_LABEL[s.id]}<small>${sub}</small></div><div class="num">${s.count}</div></div>`;
      })
      .join('');
    el.menu.innerHTML = vm.menu
      .map((m) => `<div class="row ${m.available ? '' : 'off'}"><span class="d">${itemIcon(m.id, 24)}${DRINK_LABEL[m.id]}</span><b>${m.available ? esc(m.price) : 'sold out'}</b></div>`)
      .join('');
    notes = vm.notes;
    prices = Object.fromEntries(vm.menu.map((m) => [m.id, m.price]));
    lastOrders = '';
    el.note.innerHTML = vm.notes.length ? `<b>MORNING NOTE</b>${vm.notes.map((n) => `<p>${esc(n)}</p>`).join('')}` : '';
    el.note.hidden = vm.notes.length === 0;
    el.seed.textContent = `· seed ${vm.seed}`;
    el.room.hidden = !roomCode;
    el.room.innerHTML = roomCode ? `<small>ROOM</small><b>${esc(roomCode)}</b>` : '';
  }

  function renderWeek(vm: HudVM, live?: HudLive): void {
    const key = `${vm.dayLabel}|${live?.dayInWeek ?? -1}`;
    if (key === lastWeekKey) return;
    lastWeekKey = key;
    const dots = live
      ? `<span class="week" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i class="${i < live.dayInWeek ? 'on' : i === live.dayInWeek ? 'now' : ''}"></i>`).join('')}</span>`
      : '';
    el.day.innerHTML = `<span>${esc(vm.dayLabel)}</span>${dots}`;
  }

  function renderOrders(live: HudLive): void {
    const key = ordersKey(live);
    if (key !== lastOrders) {
      lastOrders = key;
      el.count.textContent = String(live.orders.length);
      el.count.classList.toggle('zero', live.orders.length === 0);
      el.tickets.innerHTML = live.orders.length
        ? live.orders
            .slice(0, 6)
            .map(
              (o) => `<div class="ticket ${o.patience < URGENT ? 'urgent' : ''}" data-id="${o.id}" style="--r:${tilt(o.id)}deg">
                <div class="ic">${itemIcon(o.drink, 34)}</div><div class="nm">${DRINK_LABEL[o.drink]}</div>
                <div class="pr">${esc(prices[o.drink] ?? '')}</div>
                <div class="steps">${DRINK_STEPS[o.drink].map((s) => `<span>${s}</span>`).join('')}</div>
                <div class="pat"><i></i></div></div>`,
            )
            .join('') + (live.orders.length > 6 ? `<div class="more">+${live.orders.length - 6} more waiting</div>` : '')
        : '<div class="empty-orders">No one in line yet.<br>Grind some beans while it\'s quiet.</div>';
    }
    const bars = el.tickets.querySelectorAll<HTMLElement>('.ticket');
    bars.forEach((t, i) => {
      const o = live.orders[i];
      if (!o) return;
      const bar = t.querySelector<HTMLElement>('.pat i')!;
      bar.style.width = `${(o.patience * 100).toFixed(1)}%`;
      bar.style.background = patienceHex(o.patience);
    });
  }

  function renderCrew(live: HudLive): void {
    const key = crewKey(live);
    if (key === lastCrew) return;
    lastCrew = key;
    el.crew.hidden = live.crew.length <= 1 && !roomCode;
    el.crew.innerHTML = live.crew
      .map(
        (c) =>
          `<span class="av ${c.me ? 'me' : ''} ${c.connected ? '' : 'away'}" style="background:${c.color}" title="${esc(c.name)}${c.me ? ' (you)' : ''}${c.connected ? '' : ' · away'}">${esc(c.initial)}</span>`,
      )
      .join('');
  }

  function renderHand(live: HudLive): void {
    const key = handKey(live);
    if (key === lastHand) return;
    lastHand = key;
    const h = live.holding;
    el.hand.innerHTML = `<div class="slot ${h ? 'full' : ''}">${h ? itemIcon(h, 36) : '∅'}</div><div class="t">${h ? ITEM_LABEL[h] : 'Empty hands'}<small>${esc(live.meName)} · you</small></div>`;
    const { go, title, detail } = live.hint;
    el.hint.classList.toggle('idle', !go);
    el.hint.hidden = !title;
    el.hint.innerHTML = `<span class="key ${go ? 'go' : ''}">E</span><div class="t">${esc(title)}<small>${esc(detail)}</small></div>`;
  }

  function patchCash(vm: HudVM): void {
    el.cash.textContent = vm.cash;
    const n = parseMoney(vm.cash);
    if (lastCash !== null && n > lastCash + 0.001 && vm.phase !== 'night') {
      el.plus.textContent = `+$${(n - lastCash).toFixed(2)}`;
      el.plus.hidden = false;
      if (plusTimer) clearTimeout(plusTimer);
      plusTimer = setTimeout(() => (el.plus.hidden = true), 1800);
    }
    lastCash = n;
  }

  return {
    render(vm, live) {
      const key = hudStructureKey(vm);
      if (key !== lastKey) {
        lastKey = key;
        renderStructure(vm);
      }
      renderWeek(vm, live);
      el.clock.textContent = vm.clock;
      patchCash(vm);
      if (live) {
        el.bar.style.width = `${(live.progress * 100).toFixed(1)}%`;
        renderOrders(live);
        renderCrew(live);
        renderHand(live);
      }
    },
    toast(lines) {
      if (lines.length === 0) return;
      // Morning notes already sit on the note card: give it a wiggle instead of repeating them.
      if (lines.every((l) => notes.includes(l)) && !el.note.hidden) {
        el.note.classList.remove('fresh');
        void el.note.offsetWidth;
        el.note.classList.add('fresh');
        return;
      }
      el.toast.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
      show(el.toast);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => hide(el.toast), 6000);
    },
    setRoom(code) {
      roomCode = code;
      lastKey = '';
      lastCrew = '';
      lastCash = null;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
