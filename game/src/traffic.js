// Traffic and pedestrians for VELDORA BAY. Traffic cars cruise the road grid:
// each picks a road, drives straight, and at an intersection either carries on
// or turns onto the cross road. Pedestrians stroll the sidewalks, pause at
// corners, and scatter when the player drives at them or shots ring out.

import * as THREE from 'three';
import { TRAFFIC, WORLD } from './config.js';
import { Car } from './vehicles.js';

function makePedMesh(rng) {
  const ped = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: [0xd8a077, 0x8a5a3a, 0xe8c8a8][rng.int(0, 2)] });
  const shirt = new THREE.MeshLambertMaterial({ color: [0xc23b2e, 0x2e6ab0, 0x3a8a4a, 0xd8c86a, 0x7a3ab0][rng.int(0, 4)] });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  ped.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  ped.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legL.position.set(-0.14, 0.35, 0);
  ped.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legR.position.set(0.14, 0.35, 0);
  ped.add(legR);
  return { group: ped, legL, legR };
}

/** Create the traffic system; update(dt, playerPos, dangerAt) advances it. */
export function createTraffic(scene, rng, colliders, roads) {
  const cars = [];
  const peds = [];

  function randomRoadPoint() {
    const road = rng.pick(roads);
    const along = rng.range(-280, 280);
    const side = rng.chance(0.5) ? 1 : -1;
    // Right-hand traffic: offset to the right of the direction of travel.
    if (rng.chance(0.5)) return { x: along, z: road + side * 3.5, heading: side > 0 ? Math.PI / 2 : -Math.PI / 2, axis: 'x' };
    return { x: road + side * 3.5, z: along, heading: side > 0 ? Math.PI : 0, axis: 'z' };
  }

  for (let i = 0; i < TRAFFIC.COUNT; i += 1) {
    const spot = randomRoadPoint();
    const car = new Car(scene, spot.x, spot.z, spot.heading, undefined, { ai: true });
    car.axis = spot.axis;
    car.cruise = rng.range(0.7, 1.1) * TRAFFIC.SPEED;
    cars.push(car);
  }

  for (let i = 0; i < TRAFFIC.PED_COUNT; i += 1) {
    const built = makePedMesh(rng);
    const road = rng.pick(roads);
    const along = rng.range(-280, 280);
    const side = rng.chance(0.5) ? 1 : -1;
    const onXRoad = rng.chance(0.5);
    const ped = {
      mesh: built.group,
      legL: built.legL,
      legR: built.legR,
      x: onXRoad ? along : road + side * (WORLD.ROAD_W / 2 + 2.5),
      z: onXRoad ? road + side * (WORLD.ROAD_W / 2 + 2.5) : along,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(0.8, 1) * TRAFFIC.PED_SPEED,
      pause: 0,
      walkPhase: rng.range(0, Math.PI * 2),
      fleeing: false,
    };
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    scene.add(ped.mesh);
    peds.push(ped);
  }

  function turnAtIntersection(car) {
    // At a grid crossing, sometimes turn onto the cross road.
    const nearX = roads.reduce((best, r) => (Math.abs(car.pos.x - r) < Math.abs(car.pos.x - best) ? r : best), roads[0]);
    const nearZ = roads.reduce((best, r) => (Math.abs(car.pos.z - r) < Math.abs(car.pos.z - best) ? r : best), roads[0]);
    const onCrossing = Math.abs(car.pos.x - nearX) < 2 && Math.abs(car.pos.z - nearZ) < 2;
    if (!onCrossing || !rng.chance(0.35)) return;
    if (car.axis === 'x') {
      car.axis = 'z';
      car.heading = rng.chance(0.5) ? 0 : Math.PI;
      car.pos.x = nearX + (car.heading === 0 ? 3.5 : -3.5);
    } else {
      car.axis = 'x';
      car.heading = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      car.pos.z = nearZ + (car.heading === Math.PI / 2 ? 3.5 : -3.5);
    }
  }

  return {
    cars,
    peds,
    /** Advance traffic and pedestrians one step. */
    update(dt, playerPos, dangerAt) {
      for (const car of cars) {
        // Slow down for the car ahead on the same lane.
        let targetSpeed = car.cruise;
        for (const other of cars) {
          if (other === car || other.axis !== car.axis) continue;
          const dx = other.pos.x - car.pos.x;
          const dz = other.pos.z - car.pos.z;
          const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
          const lateral = Math.abs(car.axis === 'x' ? dz : dx);
          if (ahead > 0 && ahead < 12 && lateral < 3) targetSpeed = 0;
        }
        const speed = Math.min(car.cruise, targetSpeed);
        car.speed = speed;
        car.pos.x += Math.sin(car.heading) * speed * dt;
        car.pos.z += Math.cos(car.heading) * speed * dt;
        // Bounce off the world edge by turning around at the last road.
        if (Math.abs(car.pos.x) > 300 || Math.abs(car.pos.z) > 300) {
          car.heading += Math.PI;
          car.pos.x = Math.max(-295, Math.min(295, car.pos.x));
          car.pos.z = Math.max(-295, Math.min(295, car.pos.z));
        }
        turnAtIntersection(car);
        car.syncMesh(dt);
      }
      for (const ped of peds) {
        const dx = ped.x - playerPos.x;
        const dz = ped.z - playerPos.z;
        const distToPlayer = Math.hypot(dx, dz);
        const danger = dangerAt ? Math.hypot(ped.x - dangerAt.x, ped.z - dangerAt.z) < 14 : false;
        if ((distToPlayer < 6 && playerPos.driving) || danger) ped.fleeing = true;
        if (ped.fleeing && distToPlayer > 30 && !danger) ped.fleeing = false;
        if (ped.pause > 0) {
          ped.pause -= dt;
        } else {
          const speed = ped.fleeing ? ped.speed * 2.6 : ped.speed;
          let hx = Math.sin(ped.heading);
          let hz = Math.cos(ped.heading);
          if (ped.fleeing) {
            const len = Math.max(0.001, distToPlayer);
            hx = dx / len;
            hz = dz / len;
          }
          ped.x += hx * speed * dt;
          ped.z += hz * speed * dt;
          ped.walkPhase += dt * speed * 4;
          // Wander: at a road crossing, sometimes pick a new direction along the sidewalk.
          if (Math.abs(ped.x) > 295 || Math.abs(ped.z) > 295 || rng.chance(dt * 0.05)) {
            ped.heading = rng.range(0, Math.PI * 2);
            if (rng.chance(0.4)) ped.pause = rng.range(1, 4);
          }
          ped.x = Math.max(-295, Math.min(295, ped.x));
          ped.z = Math.max(-295, Math.min(295, ped.z));
        }
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = Math.atan2(Math.sin(ped.heading), Math.cos(ped.heading));
        ped.legL.rotation.x = Math.sin(ped.walkPhase) * 0.5;
        ped.legR.rotation.x = -Math.sin(ped.walkPhase) * 0.5;
      }
    },
    /** A pedestrian close to (x, z) — used for hit-and-run wanted and mission checks. */
    nearestPed(x, z, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const ped of peds) {
        const d = Math.hypot(ped.x - x, ped.z - z);
        if (d < bestD) {
          bestD = d;
          best = ped;
        }
      }
      return best;
    },
    removePed(ped) {
      const index = peds.indexOf(ped);
      if (index >= 0) peds.splice(index, 1);
      scene.remove(ped.mesh);
    },
  };
}
