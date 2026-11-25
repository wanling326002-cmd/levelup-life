// Day boundaries, midnight splits, overlap merging and limit maths (web/companion-core.js).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const core = require('../../web/companion-core.js');
const {at, MIN} = require('./helpers');

test('dayKey follows the chosen timezone, not UTC', () => {
  const ms = Date.UTC(2026, 10, 25, 22, 30); // 22:30 UTC = 00:30 the next day in South Africa (UTC+2)
  assert.equal(core.dayKey(ms, 'UTC'), '2026-11-25');
  assert.equal(core.dayKey(ms, 'Africa/Johannesburg'), '2026-11-26');
  assert.equal(core.dayKey(ms, 'America/New_York'), '2026-11-25');
});

test('nextDayStart is local midnight', () => {
  const ms = at('2026-11-25T23:59:30');
  assert.equal(core.nextDayStart(ms, 'Africa/Johannesburg'), at('2026-11-26T00:00:00'));
  assert.equal(core.dayStart(ms, 'Africa/Johannesburg'), at('2026-11-25T00:00:00'));
});

test('a session crossing midnight is split between the two days', () => {
  const parts = core.splitByDay(at('2026-11-25T23:50'), at('2026-11-26T00:20'), 'Africa/Johannesburg');
  assert.deepEqual(parts.map(p => [p.day, (p.end - p.start) / MIN]), [['2026-11-25', 10], ['2026-11-26', 20]]);
});

test('a session spanning several days is split into each day', () => {
  const parts = core.splitByDay(at('2026-11-25T22:00'), at('2026-11-28T01:00'), 'Africa/Johannesburg');
  assert.deepEqual(parts.map(p => [p.day, (p.end - p.start) / MIN]), [['2026-11-25', 120], ['2026-11-26', 1440], ['2026-11-27', 1440], ['2026-11-28', 60]]);
});

test('daylight saving days have 23 or 25 hours', () => {
  const tz = 'America/New_York';
  const spring = core.splitByDay(at('2026-03-08T00:00', tz), at('2026-03-09T00:00', tz), tz); // clocks jump forward
  assert.equal(spring.length, 1); assert.equal((spring[0].end - spring[0].start) / MIN, 23 * 60);
  const fall = core.splitByDay(at('2026-11-01T00:00', tz), at('2026-11-02T00:00', tz), tz); // clocks go back
  assert.equal(fall.length, 1); assert.equal((fall[0].end - fall[0].start) / MIN, 25 * 60);
});

test('a zone where midnight is skipped still splits at the real start of the day', () => {
  const tz = 'America/Santiago'; // in September clocks jump from 00:00 to 01:00
  const start = at('2026-09-05T23:30', tz);
  const parts = core.splitByDay(start, start + 60 * MIN, tz);
  assert.deepEqual(parts.map(p => [p.day, (p.end - p.start) / MIN]), [['2026-09-05', 30], ['2026-09-06', 30]]);
  assert.equal(core.dayKey(parts[1].start, tz), '2026-09-06');
  assert.equal(core.dayKey(parts[1].start - 1, tz), '2026-09-05');
});

test('overlapping time counts once', () => {
  const t = at('2026-11-25T10:00');
  const segs = [
    {id: 'a', game: 'g1', name: 'One', day: '2026-11-25', start: t, end: t + 60 * MIN},
    {id: 'b', game: 'g2', name: 'Two', day: '2026-11-25', start: t + 30 * MIN, end: t + 90 * MIN},
  ];
  const d = core.dayTotals(segs, '2026-11-25');
  assert.equal(d.perGame.g1.ms, 60 * MIN);
  assert.equal(d.perGame.g2.ms, 60 * MIN);
  assert.equal(d.overallMs, 90 * MIN); // not 120
});

test('the same segment received twice is counted once (newest revision wins)', () => {
  const t = at('2026-11-25T10:00');
  const segs = [
    {id: 's1_2026-11-25', sid: 's1', game: 'g1', day: '2026-11-25', start: t, end: t + 10 * MIN, rev: 1, open: true},
    {id: 's1_2026-11-25', sid: 's1', game: 'g1', day: '2026-11-25', start: t, end: t + 40 * MIN, rev: 2},
    {id: 's1_2026-11-25', sid: 's1', game: 'g1', day: '2026-11-25', start: t, end: t + 40 * MIN, rev: 2},
  ];
  assert.equal(core.dayTotals(segs, '2026-11-25').overallMs, 40 * MIN);
});

test('limit status: remaining, reached and overtime', () => {
  const s = core.limitStatus(75 * MIN, 60);
  assert.equal(s.reached, true); assert.equal(s.remainingMs, 0); assert.equal(s.overtimeMs, 15 * MIN); assert.equal(s.fraction, 1);
  const n = core.limitStatus(45 * MIN, 60);
  assert.equal(n.reached, false); assert.equal(n.remainingMs, 15 * MIN);
  assert.equal(core.limitStatus(10 * MIN, 0).hasLimit, false);
});

test('warnings: thresholds bigger than the limit are skipped', () => {
  assert.deepEqual(core.warningsDue(0, 20, []).send, []); // 20-minute limit: no 30-minute warning, ever
  assert.deepEqual(core.warningsDue(10 * MIN, 20, []).send, [10]);
  assert.deepEqual(core.warningsDue(20 * MIN, 20, [10]).send, [0]);
  assert.deepEqual(core.warningsDue(0, 10, []).send, []); // a 10-minute limit only gets "reached"
  assert.deepEqual(core.warningsDue(10 * MIN, 10, []).send, [0]);
});

test('warnings: when several thresholds pass at once only the most urgent is sent', () => {
  const due = core.warningsDue(55 * MIN, 60, []);
  assert.deepEqual(due.send, [10]);
  assert.deepEqual(due.mark.sort((a, b) => a - b), [10, 30]);
  assert.deepEqual(core.warningsDue(70 * MIN, 60, []).send, [0]);
});

test('week days run Monday to Sunday and history covers each day', () => {
  assert.deepEqual(core.weekDays('2026-11-25'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  assert.equal(core.history([], '2026-11-25', 7).length, 7);
  assert.equal(core.addDays('2026-12-31', 1), '2027-01-01');
});
