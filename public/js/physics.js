// cannon-es world used by whichever client is the authority of a cart. Only that
// client simulates the items in (and spilled from) that cart.
import * as CANNON from 'cannon-es';

export function makeWorld(colliders) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = false;
  world.broadphase = new CANNON.NaiveBroadphase(); // few bodies; avoids stale-AABB issues with kinematic bodies
  world.defaultContactMaterial.friction = 0.55;
  world.defaultContactMaterial.restitution = 0.05;
  world.defaultContactMaterial.contactEquationRelaxation = 3;
  world.solver.iterations = 12;

  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(ground);

  for (const c of colliders) {
    const hx = (c.maxX - c.minX) / 2, hz = (c.maxZ - c.minZ) / 2;
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, 1.1, hz)) });
    b.position.set(c.minX + hx, 1.1, c.minZ + hz);
    world.addBody(b);
  }
  return world;
}

export function makeItemBody(world, def, p, q) {
  const [w, h, d] = def.size;
  const body = new CANNON.Body({
    mass: 0.3 + def.weight * 0.25,
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    linearDamping: 0.25,
    angularDamping: 0.4,
  });
  body.position.set(p[0], p[1], p[2]);
  body.quaternion.set(q[0], q[1], q[2], q[3]);
  body.angularVelocity.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  world.addBody(body);
  return body;
}
