#!/usr/bin/env node
// Pull the private context for one day's generation into <work>/context/*.json and compute the planning brief.
// Prints only counts (workflow logs are public).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store } from './lib/store.mjs';
import { loadCurriculum, writeJSON, parseArgs, log, WORK_ROOT, SITE_DIR } from './lib/env.mjs';
import { todayPT, weekdayOf, addDays, daysBetween, ageOn, gestation } from './lib/dates.mjs';

const PHASE_ORDER = ['preconception', 'pregnancy-1', 'pregnancy-2', 'pregnancy-3', 'birth', 'newborn', 'infant', 'toddler'];

export function currentPhase(state, date) {
  if (state?.stage === 'pregnant') {
    const g = gestation(state, date);
    if (!g) return { phase: 'pregnancy-1', label: 'Pregnant (dates not set)' };
    const phase = g.weeks < 14 ? 'pregnancy-1' : g.weeks < 28 ? 'pregnancy-2' : 'pregnancy-3';
    return { phase, label: `Pregnant: ${g.weeks} weeks ${g.days} days; due ${g.due}`, gestation: g };
  }
  if (state?.stage === 'born' && state.birth) {
    const ageDays = daysBetween(state.birth, date);
    const phase = ageDays < 90 ? 'newborn' : ageDays < 365 ? 'infant' : 'toddler';
    return { phase, label: `Baby born ${state.birth}; ${Math.floor(ageDays / 7)} weeks old`, babyAgeDays: ageDays };
  }
  return { phase: 'preconception', label: 'Trying to conceive' };
}

/** How relevant is a unit's phase given where the couple is now? (1 = now, lower = preview/past) */
export function phaseWeight(unitPhase, nowPhase) {
  if (unitPhase === 'any') return 0.72;
  const now = PHASE_ORDER.indexOf(nowPhase);
  const u = PHASE_ORDER.indexOf(unitPhase);
  if (u < 0 || now < 0) return 0.5;
  const delta = u - now;
  if (delta === 0) return 1;
  if (delta < 0) return nowPhase === 'preconception' ? 0.5 : 0.08; // past phases are mostly moot
  return [1, 0.66, 0.56, 0.5, 0.46, 0.4, 0.3, 0.25][delta] ?? 0.2;
}

export function rankCandidates({ curriculum, ledger, date, nowPhase, extraUnits = [] }) {
  const covered = new Set(ledger.map((e) => e.unit));
  const recent = ledger.slice(-14);
  const lastTrack = ledger.at(-1)?.track;
  const secondLastTrack = ledger.at(-2)?.track;
  const counts = Object.fromEntries(curriculum.tracks.map((t) => [t.id, 0]));
  for (const e of recent) counts[e.track] = (counts[e.track] || 0) + 1;
  const expected = recent.length / curriculum.tracks.length;
  const rhythm = curriculum.rhythm[weekdayOf(date)] || [];
  const units = [...curriculum.units, ...extraUnits.filter((u) => !curriculum.units.some((c) => c.id === u.id))];

  const scored = [];
  for (const u of units) {
    if (covered.has(u.id)) continue;
    const reasons = [];
    const pw = phaseWeight(u.phase, nowPhase);
    const prw = { 1: 1, 2: 0.72, 3: 0.48 }[u.pri] ?? 0.5;
    let score = pw * prw;
    reasons.push(`phase ${u.phase} (${pw.toFixed(2)}), priority ${u.pri}`);
    if (rhythm.includes(u.track) || (rhythm.includes('wisdom') && /wisdom/.test(u.id))) { score += 0.22; reasons.push('fits today\'s rhythm'); }
    if (u.track === lastTrack) { score -= 0.6; reasons.push('same track as yesterday'); }
    else if (u.track === secondLastTrack) { score -= 0.15; reasons.push('track used 2 days ago'); }
    const deficit = expected - (counts[u.track] || 0);
    if (recent.length >= 5 && deficit > 0.5) { score += Math.min(0.2, deficit * 0.1); reasons.push('under-represented track lately'); }
    scored.push({ id: u.id, track: u.track, phase: u.phase, pri: u.pri, title: u.title, goals: u.goals, score: Number(score.toFixed(3)), why: reasons.join('; ') });
  }
  scored.sort((a, b) => b.score - a.score);
  return { candidates: scored.slice(0, 14), trackCounts14d: counts, rhythmToday: rhythm, remaining: scored.length };
}

export function pullContext(store, { date, workDir }) {
  const curriculum = loadCurriculum();
  const priv = store.readPrivate();
  const profile = priv.profile || {};
  const state = priv.state || { stage: 'ttc' };
  const priorLedger = (priv.ledger || []).filter((e) => e.date < date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const existing = store.hasDigest(date) ? store.readDigest(date) : null;
  const day = existing ? existing.day : priorLedger.length + 1;

  const now = currentPhase(state, date);
  const ranking = rankCandidates({ curriculum, ledger: priorLedger, date, nowPhase: now.phase, extraUnits: priv.backlog || [] });

  const people = {};
  const born = profile?.people?.yoolim?.born;
  if (born) {
    const a = ageOn(born, date);
    people.yoolimAge = `${a.years} years ${a.months} months`;
  }
  const upcoming = (profile.calendar || [])
    .filter((c) => (c.to || c.from) >= date)
    .map((c) => ({ ...c, startsInDays: daysBetween(date, c.from), ongoing: c.from <= date }));
  const since = addDays(date, -60);
  const inbox = priv.inbox || [];
  const openNotes = inbox.filter((n) => n.status === 'open');

  const brief = {
    date, weekday: weekdayOf(date), day,
    stage: { ...state, ...now },
    people,
    upcoming,
    coveredUnits: priorLedger.map((e) => ({ day: e.day, date: e.date, unit: e.unit, track: e.track, title: e.title })),
    lastTracks: priorLedger.slice(-5).map((e) => e.track),
    trackCounts14d: ranking.trackCounts14d,
    rhythmToday: ranking.rhythmToday,
    candidates: ranking.candidates,
    remainingUnits: ranking.remaining,
    openInbox: openNotes.length,
  };

  const ctx = path.join(workDir, 'context');
  writeJSON(path.join(ctx, 'brief.json'), brief);
  writeJSON(path.join(ctx, 'profile.json'), profile);
  writeJSON(path.join(ctx, 'ledger.json'), priorLedger);
  writeJSON(path.join(ctx, 'inbox.json'), {
    about: 'Emails the couple sent to the digest (replies to the nightly email or notes). "from" is paul or yoolim.',
    open: openNotes.map(({ id, from, date: d, text }) => ({ id, from, date: d, text })),
    recentlyCovered: inbox.filter((n) => n.status === 'covered' && (n.coveredBy || '') >= since).slice(-10)
      .map(({ id, text, coveredBy }) => ({ id, text, coveredBy })),
  });
  return { brief, day, ledger: priorLedger, profile, state };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const date = args.date || todayPT();
  const workDir = path.resolve(args.out || path.join(WORK_ROOT, `${date}-manual`));
  const store = Store.open(path.resolve(args.data || path.join(SITE_DIR, '.data')), process.env.PARENTHOOD_PASSPHRASE);
  const { brief } = pullContext(store, { date, workDir });
  log(`Context for ${date}: day ${brief.day}, ${brief.coveredUnits.length} prior digests, ${brief.candidates.length} candidates, ${brief.openInbox} open notes → ${workDir}`);
}
