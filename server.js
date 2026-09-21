// Electro Mart Heist — multiplayer relay server.
// Players are client-authoritative for their own movement. Each cart has one "authority"
// (its first pusher) that simulates the cart + the physics of the items inside it and
// streams transforms to everyone else. The server owns item lifecycle, scoring and rounds.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { ITEM_TYPES, TRUCK_ZONE, CART_SPAWNS, MAX_PUSHERS, PLAYER_SPAWN } from './public/js/itemdata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const ROUND_SECONDS = 240;
const RESET_DELAY_MS = 10000;
const SNAP_HZ = 20;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(PUBLIC, url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server });

// ---------------------------------------------------------------- state
let nextId = 1;
const players = new Map();   // id -> player
const sockets = new Map();   // id -> ws
const carts = {};            // id -> cart
let items = {};              // id -> item
let roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
let roundOver = false;

function makeCarts() {
  CART_SPAWNS.forEach(([x, z, rot], i) => {
    carts['cart' + (i + 1)] = { id: 'cart' + (i + 1), x, z, rot, pushers: [], authority: null };
  });
}
makeCarts();

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
function broadcast(msg, exceptId = null) {
  const s = JSON.stringify(msg);
  for (const [id, ws] of sockets) if (id !== exceptId && ws.readyState === 1) ws.send(s);
}
const cartPublic = (c) => ({ id: c.id, x: c.x, z: c.z, rot: c.rot, pushers: c.pushers, authority: c.authority });
const playerPublic = (p) => ({ id: p.id, name: p.name, char: p.char, x: p.x, z: p.z, rot: p.rot, anim: p.anim, holding: p.holding, cartId: p.cartId, score: p.score });
const scores = () => [...players.values()].map((p) => [p.id, p.score]);

function removePusher(p) {
  const cart = carts[p.cartId];
  p.cartId = null;
  if (!cart) return;
  cart.pushers = cart.pushers.filter((id) => id !== p.id);
  if (cart.authority === p.id) cart.authority = cart.pushers[0] || null;
  broadcast({ t: 'cartUpdate', cart: cartPublic(cart) });
}

function dropHeld(p) {
  if (!p.holding) return;
  const id = p.holding;
  p.holding = null;
  delete items[id];
  broadcast({ t: 'itemRemove', id });
}

