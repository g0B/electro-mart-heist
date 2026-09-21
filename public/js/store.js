// Builds the Electro Mart interior (floor, walls, ceiling lights, 4 shelf aisles with item
// displays, a TV wall, registers, cart corral) plus the night-time parking lot outside the
// front doors with the getaway truck. Returns the static colliders and the shelf slots.
import * as THREE from 'three';
import { ITEM_TYPES, REGISTERS, TRUCK_ZONE, CART_SPAWNS } from './itemdata.js';
import { buildItemMesh } from './items.js';
import { canvasTexture, lambert, box, cylinder, textSprite } from './n64.js';

export const STORE = { minX: -22, maxX: 22, minZ: -16, maxZ: 16 }; // the building
export const BOUNDS = { minX: -22, maxX: 22, minZ: -16, maxZ: 32 }; // building + parking lot
const DOOR_HALF = 3.2; // entrance gap in the south wall
const AISLE_X = [-12, -4, 4, 12];
const AISLE_Z0 = -12, AISLE_LEN = 14, SLOTS = 8, SLOT_STEP = 1.75;

function floorTexture() {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#c9c4b4'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#b3ae9f'; ctx.fillRect(0, 0, 32, 32); ctx.fillRect(32, 32, 32, 32);
    ctx.fillStyle = '#9d9889';
    ctx.fillRect(0, 0, 64, 1); ctx.fillRect(0, 32, 64, 1); ctx.fillRect(0, 0, 1, 64); ctx.fillRect(32, 0, 1, 64);
  }, { repeat: [22, 16] });
}
function wallTexture() {
  return canvasTexture(32, 64, (ctx) => {
    ctx.fillStyle = '#d8d3c6'; ctx.fillRect(0, 0, 32, 64);
    ctx.fillStyle = '#2a3fa0'; ctx.fillRect(0, 44, 32, 8);
    ctx.fillStyle = '#f0c030'; ctx.fillRect(0, 52, 32, 3);
    ctx.fillStyle = '#8a857a'; ctx.fillRect(0, 60, 32, 4);
  }, { repeat: [8, 1] });
}
function asphaltTexture() {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#2b2b33'; ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 160; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#34343d' : '#24242b'; ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
  }, { repeat: [11, 4] });
}
function cardboardTexture() {
  return canvasTexture(32, 32, (ctx) => {
    ctx.fillStyle = '#b8894e'; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#a0763f'; ctx.fillRect(0, 15, 32, 2); ctx.fillRect(15, 0, 2, 32);
    ctx.fillStyle = '#7a5a30'; ctx.fillRect(6, 6, 8, 4);
  });
}

let rng = 1;
const rand = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };

