// Visual meshes for every item type. The physics shape is always the plain box from
// ITEM_TYPES.size; these are just chunky low-poly dressings on top of it.
import * as THREE from 'three';
import { ITEM_TYPES } from './itemdata.js';
import { lambert, box, cylinder, screenTexture, canvasTexture } from './n64.js';

const cache = {};
function tex(kind) { return (cache[kind] ??= screenTexture(kind)); }

function keysTexture() {
  return (cache.keys ??= canvasTexture(32, 12, (ctx, w, h) => {
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8a8a96';
    for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) ctx.fillRect(x, y, 2, 2);
  }));
}

function screenPlane(w, h, kind) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex(kind) }));
  return m;
}

export function buildItemMesh(type) {
  const def = ITEM_TYPES[type];
  const [w, h, d] = def.size;
  const g = new THREE.Group();
  const body = box(w, h, d, lambert(def.color));
  g.add(body);

  switch (type) {
    case 'phone': {
      const s = screenPlane(w * 0.85, h * 0.8, 'phone'); s.position.z = d / 2 + 0.002; g.add(s);
      break;
    }
    case 'headphones': {
      body.visible = false;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 5, 10, Math.PI), lambert(def.color));
      band.position.y = 0.0; g.add(band);
      for (const sx of [-1, 1]) {
        const cup = cylinder(0.055, 0.055, 0.05, 8, lambert(0x222222));
        cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.105, 0, 0); g.add(cup);
        const pad = cylinder(0.045, 0.045, 0.02, 8, lambert(0x553333));
        pad.rotation.z = Math.PI / 2; pad.position.set(sx * 0.07, 0, 0); g.add(pad);
      }
      break;
    }
    case 'keyboard': {
      const top = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.95, d * 0.85), new THREE.MeshLambertMaterial({ map: keysTexture() }));
      top.rotation.x = -Math.PI / 2; top.position.y = h / 2 + 0.002; g.add(top);
      break;
    }
    case 'console': {
      const lid = box(w * 0.8, 0.02, d * 0.8, lambert(0x7a5abf)); lid.position.y = h / 2 + 0.01; g.add(lid);
      const handle = box(0.12, 0.05, 0.04, lambert(0x2a1a4a)); handle.position.set(0, h / 2 + 0.03, -d / 2 + 0.02); g.add(handle);
      const led = box(0.03, 0.02, 0.01, new THREE.MeshBasicMaterial({ color: 0xff8800 })); led.position.set(-w * 0.3, 0, d / 2 + 0.005); g.add(led);
      break;
    }
    case 'laptop': {
      const logo = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshBasicMaterial({ color: 0xeeeeff }));
      logo.rotation.x = -Math.PI / 2; logo.position.y = h / 2 + 0.002; g.add(logo);
      const stripe = box(w * 0.9, 0.006, 0.01, lambert(0x333344)); stripe.position.set(0, 0, d / 2 - 0.005); g.add(stripe);
      break;
    }
    case 'speaker': {
      for (const sx of [-1, 1]) {
        const cone = cylinder(0.09, 0.09, 0.02, 8, lambert(0x555560));
        cone.rotation.x = Math.PI / 2; cone.position.set(sx * 0.17, -0.02, d / 2 + 0.005); g.add(cone);
        const dome = cylinder(0.035, 0.035, 0.02, 6, lambert(0xd0d0d8));
        dome.rotation.x = Math.PI / 2; dome.position.set(sx * 0.17, -0.02, d / 2 + 0.015); g.add(dome);
      }
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 4, 8, Math.PI), lambert(0x444444));
      handle.position.y = h / 2; g.add(handle);
      const deck = box(0.18, 0.06, 0.02, lambert(0x8899aa)); deck.position.set(0, 0.08, d / 2 + 0.005); g.add(deck);
      break;
    }
    case 'monitor': {
      const s = screenPlane(w * 0.9, h * 0.85, 'bars'); s.position.z = d / 2 + 0.002; g.add(s);
      break;
    }
    case 'printer': {
      const tray = box(w * 0.7, 0.01, d * 0.5, lambert(0xffffff)); tray.position.set(0, h / 2 + 0.005, -0.05); g.add(tray);
      const panel = box(w * 0.3, 0.02, 0.08, lambert(0x303040)); panel.position.set(w * 0.25, h / 2 + 0.01, d / 2 - 0.06); g.add(panel);
      const slot = box(w * 0.8, 0.02, 0.01, lambert(0x101010)); slot.position.set(0, -0.02, d / 2 + 0.005); g.add(slot);
      break;
    }
    case 'microwave': {
      const door = box(w * 0.62, h * 0.8, 0.01, lambert(0x1a1a1a)); door.position.set(-w * 0.15, 0, d / 2 + 0.005); g.add(door);
      const win = box(w * 0.5, h * 0.55, 0.005, lambert(0x2a3a4a)); win.position.set(-w * 0.15, 0.02, d / 2 + 0.012); g.add(win);
      const panel = box(w * 0.22, h * 0.8, 0.005, lambert(0x8899aa)); panel.position.set(w * 0.34, 0, d / 2 + 0.005); g.add(panel);
      break;
    }
    case 'tv': {
      const s = screenPlane(w * 0.94, h * 0.9, 'bars'); s.position.z = d / 2 + 0.002; g.add(s);
      const logo = box(0.1, 0.02, 0.005, lambert(0x8888aa)); logo.position.set(0, -h / 2 + 0.02, d / 2 + 0.005); g.add(logo);
      break;
    }
  }
  g.userData.def = def;
  g.userData.type = type;
  return g;
}
