# Electro Mart Heist

N64-flavoured multiplayer heist built with Three.js, cannon-es and a tiny WebSocket
server. Electro Mart is closed for the night and the alarm is off. Pick Spike, Lizzie,
Bean or Chunk, grab a shopping cart, fill it with electronics and push it out the front
doors to the getaway truck in the parking lot — before the cops show up in 4 minutes.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000 in as many browser windows as you like (or share your LAN
IP with friends on the same network). Three.js / cannon-es load from a CDN, so the
first load needs internet access.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move (relative to camera) |
| Mouse (click canvas to lock) | Look around |
| E | Grab / let go of a cart, or **stash the loot** when the cart is in the truck's yellow zone |
| F | Swipe an item off a shelf / pick up a spilled item / put the item you carry into a cart |

## How it plays

- **Carts have weight.** Every item you drop in slows the cart (and makes it turn slower).
  Chunk's strength shrugs off weight; Spike is fast but weak.
- **Teamwork is speed.** Up to 3 crew members can push one cart. Each helper adds a 40%
  boost and their strength is pooled against the load. Everyone pushing when the loot is
  stashed gets the full cart value added to their haul.
- **Baskets are real.** Items are rigid bodies dropped into a physical basket. Overfill it,
  corner too hard or brake too late and the loot tumbles onto the floor (pick it up with F).
  Big-screen TVs don't fit at all — they balance across the rim if you're careful.
- The truck is outside: you have to push the cart through the front doors and across the
  lot to the yellow zone behind it. Heists last 4 minutes; then the cops arrive, the
  leaderboard shows and the store resets.

## Architecture

- `server.js` — relay + rules. Players are authoritative for their own movement. The first
  pusher of a cart becomes its *authority*: they steer it and run the cannon-es simulation
  of the items in it, streaming transforms to everyone else at 15 Hz. The server owns item
  lifecycle (shelf → held → cart/loose → stashed), scoring and rounds.
- `public/js/main.js` — game loop, third-person camera, cart steering/momentum, interactions, HUD.
- `public/js/n64.js` — the look: 1/3-resolution framebuffer upscaled with nearest filtering,
  blurry 32px canvas textures, flat Lambert lighting, no shadow maps, fog, scanline overlay.
- `public/js/store.js` — the store interior, the parking lot and the getaway truck.
- `public/js/characters.js`, `items.js`, `cart.js`, `physics.js` — everything is built from
  primitives; no external assets.

## Deploy

The game needs a long-lived WebSocket server, which serverless hosts (Vercel) can't run,
so it deploys in two halves:

1. **Server on Render** (free Node tier, WebSockets supported) — push this folder to a
   GitHub repo, then in Render choose *New → Blueprint* and pick the repo; `render.yaml`
   creates the `electro-mart-heist` web service. Its URL alone is a complete, playable
   game (the server serves the client too).
2. **Client on Vercel** — `vercel --prod` publishes `public/` as a static site
   (`vercel.json`). `public/config.js` tells it where the server is
   (`window.EM_SERVER_URL = 'wss://electro-mart-heist.onrender.com'`); change it if your
   Render service got a different name and redeploy. Players can also override the server
   with `?server=wss://host` or the field on the select screen.