export function buildStore(scene) {
  const colliders = [];
  const slots = [];

  // store floor / ceiling
  const SW = STORE.maxX - STORE.minX, SD = STORE.maxZ - STORE.minZ;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SW, SD), new THREE.MeshLambertMaterial({ map: floorTexture() }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(SW, SD), lambert(0x3a3a48));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 5; scene.add(ceil);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  for (let x = -18; x <= 18; x += 6) for (let z = -13; z <= 13; z += 6.5) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), lightMat);
    l.rotation.x = Math.PI / 2; l.position.set(x, 4.97, z); scene.add(l);
  }

  // walls (south wall has the entrance gap)
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTexture() });
  const wallOut = lambert(0x6a6478);
  const walls = [
    [0, STORE.minZ - 0.25, SW + 1, 0.5],
    [STORE.minX - 0.25, 0, 0.5, SD], [STORE.maxX + 0.25, 0, 0.5, SD],
    [(STORE.minX + -DOOR_HALF) / 2, STORE.maxZ + 0.25, -DOOR_HALF - STORE.minX, 0.5],
    [(STORE.maxX + DOOR_HALF) / 2, STORE.maxZ + 0.25, STORE.maxX - DOOR_HALF, 0.5],
  ];
  walls.forEach(([x, z, w, d], i) => {
    const m = box(w, 5, d, i >= 3 ? [wallOut, wallOut, wallOut, wallOut, wallOut, wallMat] : wallMat); m.position.set(x, 2.5, z); scene.add(m);
    if (i >= 3) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: 5 });
  });
  // door header + swung-open glass doors
  const header = box(DOOR_HALF * 2 + 0.6, 1.4, 0.6, lambert(0x2a3fa0)); header.position.set(0, 4.3, STORE.maxZ); scene.add(header);
  for (const sx of [-1, 1]) {
    const door = box(0.12, 3.4, 1.6, new THREE.MeshLambertMaterial({ color: 0x8fc8e8, transparent: true, opacity: 0.55 }));
    door.position.set(sx * (DOOR_HALF - 0.1), 1.7, STORE.maxZ + 0.9); scene.add(door);
    colliders.push({ minX: sx * (DOOR_HALF - 0.1) - 0.15, maxX: sx * (DOOR_HALF - 0.1) + 0.15, minZ: STORE.maxZ + 0.1, maxZ: STORE.maxZ + 1.7, h: 3.4 });
  }
  const closedSign = textSprite("SORRY, WE'RE CLOSED", { color: '#fff', bg: '#c0202a', scale: 2 });
  closedSign.position.set(0, 3.3, STORE.maxZ + 0.4); scene.add(closedSign);
  const mainSign = textSprite('ELECTRO MART', { color: '#ffe36a', bg: '#2a3fa0', scale: 7 });
  mainSign.position.set(0, 4.2, STORE.minZ + 0.8); scene.add(mainSign);
  const frontSign = textSprite("ELECTRO MART", { color: "#ffe36a", bg: "#2a3fa0", scale: 5 });
  frontSign.position.set(0, 6.2, STORE.maxZ + 0.6); scene.add(frontSign);

  // ---------------- parking lot
  const lotD = BOUNDS.maxZ - STORE.maxZ;
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(SW, lotD), new THREE.MeshLambertMaterial({ map: asphaltTexture() }));
  lot.rotation.x = -Math.PI / 2; lot.position.set(0, 0, STORE.maxZ + lotD / 2); scene.add(lot);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c0 });
  for (let x = -20; x <= 20; x += 4) {
    if (Math.abs(x) < 6) continue;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 5), lineMat);
    line.rotation.x = -Math.PI / 2; line.position.set(x, 0.01, BOUNDS.maxZ - 3); scene.add(line);
  }
  const curb = box(SW, 0.25, 0.6, lambert(0xa0a090)); curb.position.set(0, 0.12, BOUNDS.maxZ - 0.3); scene.add(curb);
  for (const sx of [-1, 1]) { // street lamps
    const pole = cylinder(0.08, 0.1, 6, 6, lambert(0x555560)); pole.position.set(sx * 12, 3, STORE.maxZ + 6); scene.add(pole);
    const head = box(0.9, 0.25, 0.5, lambert(0x333340)); head.position.set(sx * 12, 6.1, STORE.maxZ + 6); scene.add(head);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); glow.rotation.x = Math.PI / 2; glow.position.set(sx * 12, 5.96, STORE.maxZ + 6); scene.add(glow);
    // (no point lights: per-fragment lights are costly on software GL and N64 never had them anyway)
    colliders.push({ minX: sx * 12 - 0.15, maxX: sx * 12 + 0.15, minZ: STORE.maxZ + 5.85, maxZ: STORE.maxZ + 6.15, h: 0.5 });
  }
  // a couple of parked cars
  for (const [cx, col] of [[-14, 0x8a2020], [16, 0x204a8a], [-18.5, 0x5a5a60]]) {
    const car = new THREE.Group();
    const body = box(2.0, 0.7, 4.2, lambert(col)); body.position.y = 0.6; car.add(body);
    const cabin = box(1.7, 0.6, 2.2, lambert(0x222230)); cabin.position.set(0, 1.25, -0.2); car.add(cabin);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = cylinder(0.32, 0.32, 0.25, 8, lambert(0x1a1a1a)); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.0, 0.32, sz * 1.4); car.add(w); }
    car.position.set(cx, 0, BOUNDS.maxZ - 3); scene.add(car);
    colliders.push({ minX: cx - 1.05, maxX: cx + 1.05, minZ: BOUNDS.maxZ - 5.2, maxZ: BOUNDS.maxZ - 0.8, h: 1.6 });
  }

  // the getaway truck: backed up towards the store, rear doors open
  const truck = new THREE.Group();
  const tz = TRUCK_ZONE.z + 3.6; // cargo box centre
  const cargo = box(2.6, 2.6, 5.2, lambert(0xd8d8d0)); cargo.position.set(0, 1.9, 0); truck.add(cargo);
  const cargoStripe = box(2.62, 0.4, 5.22, lambert(0xc0202a)); cargoStripe.position.set(0, 2.0, 0); truck.add(cargoStripe);
  const inside = box(2.4, 2.4, 0.2, lambert(0x2a2a30)); inside.position.set(0, 1.9, -2.5); truck.add(inside);
  const floorPlate = box(2.4, 0.1, 5.0, lambert(0x3a3a40)); floorPlate.position.set(0, 0.75, 0); truck.add(floorPlate);
  for (const sx of [-1, 1]) { const door = box(1.25, 2.5, 0.1, lambert(0xc8c8c0)); door.position.set(sx * 1.9, 1.95, -3.2); door.rotation.y = sx * 0.35; truck.add(door); }
  const ramp = box(1.6, 0.08, 1.6, lambert(0x8a8a90)); ramp.position.set(0, 0.4, -3.3); ramp.rotation.x = 0.45; truck.add(ramp);
  const cab = box(2.5, 1.9, 2.0, lambert(0x2a3fa0)); cab.position.set(0, 1.3, 3.6); truck.add(cab);
  const cabTop = box(2.3, 0.9, 1.2, lambert(0x2a3fa0)); cabTop.position.set(0, 2.7, 3.2); truck.add(cabTop);
  const windshield = box(2.0, 0.7, 0.05, lambert(0x8fc8e8)); windshield.position.set(0, 2.7, 3.83); truck.add(windshield);
  for (const sx of [-1, 1]) for (const z of [-1.6, 2.9]) { const w = cylinder(0.45, 0.45, 0.35, 8, lambert(0x1a1a1a)); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.35, 0.45, z); truck.add(w); }
  const lootSign = textSprite('LOOT GOES HERE', { color: '#111', bg: '#ffe36a', scale: 2 });
  lootSign.position.set(0, 3.9, -2.6); truck.add(lootSign);
  const tail = box(2.4, 0.15, 0.05, new THREE.MeshBasicMaterial({ color: 0xff5040 })); tail.position.set(0, 0.55, -2.62); truck.add(tail);
  truck.position.set(TRUCK_ZONE.x, 0, tz); scene.add(truck);
  for (const sx of [-1, 1]) colliders.push({ minX: TRUCK_ZONE.x + Math.min(sx * 1.2, sx * 2.6), maxX: TRUCK_ZONE.x + Math.max(sx * 1.2, sx * 2.6), minZ: tz - 3.5, maxZ: tz - 2.7, h: 2.6 }); // open rear doors
  colliders.push({ minX: TRUCK_ZONE.x - 1.35, maxX: TRUCK_ZONE.x + 1.35, minZ: tz - 2.7, maxZ: tz + 4.6, h: 4.5 });
  const zone = new THREE.Mesh(new THREE.RingGeometry(TRUCK_ZONE.r - 0.25, TRUCK_ZONE.r, 24), new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.6, depthWrite: false }));
  zone.rotation.x = -Math.PI / 2; zone.position.set(TRUCK_ZONE.x, 0.015, TRUCK_ZONE.z); scene.add(zone);
  const zoneFill = new THREE.Mesh(new THREE.CircleGeometry(TRUCK_ZONE.r - 0.25, 24), new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.12, depthWrite: false }));
  zoneFill.rotation.x = -Math.PI / 2; zoneFill.position.set(TRUCK_ZONE.x, 0.012, TRUCK_ZONE.z); scene.add(zoneFill);
  const truckSign = textSprite('GETAWAY TRUCK', { color: '#fff', bg: '#c0202a', scale: 3 });
  truckSign.position.set(TRUCK_ZONE.x, 4.6, tz); scene.add(truckSign);

  // shelf aisles
  const types = Object.keys(ITEM_TYPES).filter((t) => t !== 'tv');
  const shelfMat = lambert(0x7a8290), boardMat = lambert(0xb9bcc4), cardMat = new THREE.MeshLambertMaterial({ map: cardboardTexture() });
  AISLE_X.forEach((ax, a) => {
    const zc = AISLE_Z0 + AISLE_LEN / 2;
    const base = box(1.3, 0.12, AISLE_LEN, shelfMat); base.position.set(ax, 0.06, zc); scene.add(base);
    const back = box(0.12, 2.3, AISLE_LEN, shelfMat); back.position.set(ax, 1.15, zc); scene.add(back);
    for (const y of [0.55, 1.15, 1.75]) {
      const b = box(1.24, 0.05, AISLE_LEN, boardMat); b.position.set(ax, y, zc); scene.add(b);
    }
    for (const ez of [AISLE_Z0, AISLE_Z0 + AISLE_LEN]) {
      const cap = box(1.3, 2.3, 0.12, shelfMat); cap.position.set(ax, 1.15, ez); scene.add(cap);
    }
    const sign = textSprite('AISLE ' + (a + 1), { color: '#fff', bg: '#c0202a', scale: 2.2 });
    sign.position.set(ax, 2.9, AISLE_Z0 + AISLE_LEN + 0.2); scene.add(sign);
    colliders.push({ minX: ax - 0.7, maxX: ax + 0.7, minZ: AISLE_Z0 - 0.1, maxZ: AISLE_Z0 + AISLE_LEN + 0.1 });

    for (const s of [-1, 1]) {
      for (let i = 0; i < SLOTS; i++) {
        const z = AISLE_Z0 + 0.95 + i * SLOT_STEP;
        const type = types[(i * 2 + a * 3 + (s > 0 ? 1 : 0)) % types.length];
        const def = ITEM_TYPES[type];
        const mesh = buildItemMesh(type);
        const x = ax + s * 0.4;
        mesh.position.set(x, 1.175 + def.size[1] / 2, z);
        mesh.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(mesh);
        const tag = textSprite('$' + def.price, { color: '#111', bg: '#ffe36a', scale: 0.8 });
        tag.position.set(ax + s * 0.72, 1.0, z); scene.add(tag);
        slots.push({ type, x: ax + s * 0.75, z, mesh });
        // cardboard filler on the bottom / top boards
        for (const y of [0.575, 1.775]) {
          if (rand() < 0.3) continue;
          const bw = 0.35 + rand() * 0.3, bh = 0.25 + rand() * 0.3, bd = 0.3 + rand() * 0.3;
          const cb = box(bd, bh, bw, cardMat);
          cb.position.set(ax + s * 0.3, y + bh / 2, z + (rand() - 0.5) * 0.4); scene.add(cb);
        }
      }
    }
  });

  // TV wall along the north wall
  for (let x = -18; x <= 18; x += 4) {
    const stand = box(1.5, 1.0, 0.6, lambert(0x2a2a34)); stand.position.set(x, 0.5, STORE.minZ + 0.6); scene.add(stand);
    const tv = buildItemMesh('tv'); tv.position.set(x, 1.36, STORE.minZ + 0.6); scene.add(tv);
    const tag = textSprite('$' + ITEM_TYPES.tv.price, { color: '#111', bg: '#ffe36a', scale: 0.8 });
    tag.position.set(x, 0.85, STORE.minZ + 1.0); scene.add(tag);
    slots.push({ type: 'tv', x, z: STORE.minZ + 1.2, mesh: tv });
  }
  colliders.push({ minX: STORE.minX, maxX: STORE.maxX, minZ: STORE.minZ, maxZ: STORE.minZ + 0.95 });
  const tvSign = textSprite('BIG SCREENS', { color: '#fff', bg: '#c0202a', scale: 3 });
  tvSign.position.set(0, 3.2, STORE.minZ + 0.7); scene.add(tvSign);

  // registers (decorative — nobody is paying tonight)
  REGISTERS.forEach(([cx, cz], i) => {
    const z = cz + 1.4;
    const counter = box(3.4, 1.0, 1.0, lambert(0x3a5fbf)); counter.position.set(cx, 0.5, z); scene.add(counter);
    const top = box(3.5, 0.08, 1.1, lambert(0xd8dce4)); top.position.set(cx, 1.02, z); scene.add(top);
    const reg = box(0.5, 0.4, 0.4, lambert(0x2a2a34)); reg.position.set(cx + 1.2, 1.26, z); scene.add(reg);
    const regScreen = box(0.4, 0.25, 0.02, new THREE.MeshBasicMaterial({ color: 0x66ffaa })); regScreen.position.set(cx + 1.2, 1.3, z - 0.2); scene.add(regScreen);
    const pole = cylinder(0.04, 0.04, 2.2, 6, lambert(0x888888)); pole.position.set(cx - 1.4, 2.1, z); scene.add(pole);
    const lamp = cylinder(0.14, 0.14, 0.2, 8, new THREE.MeshBasicMaterial({ color: 0xffe36a })); lamp.position.set(cx - 1.4, 3.3, z); scene.add(lamp);
    const sign = textSprite('REGISTER ' + (i + 1) + ' — CLOSED', { color: '#fff', bg: '#2a3fa0', scale: 2 });
    sign.position.set(cx, 3.7, z); scene.add(sign);
    colliders.push({ minX: cx - 1.75, maxX: cx + 1.75, minZ: z - 0.55, maxZ: z + 0.55, h: 1.1 });
  });

  // cart corral rails (south-east corner)
  const railMat = lambert(0x9aa0a8);
  const cx0 = CART_SPAWNS[0][0] - 1, cx1 = CART_SPAWNS[CART_SPAWNS.length - 1][0] + 1;
  for (const z of [11.2, 13.8]) {
    const r = box(cx1 - cx0, 0.06, 0.06, railMat); r.position.set((cx0 + cx1) / 2, 0.7, z); scene.add(r);
    for (let x = cx0; x <= cx1; x += (cx1 - cx0) / 3) { const p = cylinder(0.04, 0.04, 0.7, 6, railMat); p.position.set(x, 0.35, z); scene.add(p); }
  }
  const corralSign = textSprite('CARTS', { color: '#fff', bg: '#2a3fa0', scale: 2 });
  corralSign.position.set((cx0 + cx1) / 2, 2.6, 12.5); scene.add(corralSign);

  // a few pillars for silhouette
  for (const [px, pz] of [[-17, 5], [17, 5], [-17, -6], [17, -6]]) {
    const pillar = box(0.8, 5, 0.8, lambert(0xd0ccc0)); pillar.position.set(px, 2.5, pz); scene.add(pillar);
    colliders.push({ minX: px - 0.4, maxX: px + 0.4, minZ: pz - 0.4, maxZ: pz + 0.4, h: 5 });
  }

  return { colliders, slots, truckZone: { ...TRUCK_ZONE }, bounds: BOUNDS };
}
