// Peer-to-peer transport (PeerJS / WebRTC). The host's browser runs the authoritative
// room (sim.js); everyone else connects to the host by room code. Solo runs the same
// room locally with no peer at all. No game server: the site is static files.
import * as Sim from './sim.js';

const PREFIX = 'electro-mart-heist-v1-';
const PEER_OPTS = {
  debug: 1,
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] },
};

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export class Net {
  constructor() { this.onMessage = null; this.onClose = null; this.peer = null; this.conn = null; this.room = null; this.local = null; this.code = ''; }
  get isHost() { return !!this.room; }

  // Messages to the local player are deep-copied and delivered async so the renderer never
  // shares objects with the room, and a render error can't unwind into the room's logic.
  deliver(msg) {
    const copy = JSON.parse(JSON.stringify(msg));
    queueMicrotask(() => { try { this.onMessage && this.onMessage(copy); } catch (e) { console.error(e); } });
  }

  startRoom(code) {
    this.code = code;
    this.room = Sim.createRoom(code);
    this.local = Sim.addPlayer(this.room, (m) => this.deliver(m));
    // Tick from a Web Worker: main-thread timers throttle to ~1/s in background tabs,
    // which would freeze everyone if the host alt-tabs.
    const src = `setInterval(() => postMessage(0), ${Sim.TICK_MS});`;
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    let last = performance.now();
    worker.onmessage = () => { const now = performance.now(); Sim.step(this.room, (now - last) / 1000); last = now; };
  }

  solo() { this.startRoom(''); return Promise.resolve(); }

  host(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') return reject(new Error("Couldn't load PeerJS. Check your connection, or play solo."));
      const peer = new Peer(PREFIX + code, PEER_OPTS);
      this.peer = peer;
      let open = false;
      peer.on('open', () => { open = true; this.startRoom(code); resolve(); });
      peer.on('connection', (c) => {
        let pl = null;
        c.on('open', () => { pl = Sim.addPlayer(this.room, (m) => { if (c.open) c.send(m); }); });
        c.on('data', (m) => { if (pl) Sim.onMessage(this.room, pl, m); });
        const bye = () => { if (pl) { Sim.removePlayer(this.room, pl); pl = null; } };
        c.on('close', bye);
        c.on('error', bye);
      });
      peer.on('error', (e) => {
        if (open) { console.warn('peer error', e.type); return; }
        reject(new Error(e.type === 'unavailable-id' ? 'That room code is already taken. Try again.' : `Couldn't open the room (${e.type}).`));
      });
      // Stay registered with the broker so late joiners can still find us.
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') return reject(new Error("Couldn't load PeerJS. Check your connection, or play solo."));
      const peer = new Peer(PEER_OPTS);
      this.peer = peer; this.code = code;
      let opened = false;
      const timeout = setTimeout(() => { if (!opened) reject(new Error("Couldn't reach the host. They may have closed their tab, or a firewall is blocking it.")); }, 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => { opened = true; clearTimeout(timeout); resolve(); });
        conn.on('data', (m) => { try { this.onMessage && this.onMessage(m); } catch (e) { console.error(e); } });
        conn.on('close', () => this.onClose && this.onClose());
      });
      peer.on('error', (e) => {
        clearTimeout(timeout);
        if (e.type === 'peer-unavailable') reject(new Error(`No heist called ${code}. Check the code, or host your own.`));
        else if (!opened) reject(new Error(`Connection error (${e.type}).`));
      });
    });
  }

  send(msg) {
    if (this.room) Sim.onMessage(this.room, this.local, msg);
    else if (this.conn && this.conn.open) this.conn.send(msg);
  }
}
