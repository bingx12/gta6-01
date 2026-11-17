// Combat for VELDORA BAY: the player's pistol (hitscan from the camera, with
// a tracer and a muzzle flash), armed enemies with health bars who shoot
// back, and the damage numbers the HUD shows. Enemies are spawned by missions
// and cleared when the mission ends.

import * as THREE from 'three';
import { COMBAT } from './config.js';

function makeEnemyMesh(rng) {
  const enemy = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: [0xd8a077, 0x8a5a3a][rng.int(0, 1)] });
  const jacket = new THREE.MeshLambertMaterial({ color: [0x8a1f1f, 0x3a3a3a, 0x5a2a6a][rng.int(0, 2)] });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  enemy.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), jacket);
  torso.position.y = 1.05;
  torso.castShadow = true;
  enemy.add(torso);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), new THREE.MeshLambertMaterial({ color: 0x111214 }));
  gun.position.set(0.3, 1.15, 0.3);
  enemy.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legL.position.set(-0.14, 0.35, 0);
  enemy.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legR.position.set(0.14, 0.35, 0);
  enemy.add(legR);
  // Health bar: a green quad that shrinks, always facing the camera.
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85 }));
  barBg.position.y = 2.05;
  enemy.add(barBg);
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.08), new THREE.MeshBasicMaterial({ color: 0x33cc44 }));
  barFg.position.set(0, 2.05, 0.01);
  enemy.add(barFg);
  return { group: enemy, legL, legR, barFg, barBg };
}

/** Create the combat system. `onEnemyKilled` fires per kill; `onPlayerHit` per hit on the player. */
export function createCombat(scene, rng, colliders, onEnemyKilled, onPlayerHit) {
  const enemies = [];
  const raycaster = new THREE.Raycaster();
  let fireCooldown = 0;
  let muzzleTimer = 0;
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  scene.add(tracer);
  const muzzle = new THREE.PointLight(0xffd27a, 0, 12, 2);
  scene.add(muzzle);

  function spawnEnemy(x, z) {
    const built = makeEnemyMesh(rng);
    built.group.position.set(x, 0, z);
    scene.add(built.group);
    const enemy = {
      mesh: built.group,
      legL: built.legL,
      legR: built.legR,
      barFg: built.barFg,
      barBg: built.barBg,
      x,
      z,
      health: COMBAT.ENEMY_HEALTH,
      fireTimer: rng.range(0.5, 1.5),
      walkPhase: rng.range(0, Math.PI * 2),
      dead: false,
    };
    enemies.push(enemy);
    return enemy;
  }

  function removeEnemy(enemy) {
    const index = enemies.indexOf(enemy);
    if (index >= 0) enemies.splice(index, 1);
    scene.remove(enemy.mesh);
  }

  function clearEnemies() {
    for (const enemy of [...enemies]) removeEnemy(enemy);
  }

  return {
    enemies,
    spawnEnemy,
    removeEnemy,
    clearEnemies,
    get aliveCount() {
      return enemies.filter((e) => !e.dead).length;
    },
    /** Player fires from `camera` toward the crosshair. Returns { fired, enemy }. */
    playerShoot(camera, playerPos) {
      if (fireCooldown > 0) return { fired: false, enemy: null };
      fireCooldown = COMBAT.FIRE_INTERVAL;
      raycaster.setFromCamera({ x: 0, y: 0 }, camera);
      raycaster.far = COMBAT.PISTOL_RANGE;
      const targets = enemies.filter((e) => !e.dead).map((e) => e.mesh);
      const hits = raycaster.intersectObjects(targets, true);
      // Muzzle flash at the camera, tracer to the hit point or max range.
      const start = new THREE.Vector3();
      camera.getWorldPosition(start);
      const end = hits.length > 0 ? hits[0].point : raycaster.ray.at(COMBAT.PISTOL_RANGE, new THREE.Vector3());
      tracerGeo.setFromPoints([start, end]);
      tracer.visible = true;
      muzzle.position.copy(start).add(new THREE.Vector3(0, -0.2, 0));
      muzzle.intensity = 40;
      muzzleTimer = 0.06;
      if (hits.length === 0) return { fired: true, enemy: null };
      // Walk up to the enemy root group from the hit child.
      let node = hits[0].object;
      while (node.parent && node.parent !== scene) node = node.parent;
      const enemy = enemies.find((e) => e.mesh === node);
      if (!enemy) return { fired: true, enemy: null };
      enemy.health -= COMBAT.PISTOL_DAMAGE;
      if (enemy.health <= 0) {
        enemy.dead = true;
        removeEnemy(enemy);
        onEnemyKilled(enemy);
        return { fired: true, enemy };
      }
      return { fired: true, enemy };
    },
    /** Advance enemies: they close in and shoot at the player. */
    update(dt, playerPos, playerAlive) {
      fireCooldown = Math.max(0, fireCooldown - dt);
      if (muzzleTimer > 0) {
        muzzleTimer -= dt;
        if (muzzleTimer <= 0) {
          tracer.visible = false;
          muzzle.intensity = 0;
        }
      }
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        const dx = playerPos.x - enemy.x;
        const dz = playerPos.z - enemy.z;
        const dist = Math.hypot(dx, dz);
        const len = Math.max(0.001, dist);
        // Face the player and the camera-facing health bar.
        enemy.mesh.rotation.y = Math.atan2(dx, dz);
        enemy.barBg.lookAt(new THREE.Vector3(playerPos.x, 2.05, playerPos.z));
        enemy.barFg.lookAt(new THREE.Vector3(playerPos.x, 2.05, playerPos.z));
        enemy.barFg.scale.x = Math.max(0.001, enemy.health / COMBAT.ENEMY_HEALTH);
        enemy.barFg.position.x = -(1.06 - 1.06 * (enemy.health / COMBAT.ENEMY_HEALTH)) / 2;
        if (dist > 14 && playerAlive) {
          // Close the distance.
          enemy.x += (dx / len) * 5.2 * dt;
          enemy.z += (dz / len) * 5.2 * dt;
          enemy.walkPhase += dt * 10;
          enemy.legL.rotation.x = Math.sin(enemy.walkPhase) * 0.55;
          enemy.legR.rotation.x = -Math.sin(enemy.walkPhase) * 0.55;
        } else {
          enemy.legL.rotation.x = 0;
          enemy.legR.rotation.x = 0;
        }
        enemy.mesh.position.set(enemy.x, 0, enemy.z);
        // Shoot back when in range.
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && dist < COMBAT.ENEMY_RANGE && playerAlive) {
          enemy.fireTimer = COMBAT.ENEMY_FIRE_INTERVAL + rng.range(-0.2, 0.4);
          const hitChance = Math.max(0.25, 0.7 - dist / COMBAT.ENEMY_RANGE);
          if (rng.next() < hitChance) {
            onPlayerHit(COMBAT.ENEMY_DAMAGE, enemy);
          }
        }
      }
    },
  };
}
