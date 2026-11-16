'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const panel = require('./bulk-panel');

test('one private panel holds the sport, team, player, stat and submit controls', () => {
  const state = panel.start({ ownerId: 'a', channelId: 'c', leagues: ['NBA', 'NFL'],
    now: new Date('2026-11-16T18:00:00Z') });
  const view = panel.render(state);
  assert.equal(view.components.length, 5);
  assert.deepEqual(view.components.slice(0, 4).map(row => row.components[0].data.custom_id.split(':')[2]),
    ['sport', 'team', 'player', 'stat']);
  assert.equal(view.components[4].components.at(-1).data.disabled, true);
});

test('sessions are bound to one member and expire at midnight Pacific', () => {
  const state = panel.start({ ownerId: 'a', channelId: 'c', leagues: ['NBA'],
    now: new Date('2026-11-16T18:00:00Z') });
  assert.equal(panel.get(state.id, 'a', new Date('2026-11-16T18:05:00Z')), state);
  assert.throws(() => panel.get(state.id, 'b', new Date('2026-11-16T18:05:00Z')), /belongs|expired/);
  const next = panel.start({ ownerId: 'a', channelId: 'c', leagues: ['NBA'],
    now: new Date('2026-11-17T07:59:00Z') });
  assert.throws(() => panel.get(next.id, 'a', new Date('2026-11-17T08:00:00Z')), /reset/);
});

test('the quoted-line picker remains on one five-row panel with Discord-safe paging', () => {
  const state = panel.start({ ownerId: 'a', channelId: 'c', leagues: ['NBA'],
    now: new Date('2026-11-16T18:00:00Z') });
  state.sport = 'NBA';
  state.teams = [{ label: 'BOS · Boston Celtics', value: 'BOS' }];
  state.players = [{ label: 'Payton Pritchard', value: '1' }];
  state.selectedStats = ['assists'];
  state.controlMode = 'line';
  state.ladderOptions = Array.from({ length: 30 }, (_, i) =>
    ({ label: `${i + 0.5} (-110)`, value: String(i + 0.5) }));
  const view = panel.render(state);
  assert.equal(view.components.length, 5);
  const values = view.components[4].components[0].toJSON().options.map(row => row.value);
  assert.equal(values.length, 25);
  assert.ok(values.includes('next'));
  assert.ok(values.includes('back'));
});
