// Headless playtest of the room rules: join, grab, swipe, place, stash, round reset.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Sim from '../public/js/sim.js';
import { TRUCK_ZONE, ITEM_TYPES, MAX_PUSHERS } from '../public/js/itemdata.js';

function joinPlayer(room, name, char) {
  const inbox = [];
  const p = Sim.addPlayer(room, (m) => inbox.push(JSON.parse(JSON.stringify(m))));
  Sim.onMessage(room, p, { t: 'join', name, char });
  return { p, inbox, last: (t) => inbox.filter((m) => m.t === t).at(-1) };
}
const send = (room, pl, m) => Sim.onMessage(room, pl.p, m);

test('crew heist: grab, fill, stash, score split, round reset', () => {
  const room = Sim.createRoom('TEST');
  const a = joinPlayer(room, 'Ann', 'chunk');
  const b = joinPlayer(room, 'Bo', 'spike');
  assert.equal(a.last('welcome').id, a.p.id);
  assert.equal(a.last('pjoin').player.name, 'Bo');

  // Messages before join are ignored.
  const ghost = Sim.addPlayer(room, () => {});
  Sim.onMessage(room, ghost, { t: 'pick', type: 'tv' });
  assert.equal(Object.keys(room.items).length, 0);

  const cart = room.carts.cart1;
  for (const pl of [a, b]) send(room, pl, { t: 'move', x: cart.x, z: cart.z - 1, rot: 0 });
  send(room, a, { t: 'grab', cartId: 'cart1' });
  send(room, b, { t: 'grab', cartId: 'cart1' });
  assert.deepEqual(cart.pushers, [a.p.id, b.p.id]);
  assert.equal(cart.authority, a.p.id);

  // Only the authority can move the cart.
  send(room, b, { t: 'cartMove', cartId: 'cart1', x: 99, z: 99, rot: 0 });
  assert.notEqual(cart.x, 99);

  send(room, a, { t: 'pick', type: 'laptop' });
  send(room, a, { t: 'place', cartId: 'cart1' });
  send(room, b, { t: 'pick', type: 'tv' });
  send(room, b, { t: 'place', cartId: 'cart1' });
  assert.equal(Object.values(room.items).filter((i) => i.state === 'cart').length, 2);

  // Stash far from the truck does nothing, at the truck scores for every pusher.
  send(room, a, { t: 'stash', cartId: 'cart1' });
  assert.equal(a.p.score, 0);
  send(room, a, { t: 'cartMove', cartId: 'cart1', x: TRUCK_ZONE.x, z: TRUCK_ZONE.z, rot: 0 });
  send(room, a, { t: 'stash', cartId: 'cart1' });
  const total = ITEM_TYPES.laptop.price + ITEM_TYPES.tv.price;
  assert.equal(a.p.score, total);
  assert.equal(b.p.score, total);
  assert.equal(Object.keys(room.items).length, 0);
  assert.equal(b.last('stash').total, total);

  // Authority hands over when the first pusher leaves.
  Sim.removePlayer(room, a.p);
  assert.equal(cart.authority, b.p.id);
  assert.equal(b.last('pleave').id, a.p.id);

  // Round ends, leaderboard, then reset.
  for (let t = 0; t < Sim.ROUND_SECONDS + 1; t += 0.05) Sim.step(room, 0.05);
  assert.ok(room.roundOver);
  assert.equal(b.last('roundOver').board[0].score, total);
  for (let t = 0; t < Sim.RESET_DELAY_S + 1; t += 0.05) Sim.step(room, 0.05);
  assert.ok(!room.roundOver);
  assert.equal(b.p.score, 0);
  assert.ok(b.last('reset'));
});

test('cart caps pushers at MAX_PUSHERS', () => {
  const room = Sim.createRoom('CAP');
  const cart = room.carts.cart2;
  const crew = Array.from({ length: MAX_PUSHERS + 1 }, (_, i) => joinPlayer(room, 'P' + i, 'bean'));
  for (const pl of crew) { send(room, pl, { t: 'move', x: cart.x, z: cart.z, rot: 0 }); send(room, pl, { t: 'grab', cartId: 'cart2' }); }
  assert.equal(cart.pushers.length, MAX_PUSHERS);
});
