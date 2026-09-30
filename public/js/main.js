// Electro Mart Heist — client entry point.
import * as THREE from 'three';
import { makeRenderer, fitRenderer } from './n64.js';
import { CHARACTERS, buildCharacter, animateCharacter } from './characters.js';
import { buildStore } from './store.js';
import { ITEM_TYPES, MAX_PUSHERS } from './itemdata.js';
import { buildItemMesh } from './items.js';
import { CART_RADIUS, HANDLE_DIST, buildCartMesh, CartBody } from './cart.js';
import { makeWorld, makeItemBody } from './physics.js';
import { Net, makeCode } from './net.js';

const $ = (s) => document.querySelector(s);
const PLAYER_RADIUS = 0.38;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, k) => a + wrap(b - a) * k;

// ------------------------------------------------------------------ renderer / scenes
const canvas = $('#game');
const renderer = makeRenderer(canvas);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 80);
const previewCam = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
fitRenderer(renderer, camera, previewCam);
window.addEventListener('resize', () => fitRenderer(renderer, camera, previewCam));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d1a); // night sky
scene.fog = new THREE.Fog(0x0b0d1a, 16, 48);
scene.add(new THREE.HemisphereLight(0xfff6e0, 0x50486a, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.95); sun.position.set(6, 10, 4); scene.add(sun);
const fill = new THREE.DirectionalLight(0xc0c8ff, 0.4); fill.position.set(-6, 8, -6); scene.add(fill);

const preview = new THREE.Scene();
preview.background = new THREE.Color(0x14121c);
preview.fog = new THREE.Fog(0x14121c, 9, 22);
preview.add(new THREE.HemisphereLight(0xfff6e0, 0x40385a, 1.0));
const pSun = new THREE.DirectionalLight(0xffffff, 1.1); pSun.position.set(3, 8, 6); preview.add(pSun);
const pFloor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x2a3fa0 }));
pFloor.rotation.x = -Math.PI / 2; preview.add(pFloor);
const previewChars = {};
Object.keys(CHARACTERS).forEach((k, i) => {
  const m = buildCharacter(k); m.position.set((i - 1.5) * 1.9, 0, 0); preview.add(m); previewChars[k] = m;
});
previewCam.position.set(0, 2.4, 8.5); previewCam.lookAt(0, 1.3, 0);

// ------------------------------------------------------------------ select screen
let phase = 'select';
let selectedChar = 'spike';
const cardsEl = $('#cards');
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
for (const [key, c] of Object.entries(CHARACTERS)) {
  const b = document.createElement('button');
  b.className = 'card' + (key === selectedChar ? ' on' : '');
  b.innerHTML = `<h2>${c.name}</h2><p>${c.desc}</p><div class="stats">SPEED <b>${stars(Math.round(c.speed / 1.5))}</b><br>POWER <b>${stars(Math.round(c.strength * 2.2))}</b></div>`;
  b.onclick = () => { selectedChar = key; [...cardsEl.children].forEach((x) => x.classList.toggle('on', x === b)); };
  cardsEl.appendChild(b);
}
const nameEl = $('#name');
let savedName = null; try { savedName = localStorage.getItem('em_name'); } catch {}
nameEl.value = savedName || ('Shopper' + Math.floor(Math.random() * 90 + 10));

