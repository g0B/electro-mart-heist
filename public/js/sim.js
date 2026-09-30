// Electro Mart Heist — authoritative room rules (render-free; runs in the host's browser
// and in Node for tests). Players are client-authoritative for their own movement. Each
// cart has one "authority" (its first pusher) that simulates the cart + the physics of the
// items inside it and streams transforms to everyone else. The room owns item lifecycle,
// scoring and rounds.
import { ITEM_TYPES, TRUCK_ZONE, CART_SPAWNS, MAX_PUSHERS, PLAYER_SPAWN } from './itemdata.js';

export const TICK_MS = 50;           // 20 Hz snapshots
export const ROUND_SECONDS = 240;
export const RESET_DELAY_S = 10;

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const cartPublic = (c) => ({ id: c.id, x: c.x, z: c.z, rot: c.rot, pushers: c.pushers, authority: c.authority });
const playerPublic = (p) => ({ id: p.id, name: p.name, char: p.char, x: p.x, z: p.z, rot: p.rot, anim: p.anim, holding: p.holding, cartId: p.cartId, score: p.score });

function makeCarts() {
  const carts = {};
  CART_SPAWNS.forEach(([x, z, rot], i) => {
    carts['cart' + (i + 1)] = { id: 'cart' + (i + 1), x, z, rot, pushers: [], authority: null };
  });
  return carts;
}

export function createRoom(code = '') {
  return {
    code, nextId: 1, players: new Map(), carts: makeCarts(), items: {},
    roundRemaining: ROUND_SECONDS, roundOver: false, resetIn: 0,
  };
}

// A connection opens: the player exists but only becomes visible once it sends 'join'.
export function addPlayer(room, send) {
  const id = 'p' + room.nextId++;
  const p = { id, send, name: 'Shopper', char: 'spike', x: PLAYER_SPAWN.x + (Math.random() - 0.5) * PLAYER_SPAWN.spread, z: PLAYER_SPAWN.z, rot: Math.PI, anim: 'idle', holding: null, cartId: null, score: 0, joined: false };
  room.players.set(id, p);
  return p;
}

export function removePlayer(room, p) {
  if (!room.players.has(p.id)) return;
  removePusher(room, p);
  dropHeld(room, p);
  room.players.delete(p.id);
  if (p.joined) broadcast(room, { t: 'pleave', id: p.id });
}

function broadcast(room, msg, exceptId = null) {
  for (const p of room.players.values()) if (p.id !== exceptId && p.joined) p.send(msg);
}
const scores = (room) => [...room.players.values()].map((p) => [p.id, p.score]);

function removePusher(room, p) {
  const cart = room.carts[p.cartId];
  p.cartId = null;
  if (!cart) return;
  cart.pushers = cart.pushers.filter((id) => id !== p.id);
  if (cart.authority === p.id) cart.authority = cart.pushers[0] || null;
  broadcast(room, { t: 'cartUpdate', cart: cartPublic(cart) });
}

function dropHeld(room, p) {
  if (!p.holding) return;
  const id = p.holding;
  p.holding = null;
  delete room.items[id];
  broadcast(room, { t: 'itemRemove', id });
}

