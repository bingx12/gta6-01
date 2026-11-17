// Rae Calloway — the player character — and the third-person camera rig.
// On foot Rae walks and runs relative to the camera, jumps, and her limbs
// swing with her stride. The camera orbits on mouse drag on foot and trails
// behind the car while driving, always looking at Rae or the car.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { resolveCircleVsBuildings, clampToWorld } from './vehicles.js';

function buildRaeMesh() {
  const rae = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a077 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f6a6a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a55 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.66;
  rae.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 1.7;
  rae.add(hairCap);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.34), jacket);
  torso.position.y = 1.08;
  torso.castShadow = true;
  rae.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), jacket);
  armL.position.set(-0.4, 1.08, 0);
  rae.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), jacket);
  armR.position.set(0.4, 1.08, 0);
  rae.add(armR);
  // The pistol in her right hand.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.34), new THREE.MeshLambertMaterial({ color: 0x111214 }));
  gun.position.set(0.4, 0.78, 0.12);
  rae.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), jeans);
  legL.position.set(-0.15, 0.36, 0);
  rae.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), jeans);
  legR.position.set(0.15, 0.36, 0);
  rae.add(legR);
  return { group: rae, armL, armR, legL, legR };
}

/** Create Rae at (x, z), facing `heading`. */
export function createPlayer(scene, x, z, heading) {
  const built = buildRaeMesh();
  built.group.position.set(x, 0, z);
  built.group.rotation.y = heading;
  scene.add(built.group);
  return {
    mesh: built.group,
    armL: built.armL,
    armR: built.armR,
    legL: built.legL,
    legR: built.legR,
    x,
    z,
    y: 0,
    vy: 0,
    heading,
    walkPhase: 0,
    moving: false,
    onGround: true,
    /** Step on foot: input forward/strafe are -1..1, camYaw is the camera's yaw. */
    step(dt, input, camYaw, colliders) {
      const speed = input.run ? PLAYER.RUN_SPEED : PLAYER.WALK_SPEED;
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      const mx = fx * input.forward + rx * input.strafe;
      const mz = fz * input.forward + rz * input.strafe;
      const len = Math.hypot(mx, mz);
      this.moving = len > 0.01;
      if (this.moving) {
        const nx = mx / len;
        const nz = mz / len;
        this.x += nx * speed * dt;
        this.z += nz * speed * dt;
        const targetHeading = Math.atan2(nx, nz);
        let diff = targetHeading - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += diff * Math.min(1, PLAYER.TURN_SPEED * dt);
        this.walkPhase += dt * speed * 1.6;
      }
      // Jump and gravity.
      if (input.jump && this.onGround) {
        this.vy = 5.2;
        this.onGround = false;
      }
      this.vy -= 16 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
      resolveCircleVsBuildings(this, PLAYER.RADIUS, colliders);
      clampToWorld(this, 4);
      this.mesh.position.set(this.x, this.y, this.z);
      this.mesh.rotation.y = this.heading;
      const swing = this.moving ? Math.sin(this.walkPhase) * 0.6 : 0;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
      // Aiming pose while the mouse is held: right arm forward.
      if (input.aiming) {
        this.armR.rotation.x = -1.35;
      }
    },
  };
}

/** Third-person camera: orbit on foot, trail behind the car while driving. */
export function createCameraRig(camera) {
  let yaw = Math.PI;
  let pitch = 0.32;
  let distance = 8;
  return {
    get yaw() {
      return yaw;
    },
    setYaw(value) {
      yaw = value;
    },
    applyOrbit(dx, dy) {
      yaw -= dx * 0.005;
      pitch = Math.max(0.05, Math.min(1.1, pitch + dy * 0.004));
    },
    /**
     * Position the camera. `focus` is {x, y, z} to look at; `mode` is 'foot',
     * 'car' (yaw eases behind the car's heading) or 'fixed' (yaw/pitch given).
     */
    update(dt, focus, mode, carHeading) {
      if (mode === 'car') {
        // Trail behind the car: the camera sits opposite the car's heading,
        // so yaw eases toward the car's heading itself.
        let diff = carHeading - yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        yaw += diff * Math.min(1, dt * 2.2);
        pitch += (0.22 - pitch) * Math.min(1, dt * 2);
        distance += (10.5 - distance) * Math.min(1, dt * 2);
      } else {
        distance += (8 - distance) * Math.min(1, dt * 4);
      }
      const cx = focus.x - Math.sin(yaw) * Math.cos(pitch) * distance;
      const cz = focus.z - Math.cos(yaw) * Math.cos(pitch) * distance;
      const cy = focus.y + Math.sin(pitch) * distance + 1.2;
      camera.position.set(cx, Math.max(1.2, cy), cz);
      camera.lookAt(focus.x, focus.y + 1.4, focus.z);
    },
  };
}
