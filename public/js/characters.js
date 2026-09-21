// The four shoppers, built from boxes/cones/cylinders with tiny canvas face textures.
import * as THREE from 'three';
import { canvasTexture, lambert, box, cylinder, textSprite, blobShadow } from './n64.js';

export const CHARACTERS = {
  spike:  { name: 'SPIKE',  desc: 'Fast. Reckless. Questionable choices.', speed: 7.0, strength: 0.8,
            skin: 0xd9a476, hair: 0x2a4de0, top: 0x1a1a1a, shirt: 0xc0202a, pants: 0x2f3f7a, shoes: 0x222222 },
  lizzie: { name: 'LIZZIE', desc: 'Smart mouth. Explosives expert.',       speed: 5.8, strength: 1.0,
            skin: 0xe0b08a, hair: 0xe0662a, top: 0x8a2fbf, shirt: 0x8a2fbf, pants: 0x2a2a30, shoes: 0x3a2a4a, glasses: true },
  bean:   { name: 'BEAN',   desc: 'Loves junk. Hates work.',               speed: 5.0, strength: 0.9,
            skin: 0xd8a070, hair: 0x4c7a2c, top: 0x3d6b2a, shirt: 0x5a8a3a, pants: 0x556b3a, shoes: 0x2a2a2a, beanie: true },
  chunk:  { name: 'CHUNK',  desc: 'Slow. Strong. Easily distracted.',      speed: 4.5, strength: 1.9,
            skin: 0x8a5a3a, hair: 0x2a1a10, top: 0x2a3fa0, shirt: 0x2a3fa0, pants: 0x2a2a3a, shoes: 0xdddddd, cap: true, wide: true, jersey: '22' },
};

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

function faceTexture(key) {
  const c = CHARACTERS[key];
  return canvasTexture(32, 32, (ctx) => {
    ctx.fillStyle = hex(c.skin); ctx.fillRect(0, 0, 32, 32);
    // eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(7, 12, 7, 6); ctx.fillRect(18, 12, 7, 6);
    ctx.fillStyle = '#111';
    ctx.fillRect(10, 13, 3, 4); ctx.fillRect(21, 13, 3, 4);
    // brows
    ctx.fillStyle = key === 'spike' ? '#1a2a80' : key === 'lizzie' ? '#a04010' : '#2a1a10';
    if (key === 'spike') { ctx.fillRect(6, 8, 9, 2); ctx.fillRect(17, 9, 9, 2); }
    else if (key === 'chunk') { ctx.fillRect(6, 9, 8, 3); ctx.fillRect(18, 9, 8, 3); }
    else { ctx.fillRect(7, 9, 7, 2); ctx.fillRect(18, 9, 7, 2); }
    // glasses
    if (c.glasses) {
      ctx.strokeStyle = '#3a1a5a'; ctx.lineWidth = 2;
      ctx.strokeRect(6, 11, 9, 8); ctx.strokeRect(17, 11, 9, 8); ctx.fillStyle = '#3a1a5a'; ctx.fillRect(15, 14, 2, 2);
    }
    // mouth
    ctx.fillStyle = '#5a2a2a';
    if (key === 'bean') { ctx.fillRect(9, 22, 14, 4); ctx.fillStyle = '#fff'; ctx.fillRect(10, 22, 12, 2); }
    else if (key === 'spike') { ctx.fillRect(12, 23, 10, 2); ctx.fillRect(20, 22, 3, 2); }
    else if (key === 'chunk') { ctx.fillRect(11, 23, 10, 3); }
    else { ctx.fillRect(10, 22, 12, 3); ctx.fillStyle = '#fff'; ctx.fillRect(11, 22, 10, 1); }
    // blush / freckles
    if (key === 'lizzie') { ctx.fillStyle = '#c07050'; ctx.fillRect(5, 19, 2, 1); ctx.fillRect(8, 20, 1, 1); ctx.fillRect(25, 19, 2, 1); }
  });
}

