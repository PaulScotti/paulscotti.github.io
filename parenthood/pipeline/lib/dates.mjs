// Date helpers pinned to Pacific time (the digest's "day" is a Pacific-time calendar date).
export const TZ = 'America/Los_Angeles';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** {date:'YYYY-MM-DD', hour, minute, second} for an instant, in Pacific time. */
export function ptParts(instant = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(instant).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute, second: +p.second };
}

export function todayPT(instant = new Date()) {
  return ptParts(instant).date;
}

export function isDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function weekdayOf(dateStr) {
  return WEEKDAYS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/** Epoch ms of a Pacific wall-clock time on a date (handles PST/PDT). */
export function ptWallTimeToEpoch(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  for (const offset of [7, 8]) {
    const t = Date.UTC(y, m - 1, d, hour + offset, minute);
    const p = ptParts(new Date(t));
    if (p.date === dateStr && p.hour === hour && p.minute === minute) return t;
  }
  throw new Error(`Cannot resolve ${dateStr} ${hour}:${minute} in ${TZ}`);
}

/** "39 years 9 months" style age from 'YYYY-MM' or 'YYYY-MM-DD'. */
export function ageOn(birth, dateStr) {
  const [by, bm] = birth.split('-').map(Number);
  const [y, m] = dateStr.split('-').map(Number);
  let months = (y - by) * 12 + (m - bm);
  const years = Math.floor(months / 12);
  months -= years * 12;
  return { years, months };
}

/** Gestational age from LMP (or due date) on a given date. */
export function gestation({ lmp, due }, dateStr) {
  const start = lmp || (due ? addDays(due, -280) : null);
  if (!start) return null;
  const days = daysBetween(start, dateStr);
  return { weeks: Math.floor(days / 7), days: days % 7, totalDays: days, due: due || addDays(start, 280) };
}
