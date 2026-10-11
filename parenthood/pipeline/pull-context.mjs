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
  // While trying: a reported period start (state.lmp) gives today's cycle day; ignore it once it's two months old.
  const cycleDay = state?.lmp ? daysBetween(state.lmp, date) + 1 : 0;
  if (cycleDay >= 1 && cycleDay <= 60) {
    return { phase: 'preconception', label: `Trying to conceive; cycle day ${cycleDay} (period started ${state.lmp})`, cycleDay };
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
  const w = [1, 0.66, 0.56, 0.5, 0.46, 0.4, 0.3, 0.25][delta] ?? 0.2;
  // While trying, birth and baby topics are many months away: they can wait.
  return nowPhase === 'preconception' && delta >= 4 ? w * 0.6 : w;
}

/** How many of the last 7 digests were on the current stage's own topics, and how many should be. */
export function nowQuota({ ledger, units, nowPhase }) {
  const phaseOf = new Map(units.map((u) => [u.id, u.phase]));
  const covered = new Set(ledger.map((e) => e.unit));
  const last7 = ledger.slice(-7);
  const nowLast7 = last7.filter((e) => (phaseOf.get(e.unit) ?? phaseOf.get(String(e.unit).replace(/\.\d+$/, ''))) === nowPhase).length;
  const priorityNowLeft = units.filter((u) => u.phase === nowPhase && u.pri === 1 && !covered.has(u.id)).map((u) => u.id);
  const target = priorityNowLeft.length ? 5 : 4; // per 7 days: front-load what matters now
  const needed = Math.round((target * last7.length) / 7);
  return { nowLast7, ofLast: last7.length, target, behind: nowLast7 < needed, priorityNowLeft };
}

export function rankCandidates({ curriculum, ledger, date, nowPhase, extraUnits = [], upcoming = [], feedbackByTrack = {} }) {
  const covered = new Set(ledger.map((e) => e.unit));
  const recent = ledger.slice(-14);
  const lastTrack = ledger.at(-1)?.track;
  const secondLastTrack = ledger.at(-2)?.track;
  const counts = Object.fromEntries(curriculum.tracks.map((t) => [t.id, 0]));
  for (const e of recent) counts[e.track] = (counts[e.track] || 0) + 1;
  const expected = recent.length / curriculum.tracks.length;
  const rhythm = curriculum.rhythm[weekdayOf(date)] || [];
  const units = [...curriculum.units, ...extraUnits.filter((u) => !curriculum.units.some((c) => c.id === u.id))];
  const quota = nowQuota({ ledger, units, nowPhase });
  const soon = upcoming.filter((c) => c.ongoing || (c.startsInDays >= 0 && c.startsInDays <= 60));

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
    if (quota.behind && u.phase === nowPhase) {
      score += u.pri === 1 ? 0.4 : 0.3;
      reasons.push(`a "now" topic, and only ${quota.nowLast7} of the last ${quota.ofLast} digests were`);
    }
    // Until every priority-1 topic of this stage is covered, those come before lower-priority ones of the same stage.
    if (u.phase === nowPhase && u.pri === 1 && quota.priorityNowLeft.length) {
      score += 0.25;
      reasons.push(`one of ${quota.priorityNowLeft.length} priority topics for now still to cover`);
    }
    const event = u.before?.length && soon.find((c) => u.before.some((k) => String(c.what || '').toLowerCase().includes(k)));
    if (event) {
      score += 0.35 * Math.max(0.3, 1 - Math.max(0, event.startsInDays) / 60);
      reasons.push(`belongs before an upcoming date (${event.ongoing ? 'now' : `in ${event.startsInDays} days`})`);
    }
    const fb = feedbackByTrack[u.track] || 0;
    if (fb) {
      score += Math.max(-0.2, Math.min(0.2, fb * 0.06));
      reasons.push(`their feedback on this track (${fb > 0 ? '+' : ''}${fb})`);
    }
    scored.push({ id: u.id, track: u.track, phase: u.phase, pri: u.pri, title: u.title, goals: u.goals, score: Number(score.toFixed(3)), why: reasons.join('; ') });
  }
  scored.sort((a, b) => b.score - a.score);
  return { candidates: scored.slice(0, 14), trackCounts14d: counts, rhythmToday: rhythm, remaining: scored.length, quota };
}

