// N64-flavoured rendering helpers: low internal resolution, tiny blurry textures,
// flat Lambert shading, no shadow maps, distance fog. Everything is built from primitives.
import * as THREE from 'three';

export const RENDER_SCALE = 1 / 3; // internal framebuffer = window size / 3, upscaled nearest

export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  return renderer;
}

export function fitRenderer(renderer, ...cameras) {
  const w = Math.max(160, Math.floor(window.innerWidth * RENDER_SCALE));
  const h = Math.max(90, Math.floor(window.innerHeight * RENDER_SCALE));
  renderer.setSize(w, h, false);
  for (const c of cameras) { c.aspect = w / h; c.updateProjectionMatrix(); }
}

// Draws into a small canvas and returns a texture with N64-style bilinear (blurry) filtering.
export function canvasTexture(w, h, draw, { repeat = null, nearest = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

export function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

export function cylinder(rTop, rBot, h, segs, material) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), material);
}

// Small text billboard (names, price tags, signs).
export function textSprite(text, { color = '#fff', bg = 'rgba(0,0,0,0.55)', scale = 1, font = 'bold 28px Arial Black, Impact, sans-serif', pad = 10 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  const tw = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.width = Math.max(32, tw); c.height = 44;
  ctx.font = font;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, c.width / 2, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set((c.width / 44) * 0.22 * scale, 0.22 * scale, 1);
  return sp;
}

export function blobShadow(radius, opacity = 0.35) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

// N64 "test pattern" / UI-ish screen texture used on TVs, monitors and phones.
export function screenTexture(kind = 'bars') {
  return canvasTexture(32, 24, (ctx, w, h) => {
    if (kind === 'bars') {
      const cols = ['#e8e8e8', '#e8e838', '#38e8e8', '#38e838', '#e838e8', '#e83838', '#3838e8'];
      cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((i * w) / 7, 0, w / 7 + 1, h * 0.7); });
      ctx.fillStyle = '#101010'; ctx.fillRect(0, h * 0.7, w, h * 0.3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(2, h * 0.78, 10, 3);
    } else if (kind === 'phone') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2fd3ff'); g.addColorStop(1, '#8a3fff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) ctx.fillRect(4 + i * 7, 4 + j * 6, 4, 4);
    } else {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#1b6bd8'); g.addColorStop(1, '#0b2a5c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial'; ctx.fillText('GoGi', 4, 14);
    }
  });
}
