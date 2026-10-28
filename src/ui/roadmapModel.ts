/** Pure helpers for the roadmap drawer, driven by public/roadmap.json. No DOM, so they are unit-tested. */

export type GoalState = 'done' | 'doing' | 'todo';
export interface RoadmapPhase {
  id: number;
  name: string;
  tagline: string;
  status: 'now' | 'next' | 'planned' | 'done';
  suggested?: boolean;
  aim: string;
  goals: { text: string; state: GoalState }[];
  doneWhen: string;
  feedbackIssue: number | null;
}
export interface Roadmap {
  updated: string;
  repo: string;
  phases: RoadmapPhase[];
  changelog: { date: string; text: string }[];
}
export interface Suggestion {
  title: string;
  url: string;
  votes: number;
  by: string;
}

export const SUGGEST_URL = 'https://github.com/snowmexican7/CafeTycoon/issues/new';
export const PHASE_COLORS = ['var(--caramel)', '#4c8fd6', '#4fae7b', '#8a6bbf', '#e0564a', '#3f9e80'];

/** Accepts unknown JSON and returns a roadmap, or null if the shape is wrong. */
export function parseRoadmap(raw: unknown): Roadmap | null {
  const r = raw as Partial<Roadmap> | null;
  if (!r || !Array.isArray(r.phases) || r.phases.length === 0) return null;
  return {
    updated: String(r.updated ?? ''),
    repo: String(r.repo ?? 'snowmexican7/CafeTycoon'),
    phases: r.phases.map((p) => ({ ...p, goals: Array.isArray(p.goals) ? p.goals : [] })),
    changelog: Array.isArray(r.changelog) ? r.changelog : [],
  };
}

/** Index of the phase being worked on, its completion (done = 1, doing = ½) and overall progress. */
export function progressOf(rm: Roadmap): { current: number; currentPct: number; done: number } {
  let current = rm.phases.findIndex((p) => p.status === 'now');
  if (current < 0) current = Math.max(0, rm.phases.findIndex((p) => p.status !== 'done'));
  const goals = rm.phases[current]?.goals ?? [];
  const score = goals.reduce((n, g) => n + (g.state === 'done' ? 1 : g.state === 'doing' ? 0.5 : 0), 0);
  return { current, currentPct: goals.length ? Math.round((score / goals.length) * 100) : 0, done: rm.phases.filter((p) => p.status === 'done').length };
}

export const changelogKey = (e: { date: string; text: string }) => `${e.date}|${e.text}`;

/** Changelog entries the player has not opened the drawer since. */
export function unseen(rm: Roadmap, seen: ReadonlySet<string>): Set<string> {
  return new Set(rm.changelog.map(changelogKey).filter((k) => !seen.has(k)));
}

export function statusChip(p: RoadmapPhase): { cls: string; label: string } {
  if (p.suggested) return { cls: 'st-idea', label: 'Suggested' };
  if (p.status === 'now') return { cls: 'st-now', label: '● Now' };
  if (p.status === 'next') return { cls: 'st-next', label: 'Next' };
  if (p.status === 'done') return { cls: 'st-done', label: '✓ Done' };
  return { cls: 'st-plan', label: 'Planned' };
}

/** GitHub issues JSON → suggestions sorted by 👍 votes; pull requests are skipped. */
export function parseSuggestions(raw: unknown): Suggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => i && typeof i.title === 'string' && !i.pull_request)
    .map((i) => ({ title: i.title as string, url: String(i.html_url ?? ''), votes: Number(i.reactions?.['+1'] ?? 0), by: String(i.user?.login ?? '') }))
    .sort((a, b) => b.votes - a.votes);
}
