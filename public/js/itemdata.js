// Shared between server and client (plain ES module, no three.js imports).
// size = [width, height, depth] in metres, weight in "lbs" (gameplay units), price in $.
export const ITEM_TYPES = {
  phone:      { name: 'SmartPhone',    size: [0.16, 0.32, 0.06], weight: 1,  price: 699,  color: 0x1a1a24 },
  headphones: { name: 'Headphones',    size: [0.24, 0.24, 0.20], weight: 1,  price: 149,  color: 0xcc2233 },
  keyboard:   { name: 'Keyboard',      size: [0.46, 0.04, 0.16], weight: 1,  price: 89,   color: 0x2a2a30 },
  console:    { name: 'GoGiCube 64',   size: [0.34, 0.14, 0.34], weight: 3,  price: 299,  color: 0x5a3a9a },
  laptop:     { name: 'Laptop',        size: [0.42, 0.05, 0.30], weight: 2,  price: 1299, color: 0xb8b8c4 },
  speaker:    { name: 'Boombox',       size: [0.56, 0.30, 0.22], weight: 5,  price: 249,  color: 0x2c2c2c },
  monitor:    { name: 'Monitor',       size: [0.60, 0.42, 0.10], weight: 6,  price: 349,  color: 0x202028 },
  printer:    { name: 'Printer',       size: [0.48, 0.28, 0.40], weight: 8,  price: 199,  color: 0xe4e4dc },
  microwave:  { name: 'Microwave',     size: [0.56, 0.34, 0.42], weight: 12, price: 129,  color: 0xc8c8cc },
  tv:         { name: 'Big Screen TV', size: [1.15, 0.68, 0.10], weight: 18, price: 1999, color: 0x101014 },
};

// Decorative registers inside the store (the staff went home; nobody is paying tonight).
export const REGISTERS = [[-9, 7.6], [0, 7.6], [9, 7.6]];
// Rear of the getaway truck in the parking lot: push a cart here and stash the loot.
export const TRUCK_ZONE = { x: 0, z: 21.5, r: 3.0 };
export const CART_SPAWNS = [[15.5, 12.5, Math.PI], [17, 12.5, Math.PI], [18.5, 12.5, Math.PI], [20, 12.5, Math.PI]];
export const PLAYER_SPAWN = { x: 0, z: 19, spread: 6 };
export const MAX_PUSHERS = 3;
