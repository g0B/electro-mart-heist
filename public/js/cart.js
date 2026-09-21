// Shopping cart: visual mesh + a kinematic cannon-es "basket" (floor + 4 walls) that the
// cart authority drives each frame so items inside it get carried, slide and tip out.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { canvasTexture, lambert, box, cylinder, blobShadow } from './n64.js';

// Basket interior. Cart local +z is forward; the pusher stands at -z.
export const BASKET = { len: 1.0, wid: 0.66, hgt: 0.6, floorY: 0.5, fwd: 0.05 };
export const CART_RADIUS = 0.8;
export const HANDLE_DIST = 1.15; // pusher stands this far behind the basket centre

let gridTex = null;
function gridTexture() {
  return (gridTex ??= canvasTexture(32, 32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    ctx.strokeStyle = '#b9c0cc'; ctx.lineWidth = 2;
    for (let i = 0; i <= 32; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 32); ctx.moveTo(0, i); ctx.lineTo(32, i); ctx.stroke(); }
  }, { repeat: [3, 2] }));
}

export function buildCartMesh() {
  const g = new THREE.Group();
  const { len, wid, hgt, floorY, fwd } = BASKET;
  const mesh = new THREE.MeshLambertMaterial({ map: gridTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xd8dce6 });
  const solid = lambert(0x9aa3b4);
  const red = lambert(0xc0202a);

  // basket (slightly taller on the outside than the physics walls so items look contained)
  const b = new THREE.Group(); b.position.set(0, floorY + hgt / 2, fwd);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), mesh); fl.rotation.x = -Math.PI / 2; fl.position.y = -hgt / 2; b.add(fl);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt), mesh); front.position.z = len / 2; b.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt), mesh); back.position.z = -len / 2; b.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(len, hgt), mesh); left.rotation.y = Math.PI / 2; left.position.x = -wid / 2; b.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(len, hgt), mesh); right.rotation.y = Math.PI / 2; right.position.x = wid / 2; b.add(right);
  // rim
  for (const [w, d, x, z] of [[wid + 0.04, 0.04, 0, len / 2], [wid + 0.04, 0.04, 0, -len / 2], [0.04, len, -wid / 2, 0], [0.04, len, wid / 2, 0]]) {
    const r = box(w, 0.04, d, solid); r.position.set(x, hgt / 2, z); b.add(r);
  }
  g.add(b);

  // chassis + wheels
  for (const sx of [-1, 1]) {
    const bar = box(0.05, 0.05, len + 0.2, solid); bar.position.set(sx * (wid / 2 - 0.05), 0.2, fwd); g.add(bar);
    for (const sz of [-1, 1]) {
      const strut = box(0.05, floorY - 0.2, 0.05, solid); strut.position.set(sx * (wid / 2 - 0.05), (floorY + 0.2) / 2, fwd + sz * (len / 2 - 0.1)); g.add(strut);
      const wheel = cylinder(0.09, 0.09, 0.05, 8, lambert(0x2a2a2a)); wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (wid / 2 - 0.05), 0.09, fwd + sz * (len / 2 - 0.05)); g.add(wheel);
    }
  }
  // handle
  const hz = fwd - len / 2 - 0.12;
  for (const sx of [-1, 1]) {
    const up = box(0.05, 0.6, 0.05, solid); up.position.set(sx * (wid / 2), floorY + 0.2, hz); up.rotation.x = 0.35; g.add(up);
  }
  const grip = cylinder(0.035, 0.035, wid + 0.1, 6, red); grip.rotation.z = Math.PI / 2; grip.position.set(0, floorY + 0.55, hz - 0.1); g.add(grip);
  const seat = box(wid - 0.1, 0.02, 0.25, red); seat.position.set(0, floorY + 0.2, fwd - len / 2 + 0.15); g.add(seat);

  g.add(blobShadow(0.75, 0.3));
  return g;
}

export class CartBody {
  constructor(world, cart) {
    this.world = world;
    const { len, wid, hgt } = BASKET;
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    // Walls are thick and extend outward (inner faces stay at the basket size) so fast
    // items can't tunnel through them when the cart brakes or turns hard.
    const T = 0.15;
    body.addShape(new CANNON.Box(new CANNON.Vec3(wid / 2 + T, 0.06, len / 2 + T)), new CANNON.Vec3(0, -hgt / 2 - 0.06, 0));
    body.addShape(new CANNON.Box(new CANNON.Vec3(wid / 2 + T, hgt / 2, T)), new CANNON.Vec3(0, 0, len / 2 + T));
    body.addShape(new CANNON.Box(new CANNON.Vec3(wid / 2 + T, hgt / 2, T)), new CANNON.Vec3(0, 0, -len / 2 - T));
    body.addShape(new CANNON.Box(new CANNON.Vec3(T, hgt / 2, len / 2 + T)), new CANNON.Vec3(-wid / 2 - T, 0, 0));
    body.addShape(new CANNON.Box(new CANNON.Vec3(T, hgt / 2, len / 2 + T)), new CANNON.Vec3(wid / 2 + T, 0, 0));
    this.body = body;
    this.prev = null;
    this.set(cart, 1 / 60);
    world.addBody(body);
  }
  // Drive the kinematic body by velocity so cannon integrates it to exactly where the
  // cart is this frame (setting position directly breaks resting contacts).
  set(cart, dt) {
    const { hgt, floorY, fwd } = BASKET;
    const px = cart.x + Math.sin(cart.rot) * fwd, pz = cart.z + Math.cos(cart.rot) * fwd, py = floorY + hgt / 2;
    const b = this.body;
    if (!this.prev || dt <= 0 || Math.hypot(px - b.position.x, pz - b.position.z) > 3) {
      // first placement or a teleport: snap
      b.position.set(px, py, pz);
      b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), cart.rot);
      b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
      b.aabbNeedsUpdate = true;
    } else {
      b.velocity.set((px - b.position.x) / dt, (py - b.position.y) / dt, (pz - b.position.z) / dt);
      const cur = 2 * Math.atan2(b.quaternion.y, b.quaternion.w);
      let dr = cart.rot - cur; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      b.angularVelocity.set(0, dr / dt, 0);
    }
    this.prev = { x: px, z: pz };
  }
  // Is a world position inside the basket volume (with a little slack)?
  contains(cart, x, y, z) {
    const { len, wid, hgt, floorY, fwd } = BASKET;
    const dx = x - cart.x, dz = z - cart.z;
    const c = Math.cos(cart.rot), s = Math.sin(cart.rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c - fwd;
    return Math.abs(lx) < wid / 2 + 0.2 && Math.abs(lz) < len / 2 + 0.2 && y > floorY - 0.15 && y < floorY + hgt + 1.2;
  }
  destroy() { this.world.removeBody(this.body); }
}