const codeEl = $('#code');
codeEl.value = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 5);
const net = new Net();
const lobbyBtns = ['#soloBtn', '#hostBtn', '#joinBtn'].map((q) => $(q));
async function enter(mode) {
  const code = mode === 'host' ? makeCode() : codeEl.value.trim().toUpperCase();
  if (mode === 'join' && !code) { $('#selErr').textContent = 'Type the room code your friend gave you.'; return; }
  lobbyBtns.forEach((b) => (b.disabled = true));
  $('#selErr').textContent = mode === 'solo' ? '' : 'Connecting…';
  try {
    if (mode === 'solo') await net.solo(); else if (mode === 'host') await net.host(code); else await net.join(code);
    try { localStorage.setItem('em_name', nameEl.value); } catch {}
    if (net.code) history.replaceState(null, '', '?room=' + net.code);
    $('#selErr').textContent = '';
    net.send({ t: 'join', name: nameEl.value, char: selectedChar });
  } catch (e) {
    $('#selErr').textContent = e.message || 'Could not connect.';
    lobbyBtns.forEach((b) => (b.disabled = false));
  }
}
$('#soloBtn').onclick = () => enter('solo');
$('#hostBtn').onclick = () => enter('host');
$('#joinBtn').onclick = () => enter('join');
codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter('join'); });
net.onClose = () => { if (phase === 'game') { feed('The host closed the heist — reload to rejoin'); phase = 'dead'; } };

// ------------------------------------------------------------------ game state
const store = buildStore(scene);
const world = makeWorld(store.colliders);
let myId = null, me = null;
const players = new Map(); // id -> player record (includes me)
const carts = new Map();   // id -> cart record
const items = new Map();   // id -> item record
let roundRemaining = 240, roundOver = false, overCountdown = 0;
let t = 0;

function addPlayer(d) {
  if (players.has(d.id)) return players.get(d.id);
  const mesh = buildCharacter(d.char, d.name);
  mesh.position.set(d.x, 0, d.z);
  scene.add(mesh);
  const p = { ...d, mesh, tx: d.x, tz: d.z, trot: d.rot, px: d.x, pz: d.z, speedEst: 0 };
  players.set(d.id, p);
  return p;
}
function removePlayer(id) {
  const p = players.get(id); if (!p) return;
  scene.remove(p.mesh); players.delete(id);
  feed(`${p.name} left the store`, 'info');
}
function addCart(d) {
  const mesh = buildCartMesh();
  scene.add(mesh);
  const c = { ...d, mesh, tx: d.x, tz: d.z, trot: d.rot, px: d.x, pz: d.z, body: null, speedEst: 0, stats: null };
  carts.set(d.id, c);
  return c;
}
function removeBody(it) { if (it.body) { world.removeBody(it.body); it.body = null; } }
function applyCartUpdate(d) {
  const cart = carts.get(d.id) || addCart(d);
  const wasAuth = cart.authority === myId;
  cart.pushers = d.pushers; cart.authority = d.authority;
  if (!wasAuth && cart.authority === myId) {
    cart.tx = cart.x; cart.tz = cart.z; cart.trot = cart.rot;
    cart.body = new CartBody(world, cart);
    for (const it of items.values()) if (it.simCart === cart.id && it.state !== 'held' && !it.body) it.body = makeItemBody(world, it.def, it.p, it.q);
  } else if (wasAuth && cart.authority !== myId) {
    cart.body.destroy(); cart.body = null;
    for (const it of items.values()) if (it.simCart === cart.id) removeBody(it);
  }
  for (const p of players.values()) {
    if (cart.pushers.includes(p.id)) p.cartId = cart.id;
    else if (p.cartId === cart.id) p.cartId = null;
  }
}
function ensureItem(d) {
  let it = items.get(d.id);
  if (!it) {
    it = { id: d.id, type: d.type, def: ITEM_TYPES[d.type], mesh: buildItemMesh(d.type), body: null, state: null, holder: null, simCart: null, p: d.p.slice(), q: d.q.slice() };
    scene.add(it.mesh); items.set(d.id, it);
  }
  if (it.holder && it.holder !== d.holder) { const h = players.get(it.holder); if (h && h.holding === it.id) h.holding = null; }
  it.state = d.state; it.holder = d.holder; it.simCart = d.simCart; it.p = d.p.slice(); it.q = d.q.slice();
  if (it.state === 'held') {
    const h = players.get(it.holder); if (h) h.holding = it.id;
    removeBody(it); it.mesh.quaternion.identity();
  } else {
    const cart = carts.get(it.simCart);
    if (cart && cart.authority === myId) {
      if (!it.body) it.body = makeItemBody(world, it.def, it.p, it.q);
    } else removeBody(it);
    it.mesh.position.set(it.p[0], it.p[1], it.p[2]);
    it.mesh.quaternion.set(it.q[0], it.q[1], it.q[2], it.q[3]);
  }
}
function removeItem(id) {
  const it = items.get(id); if (!it) return;
  removeBody(it); scene.remove(it.mesh); items.delete(id);
  if (it.holder) { const h = players.get(it.holder); if (h && h.holding === id) h.holding = null; }
}
function resetRound(d) {
  for (const id of [...items.keys()]) removeItem(id);
  for (const c of d.carts) {
    const cart = carts.get(c.id);
    if (cart.body) { cart.body.destroy(); cart.body = null; }
    Object.assign(cart, { x: c.x, z: c.z, rot: c.rot, tx: c.x, tz: c.z, trot: c.rot, pushers: [], authority: null, stats: null });
  }
  for (const p of players.values()) { p.cartId = null; p.holding = null; p.score = 0; }
  roundRemaining = d.roundRemaining; roundOver = false;
  $('#over').style.display = 'none';
  feed('The cops left. NEW HEIST — grab a cart and go!', 'info');
}

