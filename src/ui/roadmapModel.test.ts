import json from '../../public/roadmap.json';
import { describe, expect, it } from 'vitest';
import { changelogKey, parseRoadmap, parseSuggestions, progressOf, statusChip, unseen } from './roadmapModel';


describe('roadmap model', () => {
  it('parses the shipped roadmap.json: 6 phases with goals and done-when lines', () => {
    const rm = parseRoadmap(json)!;
    expect(rm.phases).toHaveLength(6);
    for (const p of rm.phases) {
      expect(p.goals.length).toBeGreaterThan(0);
      expect(p.doneWhen.length).toBeGreaterThan(0);
    }
    expect(rm.phases.some((p) => p.goals.some((g) => /telemetry/i.test(g.text)))).toBe(true);
    expect(parseRoadmap({})).toBeNull();
    expect(parseRoadmap(null)).toBeNull();
  });

  it('reports the current phase and its progress', () => {
    const rm = parseRoadmap({
      phases: [
        { id: 1, name: 'A', tagline: '', status: 'now', aim: '', doneWhen: 'x', feedbackIssue: null, goals: [{ text: 'a', state: 'done' }, { text: 'b', state: 'doing' }, { text: 'c', state: 'todo' }, { text: 'd', state: 'todo' }] },
        { id: 2, name: 'B', tagline: '', status: 'next', aim: '', doneWhen: 'y', feedbackIssue: null, goals: [] },
      ],
    })!;
    expect(progressOf(rm)).toEqual({ current: 0, currentPct: 38, done: 0 });
    expect(statusChip(rm.phases[0]).label).toContain('Now');
    expect(statusChip({ ...rm.phases[1], suggested: true }).label).toBe('Suggested');
  });

  it('counts unseen changelog entries', () => {
    const rm = parseRoadmap(json)!;
    expect(unseen(rm, new Set()).size).toBe(rm.changelog.length);
    expect(unseen(rm, new Set(rm.changelog.map(changelogKey))).size).toBe(0);
  });

  it('turns GitHub issues into suggestions sorted by votes, skipping PRs', () => {
    const s = parseSuggestions([
      { title: 'Low', html_url: 'u1', reactions: { '+1': 1 }, user: { login: 'a' } },
      { title: 'PR', html_url: 'u2', pull_request: {}, reactions: { '+1': 9 } },
      { title: 'High', html_url: 'u3', reactions: { '+1': 4 }, user: { login: 'b' } },
    ]);
    expect(s.map((x) => x.title)).toEqual(['High', 'Low']);
    expect(parseSuggestions({ message: 'rate limited' })).toEqual([]);
  });
});
