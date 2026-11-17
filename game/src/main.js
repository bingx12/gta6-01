// Veldora Bay — the main file that wires everything together: renderer,
// game loop, car stealing, shooting, the clock, saving, and the
// screenshot staging mode (?shot=start|drive|chase|mission&seed=1).
import * as THREE from 'three';
import { CITY, SAVE_KEY, START_CASH, CLOCK_START_MINUTES, PLAYER } from './config.js';
import { makeRng } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, roadCoord } from './city.js';
import { Car, spawnParkedCars } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { Player } from './player.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot') || '';
const SEED = Number(params.get('seed') || '1') || 1;

class Game {
  constructor() {
    this.time = 0;
    this.clockMinutes = CLOCK_START_MINUTES;
    this.started = false;
    this.paused = false;
    this.over = false;
    this.playerCar = null;
    this.missionCars = [];
    this.frames = 0;
    this.heatCooldown = 0;
    this.audio = new AudioEngine();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(10, 6, 18);
    this.input = new Input(this.renderer.domElement);
    this.input.onPause = () => this.togglePause();
    this.input.onMute = () => this.toggleMute();
    this.input.onInteract = () => this.interact();
    this.city = buildCity(this.scene, SEED);
    this.rng = makeRng(SEED + 7);
    this.player = new Player(this.scene, this);
    this.player.cash = START_CASH;
    this.parkedCars = spawnParkedCars(this.scene, this.rng, this.city.colliders, 14);
    this.traffic = new Traffic(this.scene, this.rng, this.city.colliders);
    this.police = new Police(this.scene, this.rng, this.city.colliders, this.audio);
    this.combat = new Combat(this.scene, this.audio);
    this.missions = new MissionManager(this);
    this.hud = new HUD(this);
    this.hud.update(0, this.hudState());
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    if (SHOT) this.stageShot(SHOT);
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  spawnMissionCar(x, z, heading, colour = 0xc23b2e) {
    const car = new Car(this.scene, this.rng, x, z, heading, false, colour);
    this.missionCars.push(car);
    return car;
  }

  hudState() {
    return {
      stars: this.police.stars,
      cash: Math.floor(this.player.cash),
      clockMinutes: this.clockMinutes,
      health: this.player.health,
      speed: this.playerCar ? this.playerCar.speed : 0,
      inCar: !!this.playerCar,
      missionIndex: this.missions.index,
      playerX: this.player.pos.x,
      playerZ: this.player.pos.z,
      heading: this.playerCar ? this.playerCar.heading : this.player.yaw,
      marker: this.missions.active ? this.missions.active.target : null,
      traffic: this.traffic.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      police: this.police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      enemies: this.combat.enemies.filter((e) => e.alive).map((e) => ({ x: e.mesh.position.x, z: e.mesh.position.z })),
    };
  }

  startGame(continueSave) {
    this.audio.ensure();
    this.started = true;
    this.over = false;
    this.paused = false;
    this.player.dead = false;
    this.player.bustedFlag = false;
    this.hud.showMenu(false);
    this.hud.hideOverlay();
    this.hud.showPause(false);
    if (continueSave) {
      if (!this.loadGame()) {
        this.hud.say('No saved game found — starting fresh.');
      }
    } else {
      this.player.cash = START_CASH;
      this.player.health = PLAYER.maxHealth;
      this.missions.index = 0;
      this.missions.active = null;
    }
    if (!this.missions.active && !this.missions.done) {
      this.missions.start(this.missions.index);
    } else if (this.missions.done) {
      this.hud.setObjective('Free roam — explore Veldora Bay');
    }
    this.hud.say('Welcome back to Veldora Bay, Rae. Press N for your next job.');
  }

  quitToMenu() {
    this.started = false;
    this.paused = false;
    this.saveGame();
    this.hud.showPause(false);
    this.hud.showMenu(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  togglePause(force) {
    if (!this.started || this.over) return;
    this.paused = force !== undefined ? force : !this.paused;
    this.hud.showPause(this.paused);
    if (this.paused && document.pointerLockElement) document.exitPointerLock();
  }

  toggleMute() {
    this.audio.ensure();
    this.audio.setMuted(!this.audio.muted);
    this.hud.say(this.audio.muted ? 'Sound muted. Press M to unmute.' : 'Sound on.');
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: Math.floor(this.player.cash),
        missionIndex: this.missions.index,
        health: this.player.health,
        x: this.player.pos.x,
        z: this.player.pos.z,
        clockMinutes: this.clockMinutes,
      }));
    } catch {
      // Storage unavailable (private mode); the game still plays.
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.player.cash = s.cash ?? START_CASH;
      this.missions.index = s.missionIndex ?? 0;
      this.player.health = s.health ?? PLAYER.maxHealth;
      this.player.teleport(s.x ?? 0, s.z ?? 0);
      this.clockMinutes = s.clockMinutes ?? CLOCK_START_MINUTES;
      return true;
    } catch {
      return false;
    }
  }

  interact() {
    if (!this.started || this.paused || this.over) return;
    if (this.playerCar) {
      this.exitCar();
      return;
    }
    let best = null;
    let bestDist = 3.6;
    for (const car of [...this.parkedCars, ...this.missionCars, ...this.traffic.cars]) {
      if (!car.alive) continue;
      const d = car.pos.distanceTo(this.player.pos);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    if (!best) return;
    this.playerCar = best;
    this.player.mesh.visible = false;
    if (!best.stolen) {
      best.stolen = true;
      this.police.addHeat(1);
      this.hud.say('You stole the car! The cops are coming — lose them.');
      this.audio.pickup();
    }
    this.traffic.scare(best.pos, 10);
  }

  exitCar() {
    if (!this.playerCar) return;
    const car = this.playerCar;
    this.playerCar = null;
    this.player.mesh.visible = true;
    this.player.teleport(car.pos.x + Math.cos(car.heading) * 2.5, car.pos.z - Math.sin(car.heading) * 2.5);
    this.player.yaw = car.heading;
  }

  onWasted(cause) {
    this.over = true;
    this.playerCar = null;
    this.player.mesh.visible = true;
    this.police.clearHeat();
    this.player.cash = Math.max(0, this.player.cash - 150);
    this.hud.showOverlay('WASTED', `${cause}. You lost $150 at the hospital.`);
    if (document.pointerLockElement) document.exitPointerLock();
    this.saveGame();
  }

  onBusted() {
    this.over = true;
    this.playerCar = null;
    this.player.mesh.visible = true;
    this.police.clearHeat();
    this.player.cash = Math.max(0, this.player.cash - 200);
    this.hud.showOverlay('BUSTED', 'The Veldora Bay police took you in. You lost $200 in fines.');
    if (document.pointerLockElement) document.exitPointerLock();
    this.saveGame();
  }

  respawn() {
    this.player.health = PLAYER.maxHealth;
    this.player.dead = false;
    this.player.bustedFlag = false;
    this.over = false;
    this.player.teleport(0, 0);
    this.hud.hideOverlay();
    this.hud.say('Back on your feet, Rae. Marla is still waiting.');
  }

  checkCarCollisions(dt) {
    if (!this.playerCar) return;
    const car = this.playerCar;
    this.heatCooldown = Math.max(0, this.heatCooldown - dt);
    for (const other of this.traffic.cars) {
      if (other === car || !other.alive) continue;
      const d = other.pos.distanceTo(car.pos);
      if (d < 3.4 && Math.abs(car.speed) > 8) {
        other.speed = 2;
        other.pos.x += Math.sin(other.heading) * 2;
        car.speed *= 0.55;
        this.audio.noiseBurst(0.18, 0.45, 700);
        if (this.heatCooldown <= 0) {
          this.heatCooldown = 1.5;
          this.police.addHeat(1);
          this.hud.say('Hit and run! A witness called the police.');
        }
      }
    }
    for (const ped of this.traffic.peds) {
      const d = ped.mesh.position.distanceTo(car.pos);
      if (d < 2.2 && Math.abs(car.speed) > 5) {
        this.traffic.scare(car.pos, 20);
        if (this.heatCooldown <= 0) {
          this.heatCooldown = 1.5;
          this.police.addHeat(1);
          this.hud.say('You hit a pedestrian! The police are on their way.');
        }
      }
    }
  }

  stageShot(name) {
    this.started = true;
    this.hud.showMenu(false);
    this.audio.ensure?.();
    if (name === 'start') {
      this.hud.showMenu(true);
      this.player.teleport(6, 10);
      this.player.yaw = Math.PI * 0.85;
      return;
    }
    if (name === 'drive' || name === 'chase') {
      const car = this.spawnMissionCar(roadCoord(2), -60, 0, 0xc23b2e);
      this.playerCar = car;
      this.player.mesh.visible = false;
      this.player.teleport(car.pos.x, car.pos.z);
      if (name === 'chase') {
        this.missions.index = 1;
        this.police.addHeat(3);
        // Pursuit cars are staged ahead in the street, coming head-on at
        // the player — behind the chase camera they would be invisible.
        for (const [ahead, side] of [[30, -4], [40, 4]]) {
          const cop = this.police.spawnPoliceCar(this.player.pos);
          cop.pos.x = car.pos.x + Math.sin(car.heading) * ahead + side;
          cop.pos.z = car.pos.z + Math.cos(car.heading) * ahead;
          cop.heading = car.heading + Math.PI;
        }
        this.hud.setObjective('Outrun the police and reach the marina');
        this.hud.say('MARLA VOSS: "The cops already know. Lose them — get to the marina."');
      } else {
        this.hud.setObjective('Drive to the Coral Plaza marker');
        this.missions.active = { id: 1, name: 'First Gear', target: new THREE.Vector3(58, 0, 58) };
        this.missions.marker = this.missions.makeMarker(this.missions.active.target);
      }
      // Snap the chase camera behind the car at once; at ~1 fps in a
      // headless browser a lerped camera would still be catching up.
      car.chaseCamera(this.camera, 1);
      this.autoDrive = true;
      return;
    }
    if (name === 'mission') {
      this.missions.index = 3;
      this.missions.start(3);
      // Face the docks: the orbit camera sits north of Rae and looks south
      // over the pier, where the guards are already standing.
      this.player.yaw = 0;
      this.player.orbitCamera(this.camera, 1);
      return;
    }
    this.player.teleport(6, 10);
  }

  frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.started && !this.paused && !this.over) {
      this.clockMinutes += dt * 0.6;
      this.update(dt);
    } else if (SHOT === 'start') {
      // The title screen slowly orbits the city.
      const t = this.time * 0.05;
      this.camera.position.set(Math.sin(t) * 40, 16, Math.cos(t) * 40);
      this.camera.lookAt(0, 4, 0);
    }
    this.hud.update(dt, this.hudState());
    this.renderer.render(this.scene, this.camera);
    this.frames += 1;
    if (SHOT && this.frames >= 12) window.__shotReady = true;
    this.input.endFrame();
  }

  update(dt) {
    const input = this.input;
    if (input.wasPressed('KeyN') && !this.missions.active && !this.missions.done) {
      this.missions.start(this.missions.index);
    }
    if (input.wasPressed('KeyC')) this.startGame(true);
    if (this.playerCar) {
      const car = this.playerCar;
      const throttle = this.autoDrive ? 1 : input.moveForward();
      const steer = this.autoDrive ? 0 : -input.moveStrafe();
      car.drive(dt, throttle, steer, this.city.colliders);
      car.chaseCamera(this.camera, dt);
      this.audio.setEngine(Math.abs(car.speed) / 42, true);
      this.checkCarCollisions(dt);
      if (input.wasPressed('Space')) car.drive(dt, -1, 0, this.city.colliders);
    } else {
      this.player.update(dt, input, this.city.colliders, false);
      this.player.orbitCamera(this.camera, dt);
      this.audio.setEngine(0, false);
      if (input.mouseDown && !this.over) {
        const origin = this.player.pos.clone().setY(1.45);
        const dir = this.player.aimDirection(this.camera);
        this.combat.shoot(origin, dir, this.player, (enemy, killed) => {
          if (killed) {
            this.police.addHeat(0.5);
            this.traffic.scare(enemy.mesh.position, 25);
            this.hud.say('Guard down. +$40');
          }
        });
      }
    }
    this.player.heal(dt);
    this.traffic.update(dt, this.player.pos, this.playerCar ? this.playerCar.pos : null);
    this.police.update(dt, this.player, this.playerCar);
    this.combat.update(dt, this.player, this.player.pos, this.police);
    this.missions.update(dt);
    if (this.playerCar) this.player.pos.copy(this.playerCar.pos);
  }
}

new Game();