// ------------------------------------------------------------------ networking
net.onMessage = (m) => {
  switch (m.t) {
    case 'welcome':
      myId = m.id;
      for (const p of m.players) addPlayer(p);
      me = players.get(myId);
      for (const c of m.carts) addCart(c);
      for (const c of m.carts) applyCartUpdate(c);
      for (const it of m.items) ensureItem(it);
      roundRemaining = m.roundRemaining; roundOver = m.roundOver;
      startGame();
      break;
    case 'pjoin': addPlayer(m.player); feed(`${m.player.name} entered the store`, 'info'); break;
    case 'pleave': removePlayer(m.id); break;
    case 'snap':
      for (const [id, x, z, rot, anim] of m.p) {
        const p = players.get(id); if (!p || p === me) continue;
        p.tx = x; p.tz = z; p.trot = rot; p.anim = anim;
      }
      for (const [id, x, z, rot] of m.c) {
        const c = carts.get(id); if (!c || c.authority === myId) continue;
        c.tx = x; c.tz = z; c.trot = rot;
      }
      break;
    case 'cartUpdate': applyCartUpdate(m.cart); break;
    case 'itemUpdate': ensureItem(m.item); break;
    case 'itemRemove': removeItem(m.id); break;
    case 'isync': {
      const cart = carts.get(m.cartId);
      if (cart && cart.authority === myId) break;
      for (const e of m.items) {
        const it = items.get(e[0]); if (!it || it.state === 'held') continue;
        it.p = [e[1], e[2], e[3]]; it.q = [e[4], e[5], e[6], e[7]]; it.state = e[8];
      }
      break;
    }
    case 'stash':
      for (const id of m.removed) removeItem(id);
      for (const [id, s] of m.scores) { const p = players.get(id); if (p) p.score = s; }
      feed(`${m.names.join(' & ')} stashed ${m.count} item${m.count > 1 ? 's' : ''} worth $${m.total.toLocaleString()} in the truck!`);
      break;
    case 'toast': feed(m.text); break;
    case 'roundOver': {
      roundOver = true; overCountdown = m.resetIn;
      $('#overRows').innerHTML = m.board.map((r, i) => `<div class="row"><span>${i + 1}. ${r.name} (${CHARACTERS[r.char].name})</span><b>$${r.score.toLocaleString()}</b></div>`).join('') || '<div>Nobody stole anything!</div>';
      $('#over').style.display = 'flex';
      break;
    }
    case 'reset': resetRound(m); break;
  }
};