const handlers = {
  join(room, p, m) {
    if (p.joined) return;
    p.name = String(m.name || 'Shopper').slice(0, 14) || 'Shopper';
    p.char = ['spike', 'lizzie', 'bean', 'chunk'].includes(m.char) ? m.char : 'spike';
    p.joined = true;
    p.send({
      t: 'welcome', id: p.id, room: room.code,
      players: [...room.players.values()].filter((q) => q.joined).map(playerPublic),
      carts: Object.values(room.carts).map(cartPublic),
      items: Object.values(room.items),
      roundRemaining: room.roundRemaining,
      roundOver: room.roundOver,
    });
    broadcast(room, { t: 'pjoin', player: playerPublic(p) }, p.id);
  },
  move(room, p, m) {
    p.x = +m.x || 0; p.z = +m.z || 0; p.rot = +m.rot || 0; p.anim = String(m.anim || 'idle');
  },
  grab(room, p, m) {
    const cart = room.carts[m.cartId];
    if (!cart || p.cartId || room.roundOver) return;
    if (cart.pushers.length >= MAX_PUSHERS) return;
    if (dist(p.x, p.z, cart.x, cart.z) > 3.2) return;
    cart.pushers.push(p.id);
    if (!cart.authority) cart.authority = p.id;
    p.cartId = cart.id;
    broadcast(room, { t: 'cartUpdate', cart: cartPublic(cart) });
  },
  release(room, p) { if (p.cartId) removePusher(room, p); },
  cartMove(room, p, m) {
    const cart = room.carts[m.cartId];
    if (!cart || cart.authority !== p.id) return;
    cart.x = +m.x || 0; cart.z = +m.z || 0; cart.rot = +m.rot || 0;
  },
  pick(room, p, m) {
    if (p.holding || room.roundOver || !ITEM_TYPES[m.type]) return;
    const id = 'i' + room.nextId++;
    room.items[id] = { id, type: m.type, state: 'held', holder: p.id, simCart: null, p: [p.x, 2.3, p.z], q: [0, 0, 0, 1] };
    p.holding = id;
    broadcast(room, { t: 'itemUpdate', item: room.items[id] });
  },
  pickLoose(room, p, m) {
    const it = room.items[m.itemId];
    if (!it || it.state !== 'loose' || p.holding || room.roundOver) return;
    if (dist(p.x, p.z, it.p[0], it.p[2]) > 2.6) return;
    it.state = 'held'; it.holder = p.id; it.simCart = null;
    p.holding = it.id;
    broadcast(room, { t: 'itemUpdate', item: it });
  },
  place(room, p, m) {
    const it = room.items[p.holding];
    const cart = room.carts[m.cartId];
    if (!it || !cart || room.roundOver) return;
    if (dist(p.x, p.z, cart.x, cart.z) > 3.0) return;
    it.state = 'cart'; it.holder = null; it.simCart = cart.id;
    // Drop point: above the basket centre with a little jitter so stacks aren't perfect.
    it.p = [cart.x + (Math.random() - 0.5) * 0.15, 1.45, cart.z + (Math.random() - 0.5) * 0.15];
    const a = Math.random() * Math.PI;
    it.q = [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
    p.holding = null;
    broadcast(room, { t: 'itemUpdate', item: it });
  },
  returnItem(room, p) { dropHeld(room, p); },
  isync(room, p, m) {
    const cart = room.carts[m.cartId];
    if (!cart || cart.authority !== p.id || !Array.isArray(m.items)) return;
    for (const e of m.items) {
      const it = room.items[e[0]];
      if (!it || it.simCart !== cart.id || it.state === 'held') continue;
      it.p = [e[1], e[2], e[3]]; it.q = [e[4], e[5], e[6], e[7]];
      it.state = e[8] === 'loose' ? 'loose' : 'cart';
    }
    broadcast(room, { t: 'isync', cartId: cart.id, items: m.items }, p.id);
  },
  stash(room, p, m) {
    const cart = room.carts[m.cartId];
    if (!cart || !cart.pushers.includes(p.id) || room.roundOver) return;
    if (dist(cart.x, cart.z, TRUCK_ZONE.x, TRUCK_ZONE.z) > TRUCK_ZONE.r + 0.3) return;
    const inCart = Object.values(room.items).filter((it) => it.state === 'cart' && it.simCart === cart.id);
    if (!inCart.length) { p.send({ t: 'toast', text: 'Nothing in the cart to stash!' }); return; }
    const total = inCart.reduce((s, it) => s + ITEM_TYPES[it.type].price, 0);
    const names = [];
    for (const id of cart.pushers) { const q = room.players.get(id); if (q) { q.score += total; names.push(q.name); } }
    for (const it of inCart) delete room.items[it.id];
    broadcast(room, { t: 'stash', cartId: cart.id, total, count: inCart.length, names, removed: inCart.map((it) => it.id), scores: scores(room) });
  },
};

export function onMessage(room, p, m) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t !== 'join' && !p.joined) return;
  const h = handlers[m.t];
  if (h) h(room, p, m);
}

export function step(room, dt) {
  if (!room.players.size) return;
  broadcast(room, {
    t: 'snap',
    p: [...room.players.values()].filter((q) => q.joined).map((q) => [q.id, +q.x.toFixed(2), +q.z.toFixed(2), +q.rot.toFixed(3), q.anim]),
    c: Object.values(room.carts).map((c) => [c.id, +c.x.toFixed(2), +c.z.toFixed(2), +c.rot.toFixed(3)]),
  });

  if (!room.roundOver) {
    room.roundRemaining = Math.max(0, room.roundRemaining - dt);
    if (room.roundRemaining > 0) return;
    room.roundOver = true;
    room.resetIn = RESET_DELAY_S;
    const board = [...room.players.values()].filter((q) => q.joined)
      .map((q) => ({ name: q.name, char: q.char, score: q.score }))
      .sort((a, b) => b.score - a.score);
    broadcast(room, { t: 'roundOver', board, resetIn: RESET_DELAY_S });
    return;
  }
  room.resetIn -= dt;
  if (room.resetIn > 0) return;
  room.items = {};
  room.carts = makeCarts();
  for (const q of room.players.values()) { q.score = 0; q.cartId = null; q.holding = null; }
  room.roundRemaining = ROUND_SECONDS;
  room.roundOver = false;
  broadcast(room, { t: 'reset', carts: Object.values(room.carts).map(cartPublic), roundRemaining: ROUND_SECONDS });
}
