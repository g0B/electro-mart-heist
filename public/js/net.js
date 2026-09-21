// Tiny WebSocket wrapper.

// Where the game server lives: ?server= query param > value typed on the select screen >
// config.js (window.EM_SERVER_URL) > the host that served this page.
export function defaultServerUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return normalizeServerUrl(q);
  let saved = null; try { saved = localStorage.getItem('em_server'); } catch {}
  if (saved) return saved;
  if (window.EM_SERVER_URL) return normalizeServerUrl(window.EM_SERVER_URL);
  return '';
}
export function normalizeServerUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) u = u.replace(/^http/i, 'ws');
  else if (!/^wss?:\/\//i.test(u)) u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + u;
  return u.replace(/\/+$/, '');
}

export class Net {
  constructor() { this.ws = null; this.onMessage = null; this.onClose = null; }
  connect(serverUrl = '') {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = serverUrl || `${proto}://${location.host}`;
      const ws = new WebSocket(url);
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      ws.onclose = () => this.onClose && this.onClose();
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        this.onMessage && this.onMessage(m);
      };
      this.ws = ws;
    });
  }
  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
}