// ------------------------------------------------------------------ input
const keys = new Set();
let yaw = Math.PI, pitch = 0.42;
window.addEventListener('keydown', (e) => {
  if (phase !== 'game') return;
  keys.add(e.code);
  if (e.code === 'KeyE' && acts.e) acts.e.run();
  if (e.code === 'KeyF' && acts.f) acts.f.run();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('click', () => { if (phase === 'game') canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { $('#hint').style.display = document.pointerLockElement === canvas ? 'none' : ''; });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0028;
  pitch = clamp(pitch + e.movementY * 0.0028, 0.05, 1.1);
});
function inputDir() {
  const iy = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const ix = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const v = new THREE.Vector2(Math.sin(yaw) * iy - Math.cos(yaw) * ix, Math.cos(yaw) * iy + Math.sin(yaw) * ix);
  return v.lengthSq() > 0 ? v.normalize() : v;
}

// ------------------------------------------------------------------ collision helpers
function collideCircle(o, r, isPlayer) {
  for (const c of store.colliders) {
    const nx = clamp(o.x, c.minX, c.maxX), nz = clamp(o.z, c.minZ, c.maxZ);
    let dx = o.x - nx, dz = o.z - nz;
    let d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-4) { // centre is inside the box: push out along the nearest face
      const pen = [o.x - c.minX, c.maxX - o.x, o.z - c.minZ, c.maxZ - o.z];
      const i = pen.indexOf(Math.min(...pen));
      if (i === 0) o.x = c.minX - r; else if (i === 1) o.x = c.maxX + r; else if (i === 2) o.z = c.minZ - r; else o.z = c.maxZ + r;
      continue;
    }
    o.x = nx + (dx / d) * r; o.z = nz + (dz / d) * r;
  }
  const b = store.bounds;
  o.x = clamp(o.x, b.minX + r, b.maxX - r); o.z = clamp(o.z, b.minZ + r, b.maxZ - r);
  if (isPlayer) {
    for (const cart of carts.values()) {
      if (cart.id === me.cartId) continue;
      const dx = o.x - cart.x, dz = o.z - cart.z, d = Math.hypot(dx, dz), min = r + CART_RADIUS * 0.8;
      if (d < min && d > 1e-4) { o.x = cart.x + (dx / d) * min; o.z = cart.z + (dz / d) * min; }
    }
  }
}

