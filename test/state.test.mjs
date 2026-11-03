import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/state.js';

const MIN = 60000;
const T0 = new Date('2026-01-05T09:00:00').getTime();
const run = (s, minutes, presence = 'active', start = s.lastTick) => {
  const events = [];
  for (let i = 1; i <= minutes; i++) events.push(...S.tick(s, start + i * MIN, presence));
  return events;
};

test('egg does not decay until the first care action hatches it', () => {
  const s = S.createState(T0);
  run(s, 120);
  assert.equal(s.stats.hydration, 100);
  assert.equal(S.stageOf(s).id, 'egg');
  S.drink(s, s.lastTick);
  assert.equal(S.stageOf(s).id, 'baby');
});

test('stats decay to the low line after the configured interval and notify once', () => {
  const s = S.createState(T0);
  S.drink(s, T0);
  const events = run(s, 21);
  assert.ok(s.stats.eyes < 50 && s.stats.eyes > 47);
  assert.deepEqual(events.filter((e) => e.stat === 'eyes'), [{ stat: 'eyes', level: 'low' }]);
  assert.equal(S.minutesUntilLow(s, 'eyes'), 0);
});

test('eye break needs 20 seconds and refills eyes', () => {
  const s = S.createState(T0);
  S.drink(s, T0);
  run(s, 15);
  S.startEyeBreak(s, s.lastTick);
  assert.equal(S.finishEyeBreak(s, s.lastTick + 5000), false);
  assert.equal(S.finishEyeBreak(s, s.lastTick + 20000), true);
  assert.equal(s.stats.eyes, 100);
  assert.equal(s.today.look, 1);
});

test('no decay while idle/locked, and coming back counts as a stand-up', () => {
  const s = S.createState(T0);
  S.drink(s, T0);
  run(s, 30);
  const movement = s.stats.movement;
  run(s, 10, 'locked');
  assert.equal(s.stats.movement, movement);
  assert.equal(s.stats.eyes, 100);
  run(s, 1, 'active');
  assert.ok(s.stats.movement > 98);
  assert.equal(s.today.stand, 1);
});

test('computer sleeping overnight does not kill the pet', () => {
  const s = S.createState(T0);
  S.drink(s, T0);
  S.tick(s, T0 + 10 * 60 * MIN, 'active');
  assert.equal(s.pet.alive, true);
  assert.equal(s.stats.movement, 100);
});

test('long neglect while active kills the pet; rebirth starts a new generation', () => {
  const s = S.createState(T0);
  S.drink(s, T0);
  const events = run(s, 400);
  assert.equal(s.pet.alive, false);
  assert.ok(events.some((e) => e.level === 'died'));
  assert.equal(S.moodOf(s), 'dead');
  S.rebirth(s, s.lastTick);
  assert.equal(s.pet.alive, true);
  assert.equal(s.pet.generation, 2);
  assert.equal(S.stageOf(s).id, 'egg');
});

test('urgent reminders repeat but respect snooze', () => {
  const s = S.createState(T0);
  S.drink(s, T0);
  run(s, 32); // eyes below 20
  S.snooze(s, 'eyes', 60, s.lastTick);
  const ev = run(s, 30);
  assert.equal(ev.filter((e) => e.stat === 'eyes').length, 0);
});

test('spamming buttons does not farm xp', () => {
  const s = S.createState(T0);
  for (let i = 0; i < 10; i++) S.drink(s, T0);
  assert.equal(s.pet.xp, 0);
});

test('paused care freezes stats', () => {
  const s = S.createState(T0);
  S.drink(s, T0);
  S.updateSettings(s, { paused: true });
  run(s, 60);
  assert.equal(s.stats.eyes, 100);
});

test('on-page pet can be hidden per site or everywhere', () => {
  const s = S.createState(T0);
  assert.equal(S.showsOn(s, 'example.com'), true);
  S.hideOnSite(s, 'example.com');
  S.hideOnSite(s, 'example.com');
  assert.deepEqual(s.settings.hiddenSites, ['example.com']);
  assert.equal(S.showsOn(s, 'example.com'), false);
  assert.equal(S.showsOn(s, 'other.org'), true);
  S.updateSettings(s, { showOnPages: false });
  assert.equal(S.showsOn(s, 'other.org'), false);
  assert.deepEqual(s.settings.hiddenSites, ['example.com']);
});

test('older saved states pick up the new on-page settings', () => {
  const old = S.createState(T0);
  delete old.settings.showOnPages;
  delete old.settings.hiddenSites;
  const s = S.migrate(old, T0);
  assert.equal(S.showsOn(s, 'example.com'), true);
});
