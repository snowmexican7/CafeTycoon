/**
 * The roadmap drawer (docs/mockups/title.png): Phases / Suggestions / Changelog, driven by
 * public/roadmap.json. Opened from the title screen's Roadmap pill, or read-only from the pause menu.
 * "N new" counts changelog entries the player has not seen yet (kept in localStorage).
 */
import { esc } from './dom';
import {
  changelogKey,
  parseRoadmap,
  parseSuggestions,
  PHASE_COLORS,
  progressOf,
  statusChip,
  SUGGEST_URL,
  unseen,
  type Roadmap,
  type RoadmapPhase,
  type Suggestion,
} from './roadmapModel';

const SEEN_KEY = 'cafetycoon.roadmap.seen';
type Tab = 'phases' | 'suggestions' | 'changelog';

function loadSeen(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.map(String) : []);
  } catch {
    return new Set();
  }
}
function saveSeen(keys: Iterable<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
  } catch {
    /* private mode: the badge just stays */
  }
}

export const roadmapIcon = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="#f6c35b"/><path d="M9 4v14M15 6v14" stroke="#3a2418" stroke-width="1.6"/></svg>`;

const goalBox = (s: string) =>
  s === 'done' ? '<span class="ck y" aria-label="done">✓</span>' : s === 'doing' ? '<span class="ck h" aria-label="in progress">…</span>' : '<span class="ck n" aria-label="to do"></span>';

export interface RoadmapDrawer {
  open(opts?: { readOnly?: boolean; tab?: Tab }): void;
  close(): void;
  isOpen(): boolean;
  /** Number of changelog entries not seen yet (0 until roadmap.json loads). */
  newCount(): number;
  onChange(cb: () => void): void;
}

export function createRoadmap(): RoadmapDrawer {
  const root = document.createElement('div');
  root.id = 'roadmap';
  root.hidden = true;
  document.body.appendChild(root);

  let rm: Roadmap | null = null;
  let failed = false;
  let suggestions: Suggestion[] | null = null;
  let suggestionsFailed = false;
  let tab: Tab = 'phases';
  let readOnly = false;
  let seen = loadSeen();
  let fresh = new Set<string>();
  let expanded = new Set<number>();
  let returnFocus: HTMLElement | null = null;
  const listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((f) => f());

  fetch(`${import.meta.env.BASE_URL}roadmap.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => {
      rm = parseRoadmap(j);
      failed = !rm;
      if (rm) expanded = new Set([rm.phases[progressOf(rm).current]?.id]);
      changed();
      if (!root.hidden) render();
    })
    .catch(() => {
      failed = true;
      if (!root.hidden) render();
    });

  function loadSuggestions(): void {
    if (suggestions || suggestionsFailed || !rm) return;
    fetch(`https://api.github.com/repos/${rm.repo}/issues?state=open&labels=suggestion&per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        suggestions = parseSuggestions(j);
        if (!root.hidden) render();
      })
      .catch(() => {
        suggestionsFailed = true;
        if (!root.hidden) render();
      });
  }

  function phaseHtml(p: RoadmapPhase, i: number): string {
    const chip = statusChip(p);
    const open = expanded.has(p.id);
    const head = `<div class="top"><h3>${esc(p.name)} <small>${esc(p.tagline)}</small></h3><span class="chip ${chip.cls}">${chip.label}</span></div>`;
    const body = open
      ? `<p class="aim">${esc(p.aim)}</p><ul class="goals">${p.goals.map((g) => `<li>${goalBox(g.state)}<span>${esc(g.text)}</span></li>`).join('')}</ul>
         <div class="endstate"><b>Done when</b> ${esc(p.doneWhen)}</div>`
      : `<p class="sum">${esc(p.aim)}</p>`;
    return `<div class="ph ${open ? '' : 'mini'}"><div class="num" style="background:${PHASE_COLORS[i % PHASE_COLORS.length]}">${p.id}</div>
      <button class="box" data-rm="toggle" data-id="${p.id}" aria-expanded="${open}">${head}${body}</button></div>`;
  }

  function listHtml(): string {
    if (!rm) return failed ? '<p class="empty">The roadmap could not be loaded. Try again later.</p>' : '<p class="empty">Loading the roadmap…</p>';
    if (tab === 'phases') return `<div class="timeline">${rm.phases.map(phaseHtml).join('')}</div>`;
    if (tab === 'changelog')
      return `<ul class="log">${[...rm.changelog]
        .reverse()
        .map((e) => `<li class="${fresh.has(changelogKey(e)) ? 'new' : ''}"><time>${esc(e.date)}</time><span>${esc(e.text)}</span>${fresh.has(changelogKey(e)) ? '<em>new</em>' : ''}</li>`)
        .join('')}</ul>`;
    loadSuggestions();
    const intro = `<p class="note">Ideas from the crew live as GitHub issues. Give one a 👍 there to vote for it.</p>`;
    if (suggestionsFailed) return `${intro}<p class="empty">Couldn't reach GitHub just now. <a href="https://github.com/${esc(rm.repo)}/issues" target="_blank" rel="noopener">See all ideas on GitHub</a></p>`;
    if (!suggestions) return `${intro}<p class="empty">Loading ideas…</p>`;
    if (!suggestions.length) return `${intro}<p class="empty">No ideas yet. Be the first to suggest one.</p>`;
    return `${intro}<div class="suggs">${suggestions
      .map((s) => `<a class="sugg" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="v">▲<span>${s.votes}</span></span><span class="t">${esc(s.title)}</span>${s.by ? `<span class="by">${esc(s.by)}</span>` : ''}</a>`)
      .join('')}</div>`;
  }

  function render(): void {
    const prog = rm ? progressOf(rm) : null;
    const n = rm?.phases.length ?? 6;
    const track = rm
      ? rm.phases
          .map((p, i) => (p.status === 'done' ? '<i class="done"></i>' : i === prog!.current ? `<i class="part" style="--p:${prog!.currentPct}%"></i>` : '<i></i>'))
          .join('')
      : '';
    const tabs: [Tab, string][] = readOnly ? [['phases', 'Phases'], ['changelog', 'Changelog']] : [['phases', 'Phases'], ['suggestions', 'Suggestions'], ['changelog', 'Changelog']];
    const tabBtn = ([id, label]: [Tab, string]) =>
      `<button class="tab ${tab === id ? 'on' : ''}" role="tab" aria-selected="${tab === id}" data-tab="${id}">${label}${
        id === 'suggestions' && suggestions?.length ? ` <span class="n">${suggestions.length}</span>` : ''
      }${id === 'changelog' && fresh.size ? ` <span class="n">${fresh.size} new</span>` : ''}</button>`;
    root.innerHTML = `
      <div class="rm-backdrop" data-rm="close"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="rm-title">
        <div class="hd">
          <button class="iconbtn close" data-rm="close" aria-label="Close the roadmap">✕</button>
          <h2 id="rm-title">Where the café is headed</h2>
          <p>${n} phases, from the easiest to the riskiest, each ending in a game night with the crew.${readOnly ? '' : ' Your ideas help pick what comes next.'}</p>
          ${prog ? `<div class="overall"><span>Phase ${prog.current + 1} of ${n}</span><div class="track">${track}</div><span>${prog.currentPct}%</span></div>` : ''}
          <div class="tabs" role="tablist">${tabs.map(tabBtn).join('')}</div>
        </div>
        <div class="list">${listHtml()}</div>
        ${
          readOnly
            ? '<div class="ft"><small>Suggestions and votes are on the title screen\'s Roadmap.</small></div>'
            : `<div class="ft"><a class="btn primary" href="${SUGGEST_URL}" target="_blank" rel="noopener">＋ Suggest an idea</a><small>Ideas and votes are saved as GitHub issues on the game's repo. Takes 20 seconds.</small></div>`
        }
      </aside>`;
  }

  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-rm],[data-tab]');
    if (!el) return;
    if (el.dataset.tab) {
      tab = el.dataset.tab as Tab;
      render();
      root.querySelector<HTMLElement>(`[data-tab=${tab}]`)?.focus();
    } else if (el.dataset.rm === 'close') api.close();
    else if (el.dataset.rm === 'toggle') {
      const id = Number(el.dataset.id);
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      render();
      root.querySelector<HTMLElement>(`[data-rm=toggle][data-id="${id}"]`)?.focus();
    }
  });
  // Capture so Escape closes the drawer without also toggling the pause menu underneath.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Escape' && !root.hidden) {
        e.preventDefault();
        e.stopImmediatePropagation();
        api.close();
      }
    },
    true,
  );

  const api: RoadmapDrawer = {
    open(opts = {}) {
      readOnly = !!opts.readOnly;
      tab = opts.tab ?? 'phases';
      if (readOnly && tab === 'suggestions') tab = 'phases';
      returnFocus = document.activeElement as HTMLElement | null;
      if (rm) {
        fresh = unseen(rm, seen);
        seen = new Set([...seen, ...rm.changelog.map(changelogKey)]);
        saveSeen(seen);
        changed();
      }
      render();
      root.hidden = false;
      root.querySelector<HTMLElement>('.close')?.focus();
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      fresh = new Set();
      returnFocus?.focus?.();
    },
    isOpen: () => !root.hidden,
    newCount: () => (rm ? unseen(rm, seen).size : 0),
    onChange: (cb) => void listeners.push(cb),
  };
  return api;
}
