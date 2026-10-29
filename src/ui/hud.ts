import { ECONOMY } from '../data/economy';
import type { DrinkId } from '../sim/types';
import { esc, hide, show } from './dom';
import { coin, itemIcon, jar, logoCup, pauseGlyph, speakerGlyph, stars, sun, SUPPLY_COLOR } from './icons';
import { crewKey, handKey, ITEM_LABEL, ordersKey, type HudLive } from './live';
import { loadRecipeHints, MAX_TICKETS, pruneOpen, stepsOpen, ticketsHtml, ticketsKey, toggleTicket, URGENT as TICKET_URGENT, type RecipeHints, type TicketOpts } from './tickets';
import { DRINK_LABEL } from './tickets';
import { mountCloseEarly } from './closeEarly';
import { cleanMeter, EVENT_INTRO, hudStructureKey, type HudVM } from './viewModels';
import type { EventKind } from '../sim/types';

const SUPPLY_LABEL = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew', flavour: 'Flavours', pastry: 'Pastries' } as const;
const SUPPLY_UNIT = { beans: 'shots', milk: 'steams', concentrate: 'pours', flavour: 'pumps', pastry: 'pastries' } as const;
const LOW_AT = 5;
const URGENT = TICKET_URGENT;

/** Small inline icons for the event chips and cards. */
const EVENT_ICON: Record<EventKind, string> = {
  rushHour: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" fill="#e0564a"/><path d="M12 13c.6 1.6 2 2 2 3.6a2 2 0 0 1-4 0c0-.9.5-1.4 1-1.8 0 .8.4 1.2 1 1.2-.2-1.2 0-2.2 0-3z" fill="#f6c35b"/></svg>',
  powerFlicker: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="#f6c35b" stroke="#3a2418" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  healthInspector: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="4" width="14" height="18" rx="2" fill="#c98d62"/><rect x="7" y="7" width="10" height="13" rx="1" fill="#fffaf2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="#6b4430"/><path d="M8.5 11h7M8.5 14h7M8.5 17h4" stroke="#9a8a7a" stroke-width="1.3"/></svg>',
  influencerVisit: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2.5" fill="#33294a"/><rect x="8.5" y="4.5" width="7" height="13" rx="1" fill="#e98aa6"/><circle cx="12" cy="11" r="2.6" fill="#fffaf2"/><circle cx="12" cy="19.6" r="1" fill="#efe7ff"/></svg>',
};

const parseMoney = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const patienceHex = (f: number) => (f > 0.55 ? '#4fae7b' : f > URGENT ? '#f0a63a' : '#e0564a');

/**
 * The in-day HUD: a top bar of pills, order tickets on the left, pantry/menu/note on the right and
 * what you hold along the bottom. Every block renders once, then only per-tick values are patched.
 */
