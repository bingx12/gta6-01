// Traffic and pedestrians: cars cruise the grid and turn at intersections,
// pedestrians stroll the sidewalks and run from danger.
import * as THREE from 'three';
import { Car } from './vehicles.js';
import { roadCoord, isOnRoad } from './city.js';
import { range, pick } from './random.js';

const PED_COLOURS = [0xd84a4a, 0x4a8ad8, 0x4ad87a, 0xd8c84a, 0x9a4ad8, 0xe8e8e8, 0x333333];

export function makePedestrianMesh(colour) {
  const ped = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.95, 0.32),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 }),
  );
  body.position.y = 0.95;
  body.castShadow = true;
  ped.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.8 }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  ped.add(head);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 1 });
  const legs = [];
  for (const x of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), legMat);
    leg.position.set(x, 0.25, 0);
    ped.add(leg);
    legs.push(leg);
  }
  ped.userData.legs = legs;
  return ped;
}

export class Traffic {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.cars = [];
    this.peds = [];
    for (let i = 0; i < 10; i += 1) this.spawnTrafficCar(true);
    for (let i = 0; i < 16; i += 1) this.spawnPed(true);
  }

  randomRoadPoint() {
    const lane = Math.floor(this.rng() * 5);
    const along = range(this.rng, -150, 150);
    const vertical = this.rng() < 0.5;
    const road = roadCoord(lane);
    return {
      x: vertical ? road : along,
      z: vertical ? along : road,
      heading: vertical ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
    };
  }

  spawnTrafficCar(anywhere = false) {
    const p = this.randomRoadPoint();
    const car = new Car(this.scene, this.rng, p.x, p.z, p.heading, false);
    car.trafficSpeed = range(this.rng, 8, 14);
    car.isTraffic = true;
    this.cars.push(car);
    return car;
  }

  spawnPed(anywhere = false) {
    const mesh = makePedestrianMesh(pick(this.rng, PED_COLOURS));
    const x = range(this.rng, -150, 150);
    const z = range(this.rng, -150, 150);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = this.rng() * Math.PI * 2;
    this.scene.add(mesh);
    const ped = {
      mesh, speed: range(this.rng, 1.2, 2.4), dir: this.rng() * Math.PI * 2,
      walkPhase: this.rng() * 6, fleeing: false, fleeTimer: 0,
    };
    this.peds.push(ped);
    return ped;
  }

  // Danger makes nearby pedestrians run away from `point`.
  scare(point, radius = 18) {
    for (const ped of this.peds) {
      const d = ped.mesh.position.distanceTo(point);
      if (d < radius) {
        ped.fleeing = true;
        ped.fleeTimer = 3;
        const away = Math.atan2(ped.mesh.position.x - point.x, ped.mesh.position.z - point.z);
        ped.dir = away;
      }
    }
  }

  update(dt, playerPos, dangerPoint) {
    for (const car of this.cars) {
      if (!car.alive) continue;
      // Cruise forward; at an intersection, sometimes turn left or right.
      const onIntersection = Math.abs(car.pos.x - Math.round(car.pos.x / 58) * 58) < 2
        || Math.abs(car.pos.z - Math.round(car.pos.z / 58) * 58) < 2;
      if (onIntersection && this.rng() < dt * 0.25) {
        car.heading += (this.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      const targetSpeed = car.trafficSpeed;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
      if (!car.hitsCollider(nx, nz, this.colliders) && Math.abs(nx) < 175 && Math.abs(nz) < 175) {
        car.pos.x = nx;
        car.pos.z = nz;
      } else {
        car.heading += Math.PI / 2;
      }
      car.mesh.rotation.y = car.heading;
      // Respawns far away keep the streets busy near the player.
      if (playerPos && car.pos.distanceTo(playerPos) > 220) {
        const p = this.randomRoadPoint();
        car.pos.x = p.x;
        car.pos.z = p.z;
        car.heading = p.heading;
      }
    }
    for (const ped of this.peds) {
      if (ped.fleeTimer > 0) {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) ped.fleeing = false;
      }
      const speed = ped.fleeing ? ped.speed * 3.2 : ped.speed;
      if (this.rng() < dt * 0.08 && !ped.fleeing) ped.dir += (this.rng() - 0.5) * 1.4;
      const nx = ped.mesh.position.x + Math.sin(ped.dir) * speed * dt;
      const nz = ped.mesh.position.z + Math.cos(ped.dir) * speed * dt;
      if (Math.abs(nx) < 170 && Math.abs(nz) < 170 && isOnRoad(nx, nz) === false) {
        ped.mesh.position.x = nx;
        ped.mesh.position.z = nz;
      } else {
        ped.dir += Math.PI / 2;
      }
      ped.mesh.rotation.y = ped.dir;
      ped.walkPhase += dt * speed * 4;
      const swing = Math.sin(ped.walkPhase) * 0.35;
      ped.mesh.userData.legs[0].rotation.x = swing;
      ped.mesh.userData.legs[1].rotation.x = -swing;
      if (playerPos && ped.mesh.position.distanceTo(playerPos) > 240) {
        ped.mesh.position.x = playerPos.x + range(this.rng, -60, 60);
        ped.mesh.position.z = playerPos.z + range(this.rng, -60, 60);
      }
    }
  }
}
