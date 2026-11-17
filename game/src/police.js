// The wanted system: heat from 0 to 5 stars, police cars and foot
// officers who chase, ram and bust the player, and heat that cools
// when the player lies low. Ram damage is throttled to one hit per
// 0.7 seconds so a chase never melts the player's health instantly.
import * as THREE from 'three';
import { WANTED } from './config.js';
import { Car } from './vehicles.js';
import { makePedestrianMesh } from './traffic.js';

export class Police {
  constructor(scene, rng, colliders, audio) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.audio = audio;
    this.stars = 0;
    this.cars = [];
    this.officers = [];
    this.ramTimer = 0;
    this.bustTimer = 0;
    this.spawnTimer = 0;
    this.heat = 0;
  }

  addHeat(amount) {
    this.heat = Math.min(WANTED.maxStars, this.heat + amount);
    // Ceiling, not floor: a fresh 3-star heat must still show 3 stars
    // after a fraction of a second of cooling.
    this.stars = Math.ceil(this.heat);
    if (this.stars > 0) this.audio.sirenOn();
  }

  clearHeat() {
    this.heat = 0;
    this.stars = 0;
    this.audio.sirenOff();
    this.removeAll();
  }

  wantedCount() {
    return Math.min(this.stars, 1 + Math.floor(this.stars / 2));
  }

  spawnPoliceCar(near) {
    const angle = this.rng() * Math.PI * 2;
    const x = near.x + Math.sin(angle) * 45;
    const z = near.z + Math.cos(angle) * 45;
    const car = new Car(this.scene, this.rng, x, z, Math.atan2(near.x - x, near.z - z), true);
    car.isPolice = true;
    this.cars.push(car);
    return car;
  }

  spawnOfficer(near) {
    const mesh = makePedestrianMesh(0x1e3fae);
    mesh.position.set(near.x + (this.rng() - 0.5) * 20, 0, near.z + (this.rng() - 0.5) * 20);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.12, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    cap.position.y = 1.82;
    mesh.add(cap);
    this.scene.add(mesh);
    const officer = { mesh, speed: 5.2, bustProgress: 0 };
    this.officers.push(officer);
    return officer;
  }

  removeAll() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    for (const o of this.officers) this.scene.remove(o.mesh);
    this.cars = [];
    this.officers = [];
    this.bustTimer = 0;
  }

  update(dt, player, playerCar) {
    this.ramTimer = Math.max(0, this.ramTimer - dt);
    // Heat cools when the player lies low.
    if (this.stars > 0) {
      const movingFast = playerCar ? Math.abs(playerCar.speed) > 6 : player.speedNow > 4;
      const coolRate = movingFast ? WANTED.coolPerSecond * 0.25 : WANTED.coolPerSecond;
      this.heat = Math.max(0, this.heat - coolRate * dt);
      const newStars = Math.ceil(this.heat);
      if (newStars !== this.stars) {
        this.stars = newStars;
        if (this.stars === 0) {
          this.audio.sirenOff();
          this.removeAll();
        }
      }
    }
    if (this.stars === 0) return;
    this.spawnTimer -= dt;
    const wantCars = this.wantedCount();
    if (this.cars.length < wantCars && this.spawnTimer <= 0) {
      this.spawnPoliceCar(player.pos);
      this.spawnTimer = 4;
    }
    if (this.stars >= 2 && this.officers.length < this.stars - 1 && this.spawnTimer <= 0) {
      this.spawnOfficer(player.pos);
      this.spawnTimer = 5;
    }
    const targetPos = playerCar ? playerCar.pos : player.pos;
    const targetSpeed = playerCar ? Math.abs(playerCar.speed) : player.speedNow;
    for (const car of this.cars) {
      if (!car.alive) continue;
      const toPlayer = new THREE.Vector3().subVectors(targetPos, car.pos);
      const dist = toPlayer.length();
      const desired = Math.atan2(toPlayer.x, toPlayer.z);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.4));
      const chaseSpeed = Math.min(40, 16 + this.stars * 4 + targetSpeed * 0.55);
      const throttle = dist > 4 ? 1 : 0.4;
      car.drive(dt, throttle, steer, this.colliders);
      // Ram: only when close and fast, and only once per 0.7 s.
      if (dist < 4.2 && Math.abs(car.speed) > 6 && this.ramTimer <= 0) {
        this.ramTimer = WANTED.ramCooldown;
        player.damage(14, 'rammed by a police cruiser');
        if (playerCar) playerCar.speed *= 0.4;
        this.audio.noiseBurst(0.2, 0.5, 900);
      }
      car.flashLights(performance.now() / 1000);
      if (dist > 260) {
        const angle = this.rng() * Math.PI * 2;
        car.pos.x = targetPos.x + Math.sin(angle) * 50;
        car.pos.z = targetPos.z + Math.cos(angle) * 50;
      }
    }
    // Foot officers close in and bust the player on foot.
    let nearest = Infinity;
    for (const officer of this.officers) {
      const toPlayer = new THREE.Vector3().subVectors(player.pos, officer.mesh.position);
      const dist = toPlayer.length();
      nearest = Math.min(nearest, dist);
      const dir = Math.atan2(toPlayer.x, toPlayer.z);
      officer.mesh.position.x += Math.sin(dir) * officer.speed * dt;
      officer.mesh.position.z += Math.cos(dir) * officer.speed * dt;
      officer.mesh.rotation.y = dir;
      const swing = Math.sin(performance.now() / 90) * 0.4;
      officer.mesh.userData.legs[0].rotation.x = swing;
      officer.mesh.userData.legs[1].rotation.x = -swing;
    }
    if (!playerCar && nearest < WANTED.bustDistance && this.stars > 0) {
      this.bustTimer += dt;
      if (this.bustTimer > WANTED.bustTime) {
        this.bustTimer = 0;
        player.busted();
      }
    } else {
      this.bustTimer = 0;
    }
  }
}