export function createHud(container: HTMLElement, handlers: { onMute?(): void; onCloseEarly?(on: boolean): void } = {}, opts: { recipeHints?: RecipeHints } = {}): {
  render(vm: HudVM, live?: HudLive): void;
  /** FB1 WP2: recipe steps on tickets: on click (default), always or off. */
  setRecipeHints(mode: RecipeHints): void;
  toast(lines: string[]): void;
  setRoom(code: string | null): void;
  setMuted(muted: boolean): void;
  setJuice(j: { vibe: number; combo: number; label: string; tone: 'high' | 'mid' | 'low' } | null): void;
  show(): void;
  hide(): void;
} {
  let roomCode: string | null = null;
  container.innerHTML = `
    <div class="hud-top">
      <div class="hud-logo">${logoCup()}<span>Cafe<b>Tycoon</b></span></div>
      <div class="pill hud-day"></div>
      <div class="pill hud-clock" role="timer" aria-label="Time left today">${sun()}<span class="lab"></span><span class="clock"></span><span class="daybar"><i></i></span></div>
      <button class="pill hud-close" type="button" tabindex="-1" hidden></button>
      <div class="pill hud-cash">${coin()}<span class="cash"></span><span class="plus" hidden></span></div>
      <div class="pill hud-rep"></div>
      <div class="pill hud-vibe" hidden title="Crew vibe"><span class="vbar"><i></i></span><span class="vlab"></span><span class="vcombo" hidden></span></div>
      <div class="spacer"></div>
      <div class="pill hud-room" hidden></div>
      <div class="hud-crew"></div>
      <button class="iconbtn mute" data-action="mute" aria-label="Mute sound (M)" title="Mute sound (M)" aria-pressed="false">${speakerGlyph(false)}</button>
      <button class="iconbtn" data-action="pause" aria-label="Pause (Esc)" title="Pause (Esc)">${pauseGlyph()}</button>
    </div>
    <aside class="hud-side left" aria-label="Orders">
      <div class="h">Orders <span class="n">0</span></div>
      <div class="tickets"></div>
    </aside>
    <aside class="hud-side right">
      <div class="h">Pantry</div><div class="card pantry"></div>
      <div class="card hud-clean" role="meter" aria-label="Floor cleanliness" aria-valuemin="0" aria-valuemax="100" hidden><svg class="spark" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 1.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5L1.5 10 8 8z" fill="currentColor"/></svg><div class="lab">Floor<small class="cword"></small></div><span class="cbar"><i></i></span><span class="cpct num"></span></div>
      <div class="h">Menu</div><div class="card chalk menu"></div>
      <div class="card note" hidden></div>
    </aside>
    <div class="hud-bottom">
      <div class="hold hand"></div>
      <div class="hold hint"></div>
      <div class="spacer"></div>
      <div class="keys"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> move <span class="key">E</span> use <span class="key">R</span> drop <span class="key">Q</span> drink espresso <span class="key">C</span> hold to close early <span class="key">M</span> mute <span class="key">Esc</span> pause <span class="seed"></span></div>
    </div>
    <div class="hud-challenges" aria-live="polite" hidden></div>
    <div class="hud-events" aria-live="polite"></div>
    <div class="hud-eventcard" role="status" hidden></div>
    <div class="hud-closing" role="status" hidden><b>Doors locked</b><span>finish up! <i class="n">0</i> left</span></div>
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
    vibe: $('.hud-vibe'),
    vibeBar: $('.hud-vibe .vbar i'),
    vibeLab: $('.hud-vibe .vlab'),
    vibeCombo: $('.hud-vibe .vcombo'),
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
    closing: $('.hud-closing'),
    closingN: $('.hud-closing .n'),
    challenges: $('.hud-challenges'),
    clean: $('.hud-clean'),
    cleanBar: $('.hud-clean .cbar i'),
    cleanPct: $('.hud-clean .cpct'),
    cleanWord: $('.hud-clean .cword'),
    events: $('.hud-events'),
    eventCard: $('.hud-eventcard'),
  };
  $('[data-action=pause]').addEventListener('click', (ev) => {
    (ev.currentTarget as HTMLElement).blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  });
  const muteBtn = $('[data-action=mute]');
  muteBtn.addEventListener('click', (ev) => {
    (ev.currentTarget as HTMLElement).blur();
    handlers.onMute?.();
  });

  const closeBtn = $<HTMLButtonElement>('.hud-close');
  const closeEarly = mountCloseEarly(closeBtn, (on) => handlers.onCloseEarly?.(on));

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let plusTimer: ReturnType<typeof setTimeout> | null = null;
  let lastKey = '';
  let lastWeekKey = '';
  let lastOrders = '';
  let recipeHints: RecipeHints = opts.recipeHints ?? loadRecipeHints((() => { try { return window.localStorage; } catch { return undefined; } })());
  let lastCrew = '';
  let lastHand = '';
  let lastCash: number | null = null;
  let lastClean = '';
  let lastChallenges = '';
  let knownEvents = new Set<EventKind>();
  let lastResults = '';
  let cardTimer: ReturnType<typeof setTimeout> | null = null;
  let notes: string[] = [];
  let prices: Partial<Record<DrinkId, string>> = {};

  function renderStructure(vm: HudVM): void {
    const phaseLab = vm.phase === 'closing' ? 'CLOSING' : vm.phase === 'day' ? 'OPEN' : vm.phase === 'night' ? 'NIGHT' : '';
    el.lab.textContent = phaseLab;
    el.lab.classList.toggle('closing', vm.phase === 'closing');
    el.closing.hidden = !vm.closing;
    const rep = parseFloat(vm.reputation) || 0;
    el.rep.innerHTML = stars(rep);
    el.rep.title = `Reputation ${vm.reputation}`;
    el.rep.setAttribute('aria-label', `Reputation ${vm.reputation}`);
    el.pantry.innerHTML = vm.supplies
      .map((s) => {
        // Pastries are an optional side (P3 B4): never "low", and they start at 0, so size the jar by the pack.
        const side = s.id === 'pastry';
        const low = !side && s.count < LOW_AT;
        const fill = Math.min(1, s.count / (Math.max(ECONOMY.startingSupplies[s.id], ECONOMY.packs[s.id].size) * 1.5));
        const sub = s.count === 0 ? (side ? 'none in the case' : 'all out!') : low ? 'running low' : `${s.count} ${SUPPLY_UNIT[s.id]} left`;
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
    el.events.innerHTML = (vm.events ?? [])
      .map((e) => {
        const intro = EVENT_INTRO[e.kind];
        const meter =
          e.kind === 'healthInspector' && vm.scrutiny
            ? `<span class="scrutiny"><span class="sw">Wasted <b class="sw-n"></b></span><span class="sf">Floor <b class="sf-n"></b></span><span class="verdict"></span></span>`
            : '';
        return `<div class="ev-chip tone-${intro.tone}" data-kind="${e.kind}">${EVENT_ICON[e.kind]}<b>${esc(e.label)}</b>${e.kind === 'influencerVisit' ? '' : '<span class="secs"></span>'}${meter}</div>`;
      })
      .join('');
    el.room.hidden = !roomCode;
    el.room.innerHTML = roomCode ? `<small>ROOM</small><b>${esc(roomCode)}</b>` : '';
  }

  function renderWeek(vm: HudVM, live?: HudLive): void {
    const key = `${vm.dayLabel}|${live?.dayInWeek ?? -1}|${vm.forecast?.name ?? ''}`;
    if (key === lastWeekKey) return;
    lastWeekKey = key;
    const dots = live
      ? `<span class="week" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i class="${i < live.dayInWeek ? 'on' : i === live.dayInWeek ? 'now' : ''}"></i>`).join('')}</span>`
      : '';
    const fc = vm.forecast
      ? `<span class="fc-chip" title="${esc(vm.forecast.blurb)}"><span aria-hidden="true">${vm.forecast.icon}</span>${esc(vm.forecast.name)}</span>`
      : '';
    el.day.innerHTML = `<span>${esc(vm.dayLabel)}</span>${dots}${fc}`;
  }

  // FB1 WP2: which tickets show their steps, by customer id; kept across rebuilds, pruned as people leave.
  const openSteps = new Set<number>();
  const seenTickets = new Set<number>();
  let lastLive: HudLive | null = null;
  const ticketOpts = (live: HudLive): TicketOpts => ({ mode: recipeHints, open: openSteps, day: live.day ?? 0, holding: live.holding, prices });
  el.tickets.addEventListener('click', (ev) => {
    if (recipeHints !== 'click' || !lastLive) return;
    const t = (ev.target as HTMLElement).closest<HTMLElement>('.ticket[data-id]');
    if (!t) return;
    const id = Number(t.dataset.id);
    const i = lastLive.orders.findIndex((o) => o.id === id);
    if (i < 0) return;
    toggleTicket(openSteps, id, stepsOpen(recipeHints, i, id, openSteps, lastLive.day ?? 0));
    renderOrders(lastLive);
  });

  function renderOrders(live: HudLive): void {
    lastLive = live;
    pruneOpen(openSteps, live.orders.map((o) => o.id));
    const o = ticketOpts(live);
    const key = ticketsKey(ordersKey(live), o);
    if (key !== lastOrders) {
      lastOrders = key;
      el.count.textContent = String(live.orders.length);
      el.count.classList.toggle('zero', live.orders.length === 0);
      el.tickets.innerHTML = ticketsHtml(live.orders, o);
      // Only tickets that just arrived drop in; a toggle or a new hand item must not replay it.
      el.tickets.querySelectorAll<HTMLElement>('.ticket[data-id]').forEach((t) => {
        const id = Number(t.dataset.id);
        if (!seenTickets.has(id)) { seenTickets.add(id); t.classList.add('new'); }
      });
    }
    const bars = el.tickets.querySelectorAll<HTMLElement>('.ticket');
    bars.forEach((t, i) => {
      const o = live.orders[i];
      if (!o || i >= MAX_TICKETS) return;
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
          `<span class="av ${c.me ? 'me' : ''} ${c.connected ? '' : 'away'} ${c.bot ? 'bot' : ''}" style="background:${c.color}" title="${esc(c.name)}${c.me ? ' (you)' : ''}${c.bot ? ` · ${c.bot} bot` : ''}${c.connected ? '' : ' · away'}">${esc(c.initial)}</span>`,
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

  /** A big card for a moment: an event's intro, or the inspector's stamp, or the influencer's post. */
  function showCard(html: string, tone: string, ms = 3400): void {
    el.eventCard.className = `hud-eventcard tone-${tone}`;
    el.eventCard.innerHTML = html;
    el.eventCard.hidden = false;
    // restart the pop-in animation
    void el.eventCard.offsetWidth;
    el.eventCard.classList.add('in');
    if (cardTimer) clearTimeout(cardTimer);
    cardTimer = setTimeout(() => (el.eventCard.hidden = true), ms);
  }

  /** Event chips' seconds and the inspector's meter (patched), new-event intro cards and outcome stamps. */
  function patchEvents(vm: HudVM): void {
    const open = vm.phase === 'day' || vm.phase === 'closing';
    const active = new Set((vm.events ?? []).map((e) => e.kind));
    if (open) {
      for (const k of active) {
        if (knownEvents.has(k)) continue;
        const intro = EVENT_INTRO[k];
        showCard(`<div class="ic">${EVENT_ICON[k]}</div><div><b>${esc(intro.title)}</b><p>${esc(intro.line)}</p></div>`, intro.tone);
      }
    }
    knownEvents = active;
    for (const e of vm.events ?? []) {
      const chip = el.events.querySelector<HTMLElement>(`.ev-chip[data-kind=${e.kind}]`);
      const secs = chip?.querySelector<HTMLElement>('.secs');
      if (secs) {
        const t = `${e.secondsLeft}s`;
        if (secs.textContent !== t) secs.textContent = t;
      }
    }
    const sc = vm.scrutiny;
    const chip = el.events.querySelector<HTMLElement>('.ev-chip[data-kind=healthInspector]');
    if (sc && chip) {
      chip.dataset.verdict = sc.verdict;
      const w = chip.querySelector<HTMLElement>('.sw-n');
      const f = chip.querySelector<HTMLElement>('.sf-n');
      const v = chip.querySelector<HTMLElement>('.verdict');
      if (w) w.textContent = `${sc.wasted}/${sc.wastedLimit}`;
      if (f) f.textContent = `${sc.clean}%`;
      if (v) v.textContent = sc.verdict === 'ok' ? 'looking good' : sc.verdict === 'risky' ? 'hmm\u2026' : 'would fail!';
    }
    const r = vm.results;
    const key = r ? `${vm.dayLabel}|${r.inspection}|${r.influencer}` : '';
    if (r && lastResults && key !== lastResults && lastResults.startsWith(`${vm.dayLabel}|`)) {
      const [, wasInsp, wasInfl] = lastResults.split('|');
      if (r.inspection && wasInsp === 'null') {
        const pass = r.inspection === 'pass';
        showCard(`<div class="stamp ${pass ? 'pass' : 'fail'}">${pass ? 'PASSED' : 'FAILED'}</div><div><b>${pass ? 'Inspection passed' : 'Inspection failed'}</b><p>${pass ? 'A gold star for the crew. Reputation up a little.' : 'Too messy or too wasteful. That\u2019s a fine on tonight\u2019s receipt.'}</p></div>`, pass ? 'pass' : 'fail', 3800);
      } else if (r.influencer === 'served' && wasInfl === 'null') {
        showCard(`<div class="ic">${EVENT_ICON.influencerVisit}</div><div><b>Posted! ${esc(r.followers)} followers</b><p>Their fans are on the way: more customers for the rest of the day.</p></div>`, 'influencer', 3800);
      }
    }
    lastResults = key;
  }

  /** Challenge chips: rebuild when one completes/fails (structure key); patch the progress text every tick. */
  function renderChallenges(vm: HudVM): void {
    const list = vm.challenges ?? [];
    const open = vm.phase === 'day' || vm.phase === 'closing';
    if (!open || !list.length) {
      el.challenges.hidden = true;
      el.challenges.innerHTML = '';
      lastChallenges = '';
      return;
    }
    el.challenges.hidden = false;
    el.challenges.innerHTML = list
      .map(
        (c) =>
          `<div class="ch-chip ${c.done ? 'done' : ''} ${c.failed ? 'failed' : ''}" data-id="${esc(c.id)}" title="+$${c.reward}"><span class="ch-text">${esc(c.text)}</span><small>+$${c.reward}</small></div>`,
      )
      .join('');
    lastChallenges = list.map((c) => c.text).join('|');
  }

  function patchChallenges(vm: HudVM): void {
    const list = vm.challenges ?? [];
    const open = vm.phase === 'day' || vm.phase === 'closing';
    if (!open || !list.length) {
      if (!el.challenges.hidden) {
        el.challenges.hidden = true;
        el.challenges.innerHTML = '';
        lastChallenges = '';
      }
      return;
    }
    if (el.challenges.hidden || el.challenges.childElementCount !== list.length) {
      renderChallenges(vm);
      return;
    }
    const key = list.map((c) => c.text).join('|');
    if (key === lastChallenges) return;
    lastChallenges = key;
    for (const c of list) {
      const node = el.challenges.querySelector<HTMLElement>(`[data-id="${c.id}"]`);
      if (!node) continue;
      node.classList.toggle('done', c.done);
      node.classList.toggle('failed', c.failed);
      const t = node.querySelector('.ch-text');
      if (t) t.textContent = c.text;
    }
  }

  /** The cleanliness meter is patched in place (never part of the structure key). */
  function patchClean(vm: HudVM): void {
    const open = vm.phase === 'day' || vm.phase === 'closing';
    if (vm.cleanliness === undefined || !open) {
      el.clean.hidden = true;
      lastClean = '';
      return;
    }
    const m = cleanMeter(vm.cleanliness);
    const key = `${m.pct}|${m.tone}`;
    if (key === lastClean) return;
    lastClean = key;
    el.clean.hidden = false;
    el.clean.dataset.tone = m.tone;
    el.cleanBar.style.width = `${m.pct}%`;
    el.cleanPct.textContent = `${m.pct}%`;
    el.cleanWord.textContent = m.word;
    el.clean.title = `Floor: ${m.word} (${m.pct}%)`;
    el.clean.setAttribute('aria-valuenow', String(m.pct));
    el.clean.setAttribute('aria-valuetext', `${m.word}, ${m.pct}%`);
  }

  return {
    setRecipeHints(mode) {
      if (mode === recipeHints) return;
      recipeHints = mode;
      if (lastLive) renderOrders(lastLive);
    },
    render(vm, live) {
      const key = hudStructureKey(vm);
      if (key !== lastKey) {
        lastKey = key;
        renderStructure(vm);
        renderChallenges(vm);
      }
      renderWeek(vm, live);
      el.clock.textContent = vm.clock;
      if (vm.closing) {
        const n = String(vm.closing.left);
        if (el.closingN.textContent !== n) el.closingN.textContent = n;
      }
      patchCash(vm);
      patchClean(vm);
      patchEvents(vm);
      patchChallenges(vm);
      if (live) {
        el.bar.style.width = `${(live.progress * 100).toFixed(1)}%`;
        renderOrders(live);
        renderCrew(live);
        renderHand(live);
      }
      closeEarly.render(live?.closeEarly);
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
    setMuted(muted) {
      if (muteBtn.getAttribute('aria-pressed') === String(muted)) return;
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.innerHTML = speakerGlyph(muted);
      const label = muted ? 'Unmute sound (M)' : 'Mute sound (M)';
      muteBtn.setAttribute('aria-label', label);
      muteBtn.title = label;
    },
    setRoom(code) {
      roomCode = code;
      lastKey = '';
      lastCrew = '';
      lastCash = null;
    },
    setJuice(j) {
      if (!j) {
        el.vibe.hidden = true;
        return;
      }
      el.vibe.hidden = false;
      el.vibe.dataset.tone = j.tone;
      el.vibeBar.style.width = `${Math.max(4, Math.min(100, j.vibe))}%`;
      el.vibeLab.textContent = j.label;
      el.vibe.setAttribute('aria-label', `Crew vibe ${j.vibe}: ${j.label}`);
      if (j.combo >= 2) {
        el.vibeCombo.hidden = false;
        el.vibeCombo.textContent = `×${j.combo}`;
      } else {
        el.vibeCombo.hidden = true;
      }
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
