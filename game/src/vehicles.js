// Cars for VELDORA BAY: a box-built sedan with wheels that steer, arcade
// driving physics (accelerate, brake, reverse, steering that tightens with
// speed), and circle-vs-building collision. The same class drives the
// player's car, the parked cars and the police cars.

import * as THREE from 'three';
import { CAR, WORLD } from './config.js';

const CAR_COLORS = [0xc23b2e, 0x2e6ab0, 0xd8c86a, 0x3a3f45, 0xe8e4da, 0x7a3ab0, 0x2e8a6a, 0xb06a2e];
const WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);

/** Build the visible mesh of a car in the given body colour. */
export function buildCarMesh(color) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2530 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.WIDTH, 0.75, CAR.LENGTH), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR.WIDTH - 0.3, 0.6, CAR.LENGTH * 0.45), glassMat);
  cabin.position.set(0, 1.3, -0.25);
  cabin.castShadow = true;
  car.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    // Pivot group: rotation.y steers (front wheels), rotation.x spins the wheel.
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const wheel = new THREE.Mesh(WHEEL_GEO, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    car.add(pivot);
    wheels.push(pivot);
  }
  // Headlights and taillights so cars read at sunset.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), headMat);
    head.position.set(x, 0.7, CAR.LENGTH / 2 + 0.02);
    car.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const x of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), tailMat);
    tail.position.set(x, 0.7, -CAR.LENGTH / 2 - 0.02);
    car.add(tail);
  }
  return { group: car, wheels };
}

/** Push a circle (x, z, radius) out of every AABB it overlaps; returns true on hit. */
export function resolveCircleVsBuildings(pos, radius, colliders) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        pos.x += radius;
      }
    }
  }
  return hit;
}

export function clampToWorld(pos, margin) {
  const half = WORLD.WORLD_HALF - margin;
  pos.x = Math.max(-half, Math.min(half, pos.x));
  pos.z = Math.max(-half, Math.min(half, pos.z));
}

/** A drivable car. `ai` cars are steered by their own driver callback. */
export class Car {
  constructor(scene, x, z, heading, color, opts = {}) {
    this.scene = scene;
    const built = buildCarMesh(color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.isPolice = !!opts.police;
    this.isPlayer = false;
    this.ai = !!opts.ai;
    this.health = 100;
    this.crashed = false;
    if (this.isPolice) {
      const barMat = new THREE.MeshBasicMaterial({ color: 0x2a4ad8 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), barMat);
      bar.position.set(0, 1.68, -0.25);
      this.mesh.add(bar);
      const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xd81a1a }));
      barRed.position.set(-0.3, 1.68, -0.25);
      this.mesh.add(barRed);
      this.lightBar = bar;
      this.lightBarRed = barRed;
      this.lightPhase = 0;
    }
  }

  /** Arcade drive step: throttle -1..1, steerInput -1..1, dt seconds. */
  drive(dt, throttle, steerInput, colliders) {
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    if (throttle > 0) this.speed += CAR.ACCEL * throttle * dt;
    else if (throttle < 0) {
      this.speed += (this.speed > 0.5 ? -CAR.BRAKE : CAR.REVERSE_ACCEL * throttle) * dt;
    }
    // Drag and rolling resistance.
    this.speed -= this.speed * CAR.DRAG * dt;
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    this.speed = Math.max(-CAR.MAX_REVERSE, Math.min(CAR.MAX_SPEED, this.speed));
    // Steering tightens as speed falls; no steering while stopped.
    const steerTarget = steerInput * CAR.STEER_MAX * Math.min(1, Math.abs(this.speed) / 8 + 0.25);
    this.steer += (steerTarget - this.steer) * Math.min(1, CAR.STEER_SPEED * dt);
    this.heading += (this.steer * this.speed * dt) / 2.6;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    // Collisions: slide along buildings, lose speed on a hard hit.
    const hit = resolveCircleVsBuildings(this.pos, CAR.LENGTH / 2 - 0.4, colliders);
    if (hit) {
      const lost = Math.abs(this.speed);
      if (lost > 6) this.health -= (lost - 6) * 0.8;
      this.speed *= 0.35;
      // If we barely moved, we are wedged: step back to the previous spot.
      const moved = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
      if (moved < Math.abs(this.speed) * dt * 0.2 + 0.001 && lost > 8) {
        this.pos.x = prevX;
        this.pos.z = prevZ;
        this.speed = 0;
      }
    }
    clampToWorld(this.pos, 6);
    this.syncMesh(dt);
    return hit;
  }

  syncMesh(dt) {
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.36;
    for (const wheel of this.wheels) wheel.rotation.x += spin;
    if (this.wheels.length >= 2) {
      this.wheels[0].rotation.y = this.steer * 0.7;
      this.wheels[1].rotation.y = this.steer * 0.7;
    }
    if (this.isPolice) {
      this.lightPhase += dt * 6;
      const on = Math.sin(this.lightPhase) > 0;
      this.lightBar.visible = on;
      this.lightBarRed.visible = !on;
    }
  }

  remove() {
    this.scene.remove(this.mesh);
  }
}
