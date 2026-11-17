// The wanted system for VELDORA BAY. Crimes raise the heat (0–5 stars);
// police cars and foot cops spawn in proportion, chase the player, ram the
// car, and bust the player on foot. Lie low and the heat cools off star by
// star. The police never know exactly where the player is at 1 star — they
// search — but at 3+ they home in.

import * as THREE from 'three';
import { POLICE, WORLD } from './config.js';
import { Car } from './vehicles.js';

function makeCopMesh() {
  const cop = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a077 });
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1f2a5a });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  cop.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), uniform);
  cap.position.y = 1.78;
  cop.add(cap);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), uniform);
  torso.position.y = 1.05;
  torso.castShadow = true;
  cop.add(torso);
  const pants = new THREE.MeshLambertMaterial({ color: 0x141a30 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legL.position.set(-0.14, 0.35, 0);
  cop.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legR.position.set(0.14, 0.35, 0);
  cop.add(legR);
  return { group: cop, legL, legR };
}

/** Create the police system. `onBusted` fires when the player is caught. */
export function createPolice(scene, rng, colliders, onBusted) {
  let wanted = 0;
  let timeSinceCrime = 999;
  let coolTimer = 0;
  let bustTimer = 0;
  const units = []; // { car|null, cop|null, x, z, heading, speed }

  function spawnPositionNear(playerPos) {
    for (let tries = 0; tries < 12; tries += 1) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(POLICE.SPAWN_DISTANCE, POLICE.SPAWN_DISTANCE + 40);
      const x = playerPos.x + Math.cos(angle) * dist;
      const z = playerPos.z + Math.sin(angle) * dist;
      if (Math.abs(x) < 290 && Math.abs(z) < 290) return { x, z };
    }
    return { x: playerPos.x + POLICE.SPAWN_DISTANCE, z: playerPos.z };
  }

  function desiredUnits() {
    return POLICE.UNITS_PER_STAR[wanted] || 0;
  }

  function addUnit(playerPos) {
    const spot = spawnPositionNear(playerPos);
    if (wanted >= 2 || rng.chance(0.55)) {
      const car = new Car(scene, spot.x, spot.z, rng.range(0, Math.PI * 2), 0x1a1d24, { police: true, ai: true });
      car.speed = 0;
      units.push({ car, cop: null, kind: 'car' });
    } else {
      const built = makeCopMesh();
      built.group.position.set(spot.x, 0, spot.z);
      scene.add(built.group);
      units.push({ car: null, cop: built, kind: 'cop', x: spot.x, z: spot.z, heading: 0, walkPhase: 0 });
    }
  }

  function removeUnit(unit) {
    if (unit.car) unit.car.remove();
    if (unit.cop) scene.remove(unit.cop.group);
    units.splice(units.indexOf(unit), 1);
  }

  return {
    get wanted() {
      return wanted;
    },
    get units() {
      return units;
    },
    /** Raise the heat by `stars` (clamped to 5) and reset the cool-down clock. */
    addWanted(stars) {
      wanted = Math.min(5, wanted + stars);
      timeSinceCrime = 0;
      coolTimer = 0;
    },
    setWanted(stars) {
      wanted = Math.max(0, Math.min(5, stars));
      timeSinceCrime = 0;
      coolTimer = 0;
    },
    clearWanted() {
      wanted = 0;
      timeSinceCrime = 999;
      for (const unit of [...units]) removeUnit(unit);
    },
    /** Advance police AI one step. Returns 'busted' when the player is caught. */
    update(dt, player, playerPos, playerDriving, onRam) {
      timeSinceCrime += dt;
      // Cool-down: after a quiet spell, lose one star every COOL_PER_STAR seconds.
      if (wanted > 0 && timeSinceCrime > POLICE.COOL_DELAY) {
        coolTimer += dt;
        if (coolTimer >= POLICE.COOL_PER_STAR) {
          coolTimer = 0;
          wanted -= 1;
        }
      }
      // Spawn / despawn to match the wanted level.
      while (units.length < desiredUnits()) addUnit(playerPos);
      while (units.length > desiredUnits()) removeUnit(units[units.length - 1]);
      for (const unit of [...units]) {
        const dx = playerPos.x - (unit.car ? unit.car.pos.x : unit.x);
        const dz = playerPos.z - (unit.car ? unit.car.pos.z : unit.z);
        const dist = Math.hypot(dx, dz);
        if (dist > POLICE.DESPAWN_DISTANCE) {
          const spot = spawnPositionNear(playerPos);
          if (unit.car) {
            unit.car.pos.x = spot.x;
            unit.car.pos.z = spot.z;
          } else {
            unit.x = spot.x;
            unit.z = spot.z;
          }
          continue;
        }
        if (unit.kind === 'car') {
          const car = unit.car;
          // Steer toward the player, with a wobble so the chase reads as a chase.
          const targetHeading = Math.atan2(dx, dz) + Math.sin(performance.now() * 0.001 + unit.car.pos.x) * 0.12;
          let diff = targetHeading - car.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const steer = Math.max(-1, Math.min(1, diff * 2.2));
          const throttle = dist > 6 ? 1 : 0.4;
          const hitBuilding = car.drive(dt, throttle, steer, colliders);
          if (hitBuilding && dist < 30) {
            // Stuck on a building: reverse out.
            car.drive(dt, -1, -steer, colliders);
          }
          // Ram: contact with the player's car damages it and shoves it.
          if (playerDriving && dist < 5.2) {
            onRam(unit, dist);
          }
          // A police car next to the player on foot tries to bust them.
          if (!playerDriving && dist < POLICE.BUST_RANGE) {
            bustTimer += dt;
            if (bustTimer >= POLICE.BUST_TIME) {
              bustTimer = 0;
              onBusted();
              return 'busted';
            }
          } else {
            bustTimer = Math.max(0, bustTimer - dt * 2);
          }
        } else {
          // Foot cop: run at the player, legs pumping.
          const cop = unit.cop;
          const speed = POLICE.COP_SPEED;
          const len = Math.max(0.001, dist);
          unit.x += (dx / len) * speed * dt;
          unit.z += (dz / len) * speed * dt;
          unit.heading = Math.atan2(dx, dz);
          unit.walkPhase += dt * speed * 2.2;
          cop.group.position.set(unit.x, 0, unit.z);
          cop.group.rotation.y = unit.heading;
          cop.legL.rotation.x = Math.sin(unit.walkPhase) * 0.6;
          cop.legR.rotation.x = -Math.sin(unit.walkPhase) * 0.6;
          if (!playerDriving && dist < POLICE.BUST_RANGE) {
            bustTimer += dt;
            if (bustTimer >= POLICE.BUST_TIME) {
              bustTimer = 0;
              onBusted();
              return 'busted';
            }
          } else {
            bustTimer = Math.max(0, bustTimer - dt * 2);
          }
        }
      }
      return null;
    },
    /** Draw the search radius the player must leave to cool down (debug aid, unused in play). */
    get bustProgress() {
      return Math.min(1, bustTimer / POLICE.BUST_TIME);
    },
  };
}
