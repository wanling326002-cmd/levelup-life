/* LevelUp Life companion core: day boundaries, playtime totals and daily limits.
   Shared by the website (as a normal script, exposed as window.CompanionCore) and the desktop app (require).
   Pure functions only: no clock, storage or network here, so everything can be tested with fixed times. */
/* global module */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompanionCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  /* ---------- days in the user's timezone ---------- */
  const fmtCache = new Map();
  function dayFormatter(tz) {
    let f = fmtCache.get(tz);
    if (!f) { f = new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}); fmtCache.set(tz, f); }
    return f;
  }
  function validTz(tz) { try { dayFormatter(tz); return true; } catch { return false; } }
  // "2026-11-25" for the calendar day that contains ms, in timezone tz
  function dayKey(ms, tz) {
    const p = dayFormatter(tz).formatToParts(new Date(ms));
    const g = t => p.find(x => x.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  }
  // The first millisecond of the next day (handles daylight-saving changes and zones where midnight is skipped).
  function nextDayStart(ms, tz) {
    const today = dayKey(ms, tz);
    let lo = ms, hi = ms + 2 * DAY; // the next day always starts within 48 hours
    while (dayKey(hi, tz) === today) hi += DAY;
    while (hi - lo > 1) { const mid = lo + Math.floor((hi - lo) / 2); if (dayKey(mid, tz) === today) lo = mid; else hi = mid; }
    return hi;
  }
  function dayStart(ms, tz) { // first millisecond of the day containing ms
    const today = dayKey(ms, tz);
    let lo = ms - 2 * DAY, hi = ms;
    while (dayKey(lo, tz) === today) lo -= DAY;
    while (hi - lo > 1) { const mid = lo + Math.floor((hi - lo) / 2); if (dayKey(mid, tz) === today) hi = mid; else lo = mid; }
    return hi;
  }
  // Split [start, end) into pieces that each fall inside one calendar day: [{day, start, end}]
  function splitByDay(start, end, tz) {
    const out = [];
    let s = start;
    while (s < end) {
      const cut = Math.min(end, nextDayStart(s, tz));
      out.push({day: dayKey(s, tz), start: s, end: cut});
      s = cut;
    }
    return out;
  }
  function addDays(day, n) { // calendar arithmetic on "YYYY-MM-DD" keys
    const [y, m, d] = day.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
  }
  function weekDays(day, weekStartsMonday = true) { // the 7 day keys of the week containing day
    const [y, m, d] = day.split('-').map(Number), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const back = weekStartsMonday ? (dow + 6) % 7 : dow;
    return Array.from({length: 7}, (_, i) => addDays(day, i - back));
  }

  /* ---------- intervals ---------- */
  // Merge overlapping [start, end) intervals; returns the merged list.
  function union(intervals) {
    const xs = intervals.filter(i => i.end > i.start).map(i => [i.start, i.end]).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [s, e] of xs) {
      const last = out[out.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e); else out.push([s, e]);
    }
    return out.map(([start, end]) => ({start, end}));
  }
  const totalLength = intervals => intervals.reduce((a, i) => a + Math.max(0, i.end - i.start), 0);
  const unionLength = intervals => totalLength(union(intervals));

  /* ---------- totals ----------
     A segment is one piece of one session inside one day: {id, sid, game, name, day, start, end, open}.
     The same segment can arrive twice (from the device and from the server); ids make that harmless. */
  function dedupe(segments) {
    const m = new Map();
    for (const s of segments) { const k = s.id || `${s.sid}|${s.day}`; const o = m.get(k); if (!o || (s.rev || 0) >= (o.rev || 0)) m.set(k, s); }
    return [...m.values()];
  }
  // Totals for one day: per game (each game's own overlaps merged) and overall (all games merged, so time with two
  // games open at once counts once).
  function dayTotals(segments, day) {
    const segs = dedupe(segments).filter(s => s.day === day && s.end > s.start);
    const games = new Map();
    for (const s of segs) {
      const g = games.get(s.game) || {game: s.game, name: s.name, intervals: []};
      g.intervals.push(s); if (s.name) g.name = s.name; games.set(s.game, g);
    }
    const perGame = {};
    for (const g of games.values()) perGame[g.game] = {game: g.game, name: g.name, ms: unionLength(g.intervals)};
    return {day, overallMs: unionLength(segs), perGame};
  }
  function history(segments, lastDay, days) { // [{day, overallMs, perGame}] oldest first
    const out = [];
    for (let i = days - 1; i >= 0; i--) out.push(dayTotals(segments, addDays(lastDay, -i)));
    return out;
  }

  /* ---------- limits ---------- */
  // limitMin: minutes allowed per day, or null/0 for no limit
  function limitStatus(usedMs, limitMin) {
    if (!(limitMin > 0)) return {hasLimit: false, usedMs, limitMs: 0, remainingMs: Infinity, overtimeMs: 0, reached: false, fraction: 0};
    const limitMs = limitMin * MIN, remainingMs = Math.max(0, limitMs - usedMs);
    return {hasLimit: true, usedMs, limitMs, remainingMs, overtimeMs: Math.max(0, usedMs - limitMs), reached: usedMs >= limitMs, fraction: Math.min(1, usedMs / limitMs)};
  }
  const WARN_AT = [30, 10, 0]; // minutes left
  /* Which warnings to send now for one target (a game or "overall") on one day.
     - A warning only exists if the limit is bigger than its threshold (a 20-minute limit has no 30-minute warning;
       0 = "limit reached" always exists when there is a limit).
     - Each warning is sent at most once per day (sentKeys remembers them).
     - If several thresholds were crossed since the last check (for example the app was closed), only the most
       urgent one is sent and the others are marked as passed.
     Returns {send: [threshold], mark: [threshold]} — mark includes send. */
  function warningsDue(usedMs, limitMin, sent) {
    const st = limitStatus(usedMs, limitMin);
    if (!st.hasLimit) return {send: [], mark: []};
    const eligible = WARN_AT.filter(t => t === 0 || limitMin > t);
    const crossed = eligible.filter(t => st.remainingMs <= t * MIN && !(sent && sent.includes(t)));
    if (!crossed.length) return {send: [], mark: []};
    const most = Math.min(...crossed);
    return {send: [most], mark: crossed};
  }
  function warningText(threshold, targetName, isOverall) {
    const what = isOverall ? 'gaming' : targetName;
    if (threshold === 0) return {title: 'Daily limit reached', body: isOverall ? "You've reached today's gaming limit. Time keeps counting as overtime." : `You've reached today's limit for ${targetName}. Time keeps counting as overtime.`};
    return {title: `${threshold} minutes left`, body: `${threshold} minutes of ${what} left today.`};
  }

  /* ---------- formatting ---------- */
  function fmtDuration(ms) {
    const m = Math.floor(Math.max(0, ms) / MIN), h = Math.floor(m / 60);
    return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
  }
  function fmtClock(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return {MIN, HOUR, DAY, WARN_AT, validTz, dayKey, nextDayStart, dayStart, splitByDay, addDays, weekDays, union, unionLength, totalLength,
    dedupe, dayTotals, history, limitStatus, warningsDue, warningText, fmtDuration, fmtClock};
});
