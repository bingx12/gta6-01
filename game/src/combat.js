// Combat: a mouse-aimed pistol with tracers and a muzzle flash, armed
// enemies with health bars who shoot back, and slow player health regen.
import * as THREE from 'three';
import { COMBAT } from './config.js';
import { makePedestrianMesh } from './traffic.js';

export function makeEnemyMesh() {
  const mesh = makePedestrianMesh(0x7a2020);
  const vest = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.5, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }),
  );
  vest.position.y = 1.05;
  mesh.add(vest);
  // A health bar that floats above the head and always faces the camera.
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x330000, transparent: true, opacity: 0.85, depthTest: false }),
  );
  barBg.position.y = 2.05;
  barBg.renderOrder = 10;
  const barFg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.95, depthTest: false }),
  );
  barFg.position.set(0, 2.05, 0.01);
  barFg.renderOrder = 11;
  mesh.add(barBg);
  mesh.add(barFg);
  mesh.userData.barFg = barFg;
  mesh.userData.barBg = barBg;
  return mesh;
}

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.enemies = [];
    this.tracers = [];
    this.fireTimer = 0;
    this.flash = null;
    this.flashTimer = 0;
    this.raycaster = new THREE.Raycaster();
  }

  spawnEnemy(x, z, health = COMBAT.enemyHealth) {
    const mesh = makeEnemyMesh();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const enemy = {
      mesh, health, maxHealth: health, fireTimer: 1 + Math.random() * 0.8,
      alive: true, speed: 3.4,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  aliveCount() {
    return this.enemies.filter((e) => e.alive).length;
  }

  addTracer(from, to, colour = 0xffe9a8) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.95 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  showMuzzleFlash(pos) {
    if (!this.flash) {
      this.flash = new THREE.PointLight(0xffc860, 30, 12, 1.6);
      this.scene.add(this.flash);
    }
    this.flash.position.copy(pos);
    this.flashTimer = 0.06;
  }

  // Fire from `origin` along `direction`; returns the enemy hit, if any.
  shoot(origin, direction, player, onHit) {
    if (this.fireTimer > 0) return null;
    this.fireTimer = COMBAT.fireInterval;
    this.audio.gunshot();
    this.showMuzzleFlash(origin);
    const end = origin.clone().addScaledVector(direction, COMBAT.pistolRange);
    this.raycaster.set(origin, direction);
    this.raycaster.far = COMBAT.pistolRange;
    const meshes = this.enemies.filter((e) => e.alive).map((e) => e.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    let hitEnemy = null;
    let hitPoint = end;
    if (hits.length > 0) {
      hitPoint = hits[0].point;
      let node = hits[0].object;
      while (node && !this.enemies.some((e) => e.mesh === node)) node = node.parent;
      hitEnemy = this.enemies.find((e) => e.mesh === node) || null;
      if (hitEnemy) {
        hitEnemy.health -= COMBAT.pistolDamage;
        if (hitEnemy.health <= 0) {
          hitEnemy.alive = false;
          this.scene.remove(hitEnemy.mesh);
          if (player) player.addCash(40);
          if (onHit) onHit(hitEnemy, true);
        } else if (onHit) {
          onHit(hitEnemy, false);
        }
      }
    }
    this.addTracer(origin, hitPoint);
    return hitEnemy;
  }

  update(dt, player, playerPos, police) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0 && this.flash) this.flash.intensity = 0;
    }
    for (const tracer of this.tracers) tracer.life -= dt;
    for (const tracer of this.tracers.filter((t) => t.life <= 0)) {
      this.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.mesh.userData.barFg.scale.x = Math.max(0, enemy.health / enemy.maxHealth);
      enemy.mesh.userData.barFg.position.x = -(1 - enemy.health / enemy.maxHealth) * 0.53;
      const toPlayer = new THREE.Vector3().subVectors(playerPos, enemy.mesh.position);
      const dist = toPlayer.length();
      const dir = Math.atan2(toPlayer.x, toPlayer.z);
      enemy.mesh.rotation.y = dir;
      if (dist > 8) {
        enemy.mesh.position.x += Math.sin(dir) * enemy.speed * dt;
        enemy.mesh.position.z += Math.cos(dir) * enemy.speed * dt;
      }
      enemy.fireTimer -= dt;
      if (dist < COMBAT.enemyRange && enemy.fireTimer <= 0) {
        enemy.fireTimer = COMBAT.enemyFireInterval + Math.random() * 0.5;
        this.audio.gunshot();
        const from = enemy.mesh.position.clone().setY(1.4);
        const to = playerPos.clone().setY(1.2);
        this.addTracer(from, to, 0xff8866);
        player.damage(COMBAT.enemyDamage, 'shot by a dock guard');
        if (police && police.stars === 0) police.addHeat(0.6);
      }
    }
  }
}