// ---------------------------------------------------------------- messages
const handlers = {
  join(p, m) {
    p.name = String(m.name || 'Shopper').slice(0, 14) || 'Shopper';
    p.char = ['spike', 'lizzie', 'bean', 'chunk'].includes(m.char) ? m.char : 'spike';
    p.joined = true;
    send(sockets.get(p.id), {
      t: 'welcome', id: p.id,
      players: [...players.values()].filter((q) => q.joined).map(playerPublic),
      carts: Object.values(carts).map(cartPublic),
      items: Object.values(items),
      roundRemaining: Math.max(0, (roundEndsAt - Date.now()) / 1000),
      roundOver,
    });
    broadcast({ t: 'pjoin', player: playerPublic(p) }, p.id);
  },
  move(p, m) {
    p.x = +m.x || 0; p.z = +m.z || 0; p.rot = +m.rot || 0; p.anim = String(m.anim || 'idle');
  },
  grab(p, m) {
    const cart = carts[m.cartId];
    if (!cart || p.cartId || roundOver) return;
    if (cart.pushers.length >= MAX_PUSHERS) return;
    if (dist(p.x, p.z, cart.x, cart.z) > 3.2) return;
    cart.pushers.push(p.id);
    if (!cart.authority) cart.authority = p.id;
    p.cartId = cart.id;
    broadcast({ t: 'cartUpdate', cart: cartPublic(cart) });
  },
  release(p) { if (p.cartId) removePusher(p); },
  cartMove(p, m) {
    const cart = carts[m.cartId];
    if (!cart || cart.authority !== p.id) return;
    cart.x = +m.x || 0; cart.z = +m.z || 0; cart.rot = +m.rot || 0;
  },
  pick(p, m) {
    if (p.holding || roundOver || !ITEM_TYPES[m.type]) return;
    const id = 'i' + nextId++;
    items[id] = { id, type: m.type, state: 'held', holder: p.id, simCart: null, p: [p.x, 2.3, p.z], q: [0, 0, 0, 1] };
    p.holding = id;
    broadcast({ t: 'itemUpdate', item: items[id] });
  },
  pickLoose(p, m) {
    const it = items[m.itemId];
    if (!it || it.state !== 'loose' || p.holding || roundOver) return;
    if (dist(p.x, p.z, it.p[0], it.p[2]) > 2.6) return;
    it.state = 'held'; it.holder = p.id; it.simCart = null;
    p.holding = it.id;
    broadcast({ t: 'itemUpdate', item: it });
  },
  place(p, m) {
    const it = items[p.holding];
    const cart = carts[m.cartId];
    if (!it || !cart || roundOver) return;
    if (dist(p.x, p.z, cart.x, cart.z) > 3.0) return;
    it.state = 'cart'; it.holder = null; it.simCart = cart.id;
    // Drop point: above the basket centre with a little jitter so stacks aren't perfect.
    it.p = [cart.x + (Math.random() - 0.5) * 0.15, 1.45, cart.z + (Math.random() - 0.5) * 0.15];
    const a = Math.random() * Math.PI;
    it.q = [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
    p.holding = null;
    broadcast({ t: 'itemUpdate', item: it });
  },
  returnItem(p) { dropHeld(p); },
  isync(p, m) {
    const cart = carts[m.cartId];
    if (!cart || cart.authority !== p.id || !Array.isArray(m.items)) return;
    for (const e of m.items) {
      const it = items[e[0]];
      if (!it || it.simCart !== cart.id || it.state === 'held') continue;
      it.p = [e[1], e[2], e[3]]; it.q = [e[4], e[5], e[6], e[7]];
      it.state = e[8] === 'loose' ? 'loose' : 'cart';
    }
    broadcast({ t: 'isync', cartId: cart.id, items: m.items }, p.id);
  },
  stash(p, m) {
    const cart = carts[m.cartId];
    if (!cart || !cart.pushers.includes(p.id) || roundOver) return;
    if (dist(cart.x, cart.z, TRUCK_ZONE.x, TRUCK_ZONE.z) > TRUCK_ZONE.r + 0.3) return;
    const inCart = Object.values(items).filter((it) => it.state === 'cart' && it.simCart === cart.id);
    if (!inCart.length) { send(sockets.get(p.id), { t: 'toast', text: 'Nothing in the cart to stash!' }); return; }
    const total = inCart.reduce((s, it) => s + ITEM_TYPES[it.type].price, 0);
    const names = [];
    for (const id of cart.pushers) { const q = players.get(id); if (q) { q.score += total; names.push(q.name); } }
    for (const it of inCart) delete items[it.id];
    broadcast({ t: 'stash', cartId: cart.id, total, count: inCart.length, names, removed: inCart.map((it) => it.id), scores: scores() });
  },
};

wss.on('connection', (ws) => {
  const id = 'p' + nextId++;
  const p = { id, name: 'Shopper', char: 'spike', x: PLAYER_SPAWN.x + (Math.random() - 0.5) * PLAYER_SPAWN.spread, z: PLAYER_SPAWN.z, rot: Math.PI, anim: 'idle', holding: null, cartId: null, score: 0, joined: false };
  players.set(id, p);
  sockets.set(id, ws);

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t !== 'join' && !p.joined) return;
    const h = handlers[m.t];
    if (h) h(p, m);
  });
  ws.on('close', () => {
    removePusher(p);
    dropHeld(p);
    players.delete(id);
    sockets.delete(id);
    if (p.joined) broadcast({ t: 'pleave', id });
  });
});

// ---------------------------------------------------------------- ticks
setInterval(() => {
  if (!players.size) return;
  broadcast({
    t: 'snap',
    p: [...players.values()].filter((q) => q.joined).map((q) => [q.id, +q.x.toFixed(2), +q.z.toFixed(2), +q.rot.toFixed(3), q.anim]),
    c: Object.values(carts).map((c) => [c.id, +c.x.toFixed(2), +c.z.toFixed(2), +c.rot.toFixed(3)]),
  });
}, 1000 / SNAP_HZ);

setInterval(() => {
  if (roundOver || Date.now() < roundEndsAt) return;
  roundOver = true;
  const board = [...players.values()].filter((q) => q.joined)
    .map((q) => ({ name: q.name, char: q.char, score: q.score }))
    .sort((a, b) => b.score - a.score);
  broadcast({ t: 'roundOver', board, resetIn: RESET_DELAY_MS / 1000 });
  setTimeout(() => {
    items = {};
    for (const k in carts) delete carts[k];
    makeCarts();
    for (const q of players.values()) { q.score = 0; q.cartId = null; q.holding = null; }
    roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
    roundOver = false;
    broadcast({ t: 'reset', carts: Object.values(carts).map(cartPublic), roundRemaining: ROUND_SECONDS });
  }, RESET_DELAY_MS);
}, 500);

server.listen(PORT, () => {
  console.log(`Electro Mart running at http://localhost:${PORT}`);
  console.log('Open it in several browser windows (or share your LAN IP) to play together.');
});