function jerseyTexture(c) {
  return canvasTexture(32, 32, (ctx) => {
    ctx.fillStyle = hex(c.top); ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#e8e8f0'; ctx.font = 'bold 20px Arial Black, Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.jersey, 16, 17);
  });
}

function limb(w, h, d, mat, pivotY) {
  // pivot group at the joint, mesh hanging down from it
  const p = new THREE.Group();
  p.position.y = pivotY;
  const m = box(w, h, d, mat);
  m.position.y = -h / 2;
  p.add(m);
  p.userData.mesh = m;
  return p;
}

export function buildCharacter(key, label) {
  const c = CHARACTERS[key];
  const g = new THREE.Group();
  const wide = c.wide ? 1.35 : 1;
  const skin = lambert(c.skin);
  const rig = new THREE.Group(); // bobs up and down
  g.add(rig);

  // legs
  const lLeg = limb(0.2 * wide, 0.82, 0.24, lambert(c.pants), 0.86); lLeg.position.x = 0.14 * wide;
  const rLeg = limb(0.2 * wide, 0.82, 0.24, lambert(c.pants), 0.86); rLeg.position.x = -0.14 * wide;
  for (const leg of [lLeg, rLeg]) {
    const shoe = box(0.22 * wide, 0.12, 0.34, lambert(c.shoes)); shoe.position.set(0, -0.8, 0.05); leg.add(shoe);
    rig.add(leg);
  }
  // torso
  const torsoMats = [lambert(c.top), lambert(c.top), lambert(c.top), lambert(c.top), lambert(c.top), lambert(c.top)];
  if (c.jersey) torsoMats[4] = new THREE.MeshLambertMaterial({ map: jerseyTexture(c) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62 * wide, 0.72, 0.36 * (c.wide ? 1.2 : 1)), torsoMats);
  torso.position.y = 1.22; rig.add(torso);
  if (key === 'spike') { // open jacket: red shirt strip in the middle
    const strip = box(0.22, 0.68, 0.03, lambert(c.shirt)); strip.position.set(0, 1.22, 0.18); rig.add(strip);
    const pin = box(0.06, 0.06, 0.02, lambert(0xd0d0d0)); pin.position.set(0.2, 1.42, 0.19); rig.add(pin);
  }
  if (key === 'lizzie') { // crop top: exposed midriff
    const mid = box(0.6, 0.18, 0.34, skin); mid.position.set(0, 0.95, 0); rig.add(mid);
  }
  if (key === 'bean') { // hoodie pocket
    const pocket = box(0.4, 0.2, 0.03, lambert(0x2f5a20)); pocket.position.set(0, 1.02, 0.18); rig.add(pocket);
  }
  // arms
  const armMat = key === 'lizzie' ? lambert(0x5a1f8f) : key === 'bean' ? lambert(c.top) : key === 'spike' ? lambert(c.top) : skin;
  const lArm = limb(0.17, 0.72, 0.18, armMat, 1.5); lArm.position.x = 0.31 * wide + 0.1;
  const rArm = limb(0.17, 0.72, 0.18, armMat, 1.5); rArm.position.x = -(0.31 * wide + 0.1);
  for (const arm of [lArm, rArm]) {
    const hand = box(0.15, 0.14, 0.15, skin); hand.position.y = -0.74; arm.add(hand);
    rig.add(arm);
  }
  // head
  const face = faceTexture(key);
  const headMats = [skin, skin, skin, skin, new THREE.MeshLambertMaterial({ map: face }), skin];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMats);
  head.position.y = 1.85; rig.add(head);

  // hair / hats
  const hair = lambert(c.hair);
  if (key === 'spike') {
    const back = box(0.54, 0.26, 0.4, hair); back.position.set(0, 2.05, -0.08); rig.add(back);
    for (let i = 0; i < 5; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 4), hair);
      cone.position.set(-0.2 + i * 0.1, 2.28, -0.1 + (i % 2) * 0.1);
      cone.rotation.z = (i - 2) * 0.35; cone.rotation.x = -0.4;
      rig.add(cone);
    }
    const side = box(0.52, 0.2, 0.52, hair); side.position.set(0, 2.04, 0); rig.add(side);
  } else if (key === 'lizzie') {
    const cap = box(0.54, 0.22, 0.54, hair); cap.position.set(0, 2.06, 0); rig.add(cap);
    const bangs = box(0.5, 0.14, 0.08, hair); bangs.position.set(0, 2.0, 0.24); rig.add(bangs);
    for (const sx of [-1, 1]) {
      const tail = cylinder(0.08, 0.11, 0.5, 6, hair);
      tail.position.set(sx * 0.4, 1.78, -0.05); tail.rotation.z = sx * 0.5; rig.add(tail);
      const tie = cylinder(0.1, 0.1, 0.06, 6, lambert(0x8a2fbf)); tie.position.set(sx * 0.34, 1.98, -0.05); tie.rotation.z = sx * 0.5; rig.add(tie);
    }
  } else if (key === 'bean') {
    const beanie = cylinder(0.32, 0.3, 0.3, 8, hair); beanie.position.set(0, 2.15, 0); rig.add(beanie);
    const brim = cylinder(0.31, 0.31, 0.1, 8, lambert(0x3c6222)); brim.position.set(0, 2.02, 0); rig.add(brim);
    const pom = cylinder(0.09, 0.09, 0.12, 6, lambert(0x8ab060)); pom.position.set(0, 2.34, 0); rig.add(pom);
    const fringe = box(0.4, 0.06, 0.06, lambert(0x6a4a2a)); fringe.position.set(0, 1.99, 0.26); rig.add(fringe);
  } else if (key === 'chunk') {
    const cap = box(0.56, 0.2, 0.56, lambert(0xc0202a)); cap.position.set(0, 2.08, 0); rig.add(cap);
    const dome = box(0.44, 0.1, 0.44, lambert(0xc0202a)); dome.position.set(0, 2.22, 0); rig.add(dome);
    const brim = box(0.5, 0.05, 0.3, lambert(0x8a1520)); brim.position.set(0, 2.0, -0.4); rig.add(brim);
    const hairBack = box(0.5, 0.15, 0.1, hair); hairBack.position.set(0, 1.98, -0.28); rig.add(hairBack);
  }

  const shadow = blobShadow(0.42);
  g.add(shadow);

  const tag = textSprite(label || c.name, { color: '#ffe36a', scale: 1.6 });
  tag.position.y = 2.7;
  g.add(tag);

  g.userData.parts = { lLeg, rLeg, lArm, rArm, head, torso, rig, tag };
  g.userData.char = key;
  return g;
}

