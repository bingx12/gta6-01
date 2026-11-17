// Rae Calloway on foot: third-person movement, jumping, entering cars,
// health with slow regeneration, and the WASTED / BUSTED states.
import * as THREE from 'three';
import { PLAYER, PALETTE } from './config.js';

export function makePlayerMesh() {
  const player = new THREE.Group();
  player.name = 'rae-calloway';
  const jacket = new THREE.MeshStandardMaterial({ color: PALETTE.playerJacket, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), jacket);
  body.position.y = 1.0;
  body.castShadow = true;
  player.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 12),
    new THREE.MeshStandardMaterial({ color: PALETTE.playerSkin, roughness: 0.8 }),
  );
  head.position.y = 1.68;
  head.castShadow = true;
  player.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2.2),
    new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 1 }),
  );
  hair.position.y = 1.72;
  player.add(hair);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 1 });
  const legs = [];
  for (const x of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), legMat);
    leg.position.set(x, 0.28, 0);
    player.add(leg);
    legs.push(leg);
  }
  player.userData.legs = legs;
  // The pistol, visible in the right hand.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.38, 1.05, 0.25);
  player.add(gun);
  player.userData.gun = gun;
  return player;
}

export class Player {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.mesh = makePlayerMesh();
    this.mesh.position.set(0, 0, 0);
    scene.add(this.mesh);
    this.health = PLAYER.maxHealth;
    this.cash = 250;
    this.velY = 0;
    this.grounded = true;
    this.yaw = 0;
    this.pitch = -0.22;
    this.speedNow = 0;
    this.lastDamageAt = -99;
    this.dead = false;
    this.bustedFlag = false;
    this.walkPhase = 0;
  }

  get pos() {
    return this.mesh.position;
  }

  teleport(x, z) {
    this.mesh.position.set(x, 0, z);
    this.velY = 0;
  }

  addCash(amount) {
    this.cash += amount;
  }

  damage(amount, cause) {
    const now = this.game.time;
    if (this.dead) return;
    this.health -= amount;
    this.lastDamageAt = now;
    this.game.audio.noiseBurst(0.12, 0.3, 600);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onWasted(cause || 'taken down in Veldora Bay');
    }
  }

  busted() {
    if (this.dead || this.bustedFlag) return;
    this.bustedFlag = true;
    this.game.onBusted();
  }

  heal(dt) {
    if (this.dead) return;
    if (this.game.time - this.lastDamageAt > PLAYER.regenDelay && this.health < PLAYER.maxHealth) {
      this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.regenPerSecond * dt);
    }
  }

  update(dt, input, colliders, inCar) {
    if (this.dead || inCar) {
      this.speedNow = 0;
      return;
    }
    const look = input.consumeLook();
    this.yaw -= look.dx * 0.0032;
    this.pitch = Math.max(-0.9, Math.min(0.5, this.pitch - look.dy * 0.0028));
    const fwd = input.moveForward();
    const strafe = input.moveStrafe();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let mx = 0;
    let mz = 0;
    if (fwd !== 0 || strafe !== 0) {
      mx = (-sin * fwd + cos * strafe);
      mz = (-cos * fwd - sin * strafe);
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
    }
    const nx = this.pos.x + mx * speed * dt;
    const nz = this.pos.z + mz * speed * dt;
    const blocked = colliders.some((c) => nx > c.minX - 0.6 && nx < c.maxX + 0.6 && nz > c.minZ - 0.6 && nz < c.maxZ + 0.6);
    if (!blocked && (mx !== 0 || mz !== 0)) {
      this.pos.x = Math.max(-175, Math.min(205, nx));
      this.pos.z = Math.max(-175, Math.min(175, nz));
      this.speedNow = speed;
      this.walkPhase += dt * speed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.mesh.userData.legs[0].rotation.x = swing;
      this.mesh.userData.legs[1].rotation.x = -swing;
    } else {
      this.speedNow = 0;
      this.mesh.userData.legs[0].rotation.x = 0;
      this.mesh.userData.legs[1].rotation.x = 0;
    }
    if (input.wasPressed('Space') && this.grounded) {
      this.velY = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.velY -= PLAYER.gravity * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.velY = 0;
        this.grounded = true;
      }
    }
    this.mesh.rotation.y = this.yaw + Math.PI;
  }

  // Third-person orbit camera, behind and above Rae.
  orbitCamera(camera, dt) {
    const dist = 7.5;
    const height = 3.2 + this.pitch * 4;
    const cx = this.pos.x + Math.sin(this.yaw) * dist;
    const cz = this.pos.z + Math.cos(this.yaw) * dist;
    const target = new THREE.Vector3(cx, height, cz);
    camera.position.lerp(target, Math.min(1, dt * 7));
    camera.lookAt(this.pos.x, 1.5, this.pos.z);
  }

  aimDirection(camera) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return dir;
  }
}
