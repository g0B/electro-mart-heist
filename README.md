# Electro Mart Heist

N64-style co-op heist: grab a shopping cart, fill it with electronics and push it out to the getaway truck before the cops arrive in 4 minutes.

Pick Spike, Lizzie, Bean or Chunk. Electro Mart is closed for the night and the alarm is off.

## Play

- Live: https://electro-mart-heist.vercel.app
- Local: `npm start` (static server on http://localhost:5220), or start it from the Games Switchboard.

**Solo** plays alone in your browser. **Host heist** opens a room and shows a 4-letter code plus a **Copy invite** link (`?room=CODE`); friends open the link or type the code and press **Join**. Three.js, cannon-es and PeerJS load from a CDN, so you need internet access.

Peer-to-peer caveats: the heist ends if the host closes their tab, and strict NATs or corporate firewalls can block WebRTC.

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

## How it works

- `public/js/sim.js` — the room rules (render-free, runs in the host's browser and in Node for tests). Players are authoritative for their own movement. The first pusher of a cart becomes its *authority*: they steer it and run the cannon-es simulation of the items in it, streaming transforms to everyone else at 15 Hz. The room owns item lifecycle (shelf → held → cart/loose → stashed), scoring and rounds.
- `public/js/net.js` — PeerJS transport. The host's browser runs `sim.js` ticked from a Web Worker (so alt-tabbing doesn't freeze the game); guests connect by room code. Solo runs the same room locally with no peer.
- `public/js/main.js` — game loop, third-person camera, cart steering/momentum, interactions, HUD, lobby.
- `public/js/n64.js` — the look: 1/3-resolution framebuffer upscaled with nearest filtering, blurry 32px canvas textures, flat Lambert lighting, no shadow maps, fog, scanline overlay.
- `public/js/store.js` — the store interior, the parking lot and the getaway truck.
- `public/js/characters.js`, `items.js`, `cart.js`, `physics.js` — everything is built from primitives; no external assets.

## Dev

- `npm test` runs the headless room test (`test/sim-test.mjs`): join, grab, swipe, place, stash, score split, authority hand-off and round reset.
- Static site on Vercel (`vercel.json` serves `public/`, no build step). No game server.