// anim: idle | walk | push | pushidle | carry | carrywalk
export function animateCharacter(g, anim, t, speed = 5) {
  const p = g.userData.parts;
  const walking = anim === 'walk' || anim === 'push' || anim === 'carrywalk';
  const w = t * (6 + speed * 1.2);
  const swing = walking ? Math.sin(w) * 0.75 : 0;
  p.lLeg.rotation.x = swing;
  p.rLeg.rotation.x = -swing;
  if (anim === 'carry' || anim === 'carrywalk') {
    p.lArm.rotation.x = -2.9; p.rArm.rotation.x = -2.9;
    p.lArm.rotation.z = 0.25; p.rArm.rotation.z = -0.25;
  } else if (anim === 'push' || anim === 'pushidle') {
    p.lArm.rotation.x = -1.25; p.rArm.rotation.x = -1.25;
    p.lArm.rotation.z = 0; p.rArm.rotation.z = 0;
  } else {
    p.lArm.rotation.x = -swing * 0.8; p.rArm.rotation.x = swing * 0.8;
    p.lArm.rotation.z = 0.08; p.rArm.rotation.z = -0.08;
  }
  p.rig.position.y = walking ? Math.abs(Math.sin(w)) * 0.06 : Math.sin(t * 2.2) * 0.012;
  p.head.rotation.z = walking ? Math.sin(w) * 0.05 : 0;
}