/** Net one-tap feedback per track over the last 60 days (+1 "more like this", -1 "less like this"). */
export function feedbackByTrack(feedback = [], date) {
  const since = addDays(date, -60);
  const out = {};
  for (const f of feedback) if (f.track && f.date >= since && f.date < date) out[f.track] = (out[f.track] || 0) + (f.vote > 0 ? 1 : -1);
  return out;
}

/** Korean lessons for the writer and the Korean editor: recurring ones first (they are house rules). */
export function koLessonsContext(priv) {
  const rules = Object.values(priv.koRules || {}).sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
  const strip = ({ key, rule, before, after, count }) => ({ key, rule, example: { before, after }, seen: count });
  return {
    about: 'What the Korean editor keeps correcting. houseRules recurred (seen 2+ times): follow them like the style guide. '
      + 'recent are newer, one-off lessons. Reuse a key when you report the same pattern again.',
    houseRules: rules.filter((r) => r.count >= 2).slice(0, 25).map(strip),
    recent: rules.filter((r) => r.count < 2).slice(0, 15).map(strip),
    older: (priv.koLessons || []).slice(-10), // lessons recorded before rules had keys
  };
}

export function pullContext(store, { date, workDir }) {
  const curriculum = loadCurriculum();
  const priv = store.readPrivate();
  const profile = priv.profile || {};
  const state = priv.state || { stage: 'ttc' };
  const priorLedger = (priv.ledger || []).filter((e) => e.date < date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const existing = store.hasDigest(date) ? store.readDigest(date) : null;
  const day = existing ? existing.day : priorLedger.length + 1;

  const upcoming = (profile.calendar || [])
    .filter((c) => (c.to || c.from) >= date)
    .map((c) => ({ ...c, startsInDays: daysBetween(date, c.from), ongoing: c.from <= date }));
  const feedback = (priv.feedback || []).filter((f) => f.date < date);
  const now = currentPhase(state, date);
  const ranking = rankCandidates({
    curriculum, ledger: priorLedger, date, nowPhase: now.phase, extraUnits: priv.backlog || [],
    upcoming, feedbackByTrack: feedbackByTrack(feedback, date),
  });

  const people = {};
  const born = profile?.people?.yoolim?.born;
  if (born) {
    const a = ageOn(born, date);
    people.yoolimAge = `${a.years} years ${a.months} months`;
  }
  const since = addDays(date, -60);
  const inbox = priv.inbox || [];
  const openNotes = inbox.filter((n) => n.status === 'open');

  const brief = {
    date, weekday: weekdayOf(date), day,
    stage: { ...state, ...now },
    people,
    upcoming,
    planning: {
      about: 'Front-load what matters now. "now" topics are units of the current stage. While behind the target, '
        + 'pick a now topic unless a note or an upcoming date clearly comes first.',
      ...ranking.quota,
    },
    coveredUnits: priorLedger.map((e) => ({ day: e.day, date: e.date, unit: e.unit, track: e.track, title: e.title })),
    lastTracks: priorLedger.slice(-5).map((e) => e.track),
    trackCounts14d: ranking.trackCounts14d,
    rhythmToday: ranking.rhythmToday,
    candidates: ranking.candidates,
    remainingUnits: ranking.remaining,
    openInbox: openNotes.length,
  };

  const byDay = new Map(priorLedger.map((e) => [e.day, e]));
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
  writeJSON(path.join(ctx, 'facts.json'), {
    about: 'Lasting facts they told the digest (results, decisions, dates, plans), newest wins. Trust these over older notes.',
    facts: Object.entries(priv.facts || {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, f]) => ({ key, fact: f.value, since: f.date })),
  });
  writeJSON(path.join(ctx, 'feedback.json'), {
    about: 'One-tap reactions to earlier digests from the nightly email: +1 "more like this", -1 "less like this", with any comment.',
    byTrack60d: feedbackByTrack(feedback, date),
    recent: feedback.slice(-30).map((f) => ({ day: f.day, title: byDay.get(f.day)?.title, unit: f.unit, from: f.from, vote: f.vote, comment: f.comment || undefined })),
  });
  writeJSON(path.join(ctx, 'ko-lessons.json'), koLessonsContext(priv));
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
