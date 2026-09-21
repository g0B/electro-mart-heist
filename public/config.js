// Game server (WebSocket) location.
// Leave empty when the Node server also serves this page (local dev, Render, Railway...).
// When the client is hosted statically (e.g. Vercel), point this at the Render service:
//   window.EM_SERVER_URL = 'wss://electro-mart-heist.onrender.com';
// It can also be overridden per-visit with ?server=wss://host, or from the select screen.
window.EM_SERVER_URL = 'wss://electro-mart-heist.onrender.com';