// ------------------------------------------------------------------ carts
function cartStats(cart) {
  let weight = 0, value = 0, count = 0;
  for (const it of items.values()) if (it.simCart === cart.id && it.state === 'cart') { weight += it.def.weight; value += it.def.price; count++; }
  let strength = 0, speedSum = 0, n = 0;
  for (const id of cart.pushers) { const p = players.get(id); if (!p) continue; const c = CHARACTERS[p.char]; strength += c.strength; speedSum += c.speed; n++; }
  n = Math.max(1, n);
  const base = (n ? speedSum / n : 5.5) * 0.85;
  const boost = 1 + 0.4 * (n - 1);
  const drag = 1 + weight / (14 * Math.max(0.5, strength));
  const speed = base * boost / drag;
  const turn = (2.6 + 0.4 * (n - 1)) / (1 + weight / 40);
  return { weight, value, count, n, speed, turn, pct: Math.min(1, speed / 6.5) };
}
function pusherSlot(cart, idx) {
  const s = Math.sin(cart.rot), c = Math.cos(cart.rot);
  if (idx <= 0) return { x: cart.x - s * HANDLE_DIST, z: cart.z - c * HANDLE_DIST };
  const side = idx === 1 ? 1 : -1;
  return { x: cart.x + c * side * 0.95 - s * 0.25, z: cart.z - s * side * 0.95 - c * 0.25 };
}
function steerCart(cart, inp, dt) {
  const st = cartStats(cart); cart.stats = st;
  let want = 0;
  if (inp.lengthSq() > 0) {
    const target = Math.atan2(inp.x, inp.y);
    const da = wrap(target - cart.rot);
    const maxTurn = st.turn * dt;
    cart.rot = wrap(cart.rot + clamp(da, -maxTurn, maxTurn));
    const dot = Math.cos(wrap(target - cart.rot));
    want = st.speed * (dot > 0 ? dot : dot * 0.25);
  }
  // momentum: a loaded cart takes longer to get going and to stop
  const inertia = 1 + st.weight / 30;
  const accel = (want > (cart.vel || 0) ? 9 : 12) / inertia;
  cart.vel = (cart.vel || 0) + clamp(want - (cart.vel || 0), -accel * dt, accel * dt);
  cart.x += Math.sin(cart.rot) * cart.vel * dt; cart.z += Math.cos(cart.rot) * cart.vel * dt;
  collideCircle(cart, CART_RADIUS, false);
  for (const other of carts.values()) {
    if (other === cart) continue;
    const dx = cart.x - other.x, dz = cart.z - other.z, d = Math.hypot(dx, dz), min = CART_RADIUS * 1.7;
    if (d < min && d > 1e-4) { cart.x = other.x + (dx / d) * min; cart.z = other.z + (dz / d) * min; }
  }
}
function nearestCart(x, z, maxD, filter) {
  let best = null, bd = maxD;
  for (const c of carts.values()) { if (filter && !filter(c)) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function nearestSlot(maxD) {
  let best = null, bd = maxD;
  for (const s of store.slots) { const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function nearestLoose(maxD) {
  let best = null, bd = maxD;
  for (const it of items.values()) { if (it.state !== 'loose') continue; const d = Math.hypot(it.p[0] - me.x, it.p[2] - me.z); if (d < bd) { bd = d; best = it; } }
  return best;
}

// ------------------------------------------------------------------ interactions & HUD
let acts = { e: null, f: null };
function computeInteractions() {
  const a = { e: null, f: null };
  if (roundOver || phase !== 'game') return a;
  const held = me.holding ? items.get(me.holding) : null;
  if (me.cartId) {
    const cart = carts.get(me.cartId);
    const tz = store.truckZone;
    if (Math.hypot(cart.x - tz.x, cart.z - tz.z) < tz.r) {
      const st = cartStats(cart);
      a.e = { label: st.count ? `STASH LOOT IN TRUCK ($${st.value.toLocaleString()})` : 'STASH LOOT (CART IS EMPTY)', run: () => net.send({ t: 'stash', cartId: cart.id }) };
    } else a.e = { label: 'LET GO OF CART', run: () => net.send({ t: 'release' }) };
  } else {
    const cart = nearestCart(me.x, me.z, 2.6, (c) => c.pushers.length < MAX_PUSHERS);
    if (cart) a.e = { label: cart.pushers.length ? `HELP PUSH CART (${cart.pushers.length}/${MAX_PUSHERS})` : 'GRAB CART', run: () => net.send({ t: 'grab', cartId: cart.id }) };
  }
  if (held) {
    const cart = me.cartId ? carts.get(me.cartId) : nearestCart(me.x, me.z, 2.6);
    if (cart) a.f = { label: `PUT ${held.def.name.toUpperCase()} IN CART`, run: () => net.send({ t: 'place', cartId: cart.id }) };
    else if (nearestSlot(2.2)) a.f = { label: 'PUT BACK ON SHELF', run: () => net.send({ t: 'returnItem' }) };
  } else {
    const loose = nearestLoose(2.2);
    if (loose) a.f = { label: `PICK UP ${loose.def.name.toUpperCase()}`, run: () => net.send({ t: 'pickLoose', itemId: loose.id }) };
    else {
      const slot = nearestSlot(2.2);
      if (slot) { const def = ITEM_TYPES[slot.type]; a.f = { label: `SWIPE ${def.name.toUpperCase()} ($${def.price})`, run: () => net.send({ t: 'pick', type: slot.type }) }; }
    }
  }
  return a;
}
function feed(text, cls = '') {
  const d = document.createElement('div'); d.textContent = text; d.className = cls;
  const f = $('#feed'); f.appendChild(d);
  while (f.children.length > 4) f.removeChild(f.firstChild);
  setTimeout(() => d.remove(), 4500);
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateHUD() {
  $('#me .n').textContent = `${me.name} · ${CHARACTERS[me.char].name}`;
  $('#score').textContent = '$' + me.score.toLocaleString();
  $('#timer').textContent = 'COPS IN ' + fmtTime(roundRemaining);
  const sorted = [...players.values()].sort((a, b) => b.score - a.score);
  $('#rows').innerHTML = sorted.map((p) => `<div class="row${p === me ? ' me' : ''}"><span>${p.name}</span><span>$${p.score.toLocaleString()}</span></div>`).join('');
  const cartEl = $('#cart');
  if (me.cartId) {
    const cart = carts.get(me.cartId); const st = cartStats(cart);
    const names = cart.pushers.map((id) => players.get(id)?.name || '?').join(', ');
    cartEl.style.display = '';
    cartEl.innerHTML = `<b>${cart.id.toUpperCase()}</b> · ${st.count} items · ${st.weight} lb · $${st.value.toLocaleString()}<br>Pushers (${st.n}/${MAX_PUSHERS}): ${names}<br>Speed ${Math.round(st.pct * 100)}%<div class="bar"><i style="width:${Math.round(st.pct * 100)}%"></i></div>`;
  } else cartEl.style.display = 'none';
  const holdEl = $('#hold');
  const held = me.holding ? items.get(me.holding) : null;
  if (held) { holdEl.style.display = ''; holdEl.innerHTML = `Carrying: <b>${held.def.name}</b> · $${held.def.price} · ${held.def.weight} lb`; }
  else holdEl.style.display = 'none';
  $('#prompt').innerHTML = [acts.e && `<span><b>E</b>${acts.e.label}</span>`, acts.f && `<span><b>F</b>${acts.f.label}</span>`].filter(Boolean).join('');
  if (roundOver) $('#overNext').textContent = `Next heist in ${Math.ceil(overCountdown)}s`;
}

// ------------------------------------------------------------------ game loop
function startGame() {
  phase = 'game';
  $('#select').style.display = 'none';
  $('#hud').style.display = 'block';
  if (net.code) {
    const link = location.origin + location.pathname + '?room=' + net.code;
    $('#room').style.display = '';
    $('#room').innerHTML = `ROOM <b>${net.code}</b> <button id="copyLink">COPY INVITE</button>`;
    $('#copyLink').onclick = () => { navigator.clipboard?.writeText(link).then(() => feed('Invite link copied!', 'info'), () => {}); };
  }
  yaw = me.rot; // look the way we spawn facing
  camera.position.set(me.x, 3, me.z + 5);
  feed('The store is closed and the alarm is off. Grab a cart (E), swipe loot (F), bring it back to the truck!', 'info');
}

const camTarget = new THREE.Vector3(), camDesired = new THREE.Vector3();
function updateCamera(dt) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), dist = 5.6;
  // over-the-shoulder offset while pushing so the cart isn't hidden behind the shopper
  const side = me.cartId ? 1.1 : 0;
  const tx = me.x - Math.cos(yaw) * side, tz = me.z + Math.sin(yaw) * side;
  camTarget.set(tx, 1.4, tz);
  camDesired.set(tx - fx * dist * Math.cos(pitch), 1.4 + dist * Math.sin(pitch), tz - fz * dist * Math.cos(pitch));
  const b = store.bounds;
  camDesired.x = clamp(camDesired.x, b.minX + 0.4, b.maxX - 0.4);
  camDesired.z = clamp(camDesired.z, b.minZ + 0.4, b.maxZ - 0.4);
  camDesired.y = clamp(camDesired.y, 0.7, 4.7);
  // pull the camera in if it would sit inside a wall, the truck, a car...
  for (let d = dist; d > 1.2 && cameraBlocked(camDesired); d -= 0.4) {
    camDesired.set(tx - fx * d * Math.cos(pitch), 1.4 + d * Math.sin(pitch), tz - fz * d * Math.cos(pitch));
  }
  camera.position.lerp(camDesired, 1 - Math.exp(-16 * dt));
  camera.lookAt(camTarget);
}

function cameraBlocked(p) {
  for (const c of store.colliders) {
    if (p.y > (c.h ?? 2.3) + 0.2) continue;
    if (p.x > c.minX - 0.3 && p.x < c.maxX + 0.3 && p.z > c.minZ - 0.3 && p.z < c.maxZ + 0.3) return true;
  }
  return false;
}

let sendAcc = 0, syncAcc = 0, hudAcc = 0;
function updateGame(dt) {
  roundRemaining = Math.max(0, roundRemaining - dt);
  if (roundOver) overCountdown = Math.max(0, overCountdown - dt);
  const inp = roundOver ? new THREE.Vector2() : inputDir();
  const cs = CHARACTERS[me.char];
  let moving = false, spd = 0;

  // --- local player
  if (me.cartId) {
    const cart = carts.get(me.cartId);
    if (cart.authority === myId) steerCart(cart, inp, dt);
    const slot = pusherSlot(cart, cart.pushers.indexOf(myId));
    me.x = slot.x; me.z = slot.z; me.rot = cart.rot;
    spd = cart.speedEst; moving = spd > 0.4;
    me.anim = moving ? 'push' : 'pushidle';
  } else {
    const held = me.holding ? items.get(me.holding) : null;
    let speed = cs.speed;
    if (held) speed /= 1 + held.def.weight / (16 * cs.strength);
    if (inp.lengthSq() > 0) {
      me.x += inp.x * speed * dt; me.z += inp.y * speed * dt;
      me.rot = Math.atan2(inp.x, inp.y);
      moving = true; spd = speed;
    }
    collideCircle(me, PLAYER_RADIUS, true);
    me.anim = held ? (moving ? 'carrywalk' : 'carry') : (moving ? 'walk' : 'idle');
  }
  me.mesh.position.set(me.x, 0, me.z); me.mesh.rotation.y = me.rot;
  animateCharacter(me.mesh, me.anim, t, spd);

  // --- remote players (interpolate towards last snapshot)
  const k = 1 - Math.exp(-14 * dt);
  for (const p of players.values()) {
    if (p === me) continue;
    p.x += (p.tx - p.x) * k; p.z += (p.tz - p.z) * k; p.rot = lerpAngle(p.rot, p.trot, k);
    p.speedEst = p.speedEst * 0.8 + (Math.hypot(p.x - p.px, p.z - p.pz) / Math.max(dt, 1e-3)) * 0.2;
    p.px = p.x; p.pz = p.z;
    p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.rot;
    animateCharacter(p.mesh, p.anim, t, p.speedEst);
  }

  // --- carts
  let simulating = false;
  for (const cart of carts.values()) {
    if (cart.authority !== myId) { cart.x += (cart.tx - cart.x) * k; cart.z += (cart.tz - cart.z) * k; cart.rot = lerpAngle(cart.rot, cart.trot, k); }
    cart.speedEst = cart.speedEst * 0.7 + (Math.hypot(cart.x - cart.px, cart.z - cart.pz) / Math.max(dt, 1e-3)) * 0.3;
    cart.px = cart.x; cart.pz = cart.z;
    cart.mesh.position.set(cart.x, 0, cart.z); cart.mesh.rotation.y = cart.rot;
    // wobble the basket a little when heavy and moving — pure cosmetics
    const w = cart.stats ? cart.stats.weight : 0;
    cart.mesh.rotation.z = Math.sin(t * 9) * 0.006 * Math.min(1, cart.speedEst) * (1 + w / 20);
    if (cart.body) { cart.body.set(cart, dt); simulating = true; }
  }

  // --- physics (only for carts we are the authority of)
  // single variable-size step so the kinematic baskets land exactly on this frame's transform
  if (simulating) world.step(Math.max(dt, 1 / 240));
  for (const it of items.values()) {
    if (it.state === 'held') {
      const h = players.get(it.holder);
      if (h) { it.mesh.position.set(h.x, 2.45 + Math.sin(t * 3) * 0.05, h.z); it.mesh.rotation.set(0, t * 1.2, 0); }
      continue;
    }
    if (it.body) {
      const b = it.body;
      if (b.position.y < -1) { b.position.y = 0.6; b.velocity.set(0, 0, 0); }
      it.mesh.position.copy(b.position); it.mesh.quaternion.copy(b.quaternion);
      it.p = [b.position.x, b.position.y, b.position.z]; it.q = [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w];
      if (it.state === 'cart') {
        const cart = carts.get(it.simCart);
        if (cart && cart.body && !cart.body.contains(cart, b.position.x, b.position.y, b.position.z)) it.state = 'loose';
      }
    } else {
      it.mesh.position.lerp(new THREE.Vector3(it.p[0], it.p[1], it.p[2]), k);
      it.mesh.quaternion.slerp(new THREE.Quaternion(it.q[0], it.q[1], it.q[2], it.q[3]), k);
    }
  }

  // --- network sends
  sendAcc += dt;
  if (sendAcc >= 1 / 20) {
    sendAcc = 0;
    net.send({ t: 'move', x: +me.x.toFixed(2), z: +me.z.toFixed(2), rot: +me.rot.toFixed(3), anim: me.anim });
    for (const cart of carts.values()) if (cart.authority === myId) net.send({ t: 'cartMove', cartId: cart.id, x: +cart.x.toFixed(2), z: +cart.z.toFixed(2), rot: +cart.rot.toFixed(3) });
  }
  syncAcc += dt;
  if (syncAcc >= 1 / 15) {
    syncAcc = 0;
    for (const cart of carts.values()) {
      if (cart.authority !== myId) continue;
      const list = [];
      for (const it of items.values()) if (it.simCart === cart.id && it.state !== 'held') list.push([it.id, +it.p[0].toFixed(3), +it.p[1].toFixed(3), +it.p[2].toFixed(3), +it.q[0].toFixed(3), +it.q[1].toFixed(3), +it.q[2].toFixed(3), +it.q[3].toFixed(3), it.state]);
      if (list.length) net.send({ t: 'isync', cartId: cart.id, items: list });
    }
  }

  updateCamera(dt);
  acts = computeInteractions();
  hudAcc += dt;
  if (hudAcc > 0.1) { hudAcc = 0; updateHUD(); }
}

function updatePreview(dt) {
  for (const [key, m] of Object.entries(previewChars)) {
    const on = key === selectedChar;
    animateCharacter(m, on ? 'walk' : 'idle', t, 4);
    m.rotation.y = on ? Math.sin(t * 1.5) * 0.35 : 0;
    m.position.y = on ? Math.abs(Math.sin(t * 5)) * 0.12 : 0;
  }
  previewCam.position.x = Math.sin(t * 0.3) * 0.6;
  previewCam.lookAt(0, 1.3, 0);
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  if (phase === 'game') { updateGame(dt); renderer.render(scene, camera); }
  else if (phase === 'dead') renderer.render(scene, camera);
  else { updatePreview(dt); renderer.render(preview, previewCam); }
}
requestAnimationFrame(loop);

// Debug handle (handy in the devtools console): window.__em.me, .players, .carts, .items
window.__em = { players, carts, items, get me() { return me; } };
