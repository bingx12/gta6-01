// Vehicles: procedural car meshes and arcade driving physics with
// steering, collisions against building colliders, and a chase camera
// that sits behind the car on the car's own heading.
import * as THREE from 'three';
import { CAR, PALETTE } from './config.js';
import { range } from './random.js';

const CAR_COLOURS = [0xc23b2e, 0x2e6fb0, 0xe8c832, 0x3a9e5f, 0x8a4ab0, 0xd8d8d8, 0x222226, 0xe07a2a];

export function makeCarMesh(colour, isPolice = false) {
  const car = new THREE.Group();
  car.name = isPolice ? 'police-car' : 'car';
  const paint = new THREE.MeshStandardMaterial({
    color: isPolice ? PALETTE.policeWhite : colour, roughness: 0.35, metalness: 0.55,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.7 }),
  );
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  car.add(cabin);
  if (isPolice) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.22, 4.42),
      new THREE.MeshStandardMaterial({ color: PALETTE.policeBlue, roughness: 0.4 }),
    );
    stripe.position.y = 0.72;
    car.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.55, -0.25);
    car.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.36), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.28, 1.66, -0.25);
    car.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.36), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.28, 1.66, -0.25);
    car.add(blue);
    car.userData.lightRed = red;
    car.userData.lightBlue = blue;
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    wheel.castShadow = true;
    car.add(wheel);
    wheels.push(wheel);
  }
  car.userData.wheels = wheels;
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), headMat);
    lamp.position.set(x, 0.66, 2.22);
    car.add(lamp);
  }
  return car;
}

export class Car {
  constructor(scene, rng, x, z, heading, isPolice = false, colour = null) {
    this.isPolice = isPolice;
    this.colour = colour ?? CAR_COLOURS[Math.floor(rng() * CAR_COLOURS.length)];
    this.mesh = makeCarMesh(this.colour, isPolice);
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.mesh.rotation.y = heading;
    this.speed = 0;
    this.steerAngle = 0;
    this.alive = true;
    this.health = 100;
    this.stolen = false;
    scene.add(this.mesh);
  }

  get pos() {
    return this.mesh.position;
  }

  // Arcade drive step. `throttle` -1..1, `steer` -1..1.
  drive(dt, throttle, steer, colliders) {
    if (!this.alive) return;
    const targetSteer = steer * 0.5 * (this.speed >= 0 ? 1 : -1);
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 8);
    const accel = throttle > 0 ? CAR.accel * throttle
      : throttle < 0 ? (this.speed > 0.5 ? -CAR.brake : CAR.reverseAccel * throttle)
      : 0;
    this.speed += accel * dt;
    this.speed -= this.speed * CAR.drag * dt;
    if (throttle === 0 && Math.abs(this.speed) < 0.4) this.speed = 0;
    this.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, this.speed));
    this.heading += (this.speed / 2.6) * Math.tan(this.steerAngle) * dt * (this.speed >= 0 ? 1 : -1);
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    if (!this.hitsCollider(nx, nz, colliders)) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else {
      this.speed *= -0.25;
    }
    this.pos.x = Math.max(-175, Math.min(205, this.pos.x));
    this.pos.z = Math.max(-175, Math.min(175, this.pos.z));
    this.mesh.rotation.y = this.heading;
    for (const wheel of this.mesh.userData.wheels) {
      wheel.rotation.x += this.speed * dt * 2.2;
    }
  }

  hitsCollider(x, z, colliders) {
    for (const c of colliders) {
      if (x > c.minX - 1.1 && x < c.maxX + 1.1 && z > c.minZ - 1.1 && z < c.maxZ + 1.1) return true;
    }
    return false;
  }

  // Chase camera: directly behind the car on its own heading.
  chaseCamera(camera, dt, distance = 9.5, height = 3.6) {
    const backX = this.pos.x - Math.sin(this.heading) * distance;
    const backZ = this.pos.z - Math.cos(this.heading) * distance;
    const target = new THREE.Vector3(backX, height, backZ);
    camera.position.lerp(target, Math.min(1, dt * 5));
    camera.lookAt(this.pos.x + Math.sin(this.heading) * 6, 1.4, this.pos.z + Math.cos(this.heading) * 6);
  }

  flashLights(time) {
    if (!this.isPolice) return;
    const on = Math.floor(time * 6) % 2 === 0;
    this.mesh.userData.lightRed.material.color.setHex(on ? 0xff2222 : 0x551111);
    this.mesh.userData.lightBlue.material.color.setHex(on ? 0x111155 : 0x2244ff);
  }
}

export function spawnParkedCars(scene, rng, colliders, count = 14) {
  const cars = [];
  const spots = [];
  for (let i = 0; i < count; i += 1) {
    const along = range(rng, -150, 150);
    const lane = Math.floor(range(rng, 0, 5));
    const vertical = rng() < 0.5;
    const road = -116 + lane * 58;
    const x = vertical ? road + 4.4 : along;
    const z = vertical ? along : road + 4.4;
    const heading = vertical ? 0 : Math.PI / 2;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 8)) continue;
    spots.push({ x, z });
    cars.push(new Car(scene, rng, x, z, heading, false));
  }
  return cars;
}
