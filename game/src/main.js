// VELDORA BAY — boot and the one game loop. The city, the traffic, the
// police, the combat and the missions are separate systems; this file owns the
// player state (health, cash, the car they are in), the screens (menu, play,
// paused, wasted, busted), the save, and the frame that steps them all.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission
// (with &seed=N) stages that scene instead of running the loop, steps the
// world forward a fixed number of frames, and sets window.__shotReady.

import * as THREE from 'three';
import { WORLD, PLAYER, CAR, POLICE, CLOCK, SAVE_KEY } from './config.js';
import { createRandom } from './random.js';
import { ACTION_ENTER, ACTION_JUMP, ACTION_MISSION, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { Car, resolveCircleVsBuildings } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { buildMissions, createMissionController } from './missions.js';
import { createHud } from './hud.js';
import { createPlayer, createCameraRig } from './player.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 40, 120);

const city = buildCity(scene, rng);
const colliders = city.colliders;
const landmarks = city.landmarks;
const input = createInput(canvas);
const audio = createAudio();
const cameraRig = createCameraRig(camera);

// --- World state -------------------------------------------------------------
const state = {
  screen: 'menu',
  health: PLAYER.HEALTH_MAX,
  cash: 250,
  hour: CLOCK.START_HOUR,
  minute: CLOCK.START_MINUTE,
  clockSeconds: 0,
  driving: false,
  currentCar: null,
  lastDamageAt: -999,
  lastRamAt: -999,
  elapsed: 0,
};

const player = createPlayer(scene, 0, 20, Math.PI);
const parkedCars = [];
const van = { car: null };

// Parked cars along the road edges, ready to steal.
function spawnParkedCars() {
  const spots = [
    { x: 7.5, z: -60, h: Math.PI / 2 }, { x: -7.5, z: 40, h: -Math.PI / 2 },
    { x: 77.5, z: -120, h: Math.PI / 2 }, { x: 62.5, z: 90, h: -Math.PI / 2 },
    { x: -62.5, z: -30, h: Math.PI / 2 }, { x: -132.5, z: 150, h: -Math.PI / 2 },
    { x: 147.5, z: 30, h: Math.PI / 2 }, { x: 217.5, z: -90, h: -Math.PI / 2 },
    { x: -212.5, z: 60, h: Math.PI / 2 }, { x: 7.5, z: 200, h: Math.PI / 2 },
  ];
  for (const spot of spots) {
    const car = new Car(scene, spot.x, spot.z, spot.h, undefined, {});
    parkedCars.push(car);
  }
}
spawnParkedCars();

const traffic = createTraffic(scene, rng, colliders, city.roads);

const police = createPolice(scene, rng, colliders, () => bustPlayer());
const combat = createCombat(
  scene,
  rng,
  colliders,
  (enemy) => {
    missions.registerKill();
    state.cash += 25;
    hud.showToast('+$25 — dropped a guard');
  },
  (damage) => damagePlayer(damage),
);

const missionApi = {
  setWanted(n) {
    police.setWanted(n);
  },
  clearWanted() {
    police.clearWanted();
  },
  toast(msg) {
    hud.showToast(msg, 5);
  },
  spawnDockGuards() {
    const spots = [
      { x: -190, z: 210 }, { x: -160, z: 215 }, { x: -185, z: 235 }, { x: -165, z: 245 },
    ];
    for (const s of spots) combat.spawnEnemy(s.x, s.z);
  },
  spawnVan() {
    if (van.car) return;
    const v = new Car(scene, landmarks.warehouse.x - 20, landmarks.warehouse.z + 18, Math.PI / 2, 0x1c1c22, {});
    v.isVan = true;
    van.car = v;
    parkedCars.push(v);
  },
};
const missionData = buildMissions(landmarks, missionApi);
const missions = createMissionController(missionData, {
  onCash(amount) {
    state.cash += amount;
    audio.cash();
    hud.showToast(`Mission complete — +$${amount}`, 5);
  },
  onDialogue(text) {
    hud.showDialogue(text, 8);
  },
  onMissionStart(mission) {
    audio.missionStart();
    hud.showToast(`Mission: ${mission.title}`, 5);
  },
  onMissionComplete() {
    saveGame();
  },
  onMissionFailed(mission, reason) {
    audio.fail();
    hud.showToast(`${mission.title} failed — ${reason}`, 5);
  },
  onObjective(text) {
    hud.showToast(text, 4);
  },
  onPickup() {
    audio.pickup();
  },
});

// Mission marker beacon: a glowing pillar the player can see across the city.
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0.35, depthWrite: false });
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beaconMat);
beacon.position.y = 30;
beacon.visible = false;
scene.add(beacon);
const beaconRing = new THREE.Mesh(
  new THREE.RingGeometry(4, 5.5, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
);
beaconRing.rotation.x = -Math.PI / 2;
beaconRing.position.y = 0.1;
beaconRing.visible = false;
scene.add(beaconRing);

const hud = createHud({
  audioResume() {
    audio.resume();
    audio.startMusic();
  },
  onStart() {
    startPlaying();
  },
  onContinue() {
    loadGame();
    startPlaying();
  },
  onResume() {
    state.screen = 'playing';
    hud.hidePause();
  },
  onSave() {
    saveGame();
    hud.showToast('Saved — progress kept in this browser', 3);
  },
  onRestart() {
    resetWorld();
    startPlaying();
  },
  onRespawn() {
    hud.hideEnd();
    state.screen = 'playing';
  },
  onMission() {
    if (state.screen === 'playing') missions.startNext();
  },
  onMute() {
    audio.setMuted(!audio.muted);
    hud.setMuted(audio.muted);
  },
});

// --- Save / load -------------------------------------------------------------
function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      health: state.health,
      x: player.x,
      z: player.z,
      hour: state.hour,
      minute: state.minute,
      completed: [...missions.completed],
    }));
  } catch {
    // Storage off: the save lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadGame() {
  const save = readSave();
  if (!save) return;
  state.cash = save.cash ?? 250;
  state.health = save.health ?? PLAYER.HEALTH_MAX;
  player.x = save.x ?? 0;
  player.z = save.z ?? 20;
  state.hour = save.hour ?? CLOCK.START_HOUR;
  state.minute = save.minute ?? CLOCK.START_MINUTE;
  if (Array.isArray(save.completed)) {
    for (const id of save.completed) missions.completed.add(id);
  }
  player.mesh.position.set(player.x, 0, player.z);
}

function hasSave() {
  return readSave() !== null;
}

// --- Player harm ---------------------------------------------------------------
function damagePlayer(amount) {
  if (state.screen !== 'playing') return;
  state.health -= amount;
  state.lastDamageAt = state.elapsed;
  if (state.health <= 0) {
    state.health = 0;
    wastePlayer();
  }
}

function wastePlayer() {
  state.cash = Math.max(0, state.cash - PLAYER.DEATH_PENALTY);
  missions.abandon('wasted');
  combat.clearEnemies();
  police.clearWanted();
  exitCar();
  player.x = landmarks.hospital.x;
  player.z = landmarks.hospital.z + 18;
  player.y = 0;
  player.vy = 0;
  player.mesh.position.set(player.x, 0, player.z);
  state.health = PLAYER.HEALTH_MAX;
  state.screen = 'wasted';
  hud.showEnd('WASTED', `Rae woke up at Veldora General. -$${PLAYER.DEATH_PENALTY}. The city is still waiting.`);
  audio.fail();
}

function bustPlayer() {
  state.cash = Math.max(0, state.cash - PLAYER.BUST_PENALTY);
  missions.abandon('busted');
  combat.clearEnemies();
  police.clearWanted();
  exitCar();
  player.x = landmarks.policeStation.x;
  player.z = landmarks.policeStation.z + 16;
  player.y = 0;
  player.vy = 0;
  player.mesh.position.set(player.x, 0, player.z);
  state.health = PLAYER.HEALTH_MAX;
  state.screen = 'busted';
  hud.showEnd('BUSTED', `The VBPD let Rae go with a warning and a lighter wallet. -$${PLAYER.BUST_PENALTY}.`);
  audio.fail();
}

// --- Cars ----------------------------------------------------------------------
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of parkedCars) {
    const d = Math.hypot(car.pos.x - player.x, car.pos.z - player.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(car) {
  state.driving = true;
  state.currentCar = car;
  car.isPlayer = true;
  player.mesh.visible = false;
  audio.horn();
  if (car.isVan) hud.showToast('The van is yours — now run', 4);
}

function exitCar() {
  if (!state.currentCar) return;
  const car = state.currentCar;
  car.isPlayer = false;
  car.speed = 0;
  state.driving = false;
  state.currentCar = null;
  player.mesh.visible = true;
  // Step out to the driver's side.
  player.x = car.pos.x - Math.cos(car.heading) * 2.2;
  player.z = car.pos.z + Math.sin(car.heading) * 2.2;
  player.y = 0;
  player.vy = 0;
  player.heading = car.heading;
  resolveCircleVsBuildings(player, PLAYER.RADIUS, colliders);
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
}

function tryEnterCar() {
  if (state.driving) {
    exitCar();
    return;
  }
  const car = nearestCar(4.5);
  if (!car) return;
  enterCar(car);
  if (!car.isVan) {
    police.addWanted(1);
    hud.showToast('Car stolen — wanted level up', 3);
  }
}

function resetWorld() {
  state.health = PLAYER.HEALTH_MAX;
  state.cash = 250;
  state.hour = CLOCK.START_HOUR;
  state.minute = CLOCK.START_MINUTE;
  state.clockSeconds = 0;
  player.x = 0;
  player.z = 20;
  player.y = 0;
  player.vy = 0;
  player.heading = Math.PI;
  exitCar();
  police.clearWanted();
  combat.clearEnemies();
  if (van.car) {
    van.car.remove();
    parkedCars.splice(parkedCars.indexOf(van.car), 1);
    van.car = null;
  }
  player.mesh.position.set(player.x, 0, player.z);
}

// --- Screens -------------------------------------------------------------------
function startPlaying() {
  state.screen = 'playing';
  hud.showHud();
  audio.resume();
  audio.startMusic();
  hud.showToast('VELDORA BAY — press M to start the next mission', 5);
}

// --- Frame step ----------------------------------------------------------------
function stepWorld(dt) {
  state.elapsed += dt;
  state.clockSeconds += dt;
  const totalMinutes = CLOCK.START_MINUTE + state.clockSeconds * (60 / CLOCK.SECONDS_PER_HOUR);
  state.hour = (CLOCK.START_HOUR + Math.floor(totalMinutes / 60)) % 24;
  state.minute = totalMinutes % 60;
  city.update(dt, state.elapsed);

  // Actions (edge-triggered) — read once per frame, before the player steps.
  const actions = input.takeActions();
  // Player and car.
  const orbit = input.takeOrbit();
  cameraRig.applyOrbit(orbit.x, orbit.y);
  if (state.driving && state.currentCar) {
    const car = state.currentCar;
    const throttle = input.forward;
    const steer = -input.strafe;
    const hit = car.drive(dt, throttle, steer, colliders);
    if (hit && Math.abs(car.speed) > 8) audio.crash();
    // Hit-and-run: a pedestrian under the wheels.
    const ped = traffic.nearestPed(car.pos.x, car.pos.z, 2.4);
    if (ped) {
      traffic.removePed(ped);
      police.addWanted(1);
      hud.showToast('Pedestrian hit — wanted level up', 3);
      audio.crash();
    }
    // Bumping traffic cars shoves them aside.
    for (const other of traffic.cars) {
      const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
      if (d < 4.5 && d > 0.01) {
        const push = (4.5 - d) * 0.5;
        other.pos.x += ((other.pos.x - car.pos.x) / d) * push;
        other.pos.z += ((other.pos.z - car.pos.z) / d) * push;
        car.speed *= 0.8;
      }
    }
    cameraRig.update(dt, { x: car.pos.x, y: 1.2, z: car.pos.z }, 'car', car.heading);
    audio.setEngine(Math.abs(car.speed) / CAR.MAX_SPEED);
  } else {
    player.step(dt, {
      forward: input.forward,
      strafe: input.strafe,
      run: input.run,
      jump: !!(actions & ACTION_JUMP),
      aiming: input.mouseHeld,
    }, cameraRig.yaw, colliders);
    cameraRig.update(dt, { x: player.x, y: player.y, z: player.z }, 'foot');
    audio.setEngine(0);
  }

  if (actions & ACTION_ENTER) tryEnterCar();
  if (actions & ACTION_MISSION) missions.startNext();
  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.muted);
    hud.setMuted(audio.muted);
  }
  if (actions & ACTION_PAUSE) {
    state.screen = 'paused';
    hud.showPause();
  }
  // Shooting: mouse held while on foot.
  if (!state.driving && input.mouseHeld && state.screen === 'playing') {
    const shotResult = combat.playerShoot(camera, player);
    if (shotResult.fired) {
      audio.gunshot();
      if (shotResult.enemy) {
        if (shotResult.enemy.dead) hud.showToast('Guard down', 2);
        else hud.showToast('Hit', 1);
      }
    }
  }

  // Systems.
  traffic.update(dt, { x: player.x, z: player.z, driving: state.driving }, null);
  const busted = police.update(
    dt,
    player,
    { x: state.driving ? state.currentCar.pos.x : player.x, z: state.driving ? state.currentCar.pos.z : player.z },
    state.driving,
    (unit) => {
      // A ram lands at most once every 0.7 s — contact lasts many frames.
      if (state.elapsed - state.lastRamAt < 0.7) return;
      state.lastRamAt = state.elapsed;
      if (state.currentCar) {
        state.currentCar.health -= POLICE.RAM_DAMAGE;
        audio.crash();
        if (state.currentCar.health <= 0) {
          hud.showToast('Your car is wrecked — get out', 4);
          exitCar();
        }
      }
    },
  );
  if (busted === 'busted') return;
  combat.update(dt, { x: player.x, z: player.z }, state.screen === 'playing');
  missions.update(dt, {
    playerPos: { x: player.x, z: player.z },
    driving: state.driving,
    drivingVan: state.driving && state.currentCar === van.car,
  });

  // Health regen out of combat.
  if (state.elapsed - state.lastDamageAt > 6 && state.health > 0 && state.health < PLAYER.HEALTH_MAX) {
    state.health = Math.min(PLAYER.HEALTH_MAX, state.health + 4 * dt);
  }

  // Mission marker beacon.
  const marker = missions.marker;
  if (marker) {
    beacon.visible = true;
    beaconRing.visible = true;
    beacon.position.set(marker.x, 30, marker.z);
    beaconRing.position.set(marker.x, 0.1, marker.z);
    beacon.material.opacity = 0.3 + Math.sin(state.elapsed * 3) * 0.12;
  } else {
    beacon.visible = false;
    beaconRing.visible = false;
  }

  audio.setSiren(police.wanted);
  refreshHud();
}

/** Push the live state into every HUD readout and the minimap. */
function refreshHud() {
  const speedKmh = state.driving && state.currentCar ? Math.abs(state.currentCar.speed) * 2.24 : 0;
  hud.update({
    health: state.health,
    cash: state.cash,
    wanted: police.wanted,
    driving: state.driving,
    onFoot: !state.driving,
    speedKmh,
    hour: state.hour,
    minute: state.minute,
    objective: missions.currentObjective,
    timeLeft: missions.timeLeft,
    missions: missions.missionList,
    roads: city.roads,
    colliders,
    marker: missions.marker,
    trafficCars: traffic.cars,
    enemies: combat.enemies,
    policeUnits: police.units,
    player: { x: player.x, z: player.z, heading: state.driving ? state.currentCar.heading : player.heading },
  }, state.elapsed);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'playing') {
    state.screen = 'paused';
    hud.showPause();
  }
});

// --- Screenshot staging ---------------------------------------------------------
function stageShot(name) {
  const STEP = 1 / 30;
  hud.showHud();
  state.screen = 'playing';
  if (name === 'start') {
    // Menu over a high view of the skyline at sunset.
    hud.showMenu(false);
    camera.position.set(-40, 55, 190);
    camera.lookAt(60, 18, -40);
    for (let i = 0; i < 90; i += 1) city.update(STEP, i * STEP);
    renderer.render(scene, camera);
    window.__shotReady = true;
    return;
  }
  if (name === 'drive') {
    const car = parkedCars[0];
    enterCar(car);
    car.pos.x = 0;
    car.pos.z = -60;
    car.heading = 0;
    for (let i = 0; i < 150; i += 1) {
      car.drive(STEP, 0.9, 0, colliders);
      traffic.update(STEP, { x: car.pos.x, z: car.pos.z, driving: true }, null);
      city.update(STEP, i * STEP);
    }
    cameraRig.setYaw(0);
    cameraRig.update(0.5, { x: car.pos.x, y: 1.2, z: car.pos.z }, 'car', car.heading);
    refreshHud();
    renderer.render(scene, camera);
    window.__shotReady = true;
    return;
  }
  if (name === 'chase') {
    const car = parkedCars[1];
    enterCar(car);
    car.pos.x = 0;
    car.pos.z = -140;
    car.heading = 0;
    police.setWanted(3);
    // Straight down the x=0 road so the chase stays on tarmac and in frame.
    for (let i = 0; i < 240; i += 1) {
      car.drive(STEP, 1, 0, colliders);
      traffic.update(STEP, { x: car.pos.x, z: car.pos.z, driving: true }, null);
      police.update(STEP, player, { x: car.pos.x, z: car.pos.z }, true, () => {});
      city.update(STEP, i * STEP);
    }
    cameraRig.setYaw(0);
    cameraRig.update(0.5, { x: car.pos.x, y: 1.2, z: car.pos.z }, 'car', car.heading);
    // Stage the nearest police unit into the frame: 14 units ahead of the
    // player car, slightly left, on the same heading — a real unit, mid-pursuit.
    const nearestUnit = police.units.find((u) => u.car) || police.units[0];
    if (nearestUnit && nearestUnit.car) {
      nearestUnit.car.pos.x = car.pos.x + Math.sin(car.heading) * 14 - Math.cos(car.heading) * 5;
      nearestUnit.car.pos.z = car.pos.z + Math.cos(car.heading) * 14 + Math.sin(car.heading) * 5;
      nearestUnit.car.heading = car.heading;
      nearestUnit.car.speed = car.speed * 0.9;
      nearestUnit.car.syncMesh(0.1);
    }
    refreshHud();
    renderer.render(scene, camera);
    window.__shotReady = true;
    return;
  }
  // mission: Dockside Heat in progress — Rae on foot, guards around, objective up.
  // Mark the first three missions done so the controller starts Dockside Heat.
  for (const id of [0, 1, 2]) missions.completed.add(id);
  missions.startNext();
  // Step the mission to the kill step: stand on the docks first so the
  // "reach" step completes and the guards spawn, then fall back to the pier
  // for the camera.
  player.x = landmarks.docks.x;
  player.z = landmarks.docks.z;
  player.mesh.position.set(player.x, 0, player.z);
  for (let i = 0; i < 10; i += 1) {
    missions.update(STEP, { playerPos: { x: player.x, z: player.z }, driving: false, drivingVan: false });
  }
  player.x = landmarks.docks.x;
  player.z = landmarks.docks.z + 42;
  player.heading = Math.PI;
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
  for (let i = 0; i < 60; i += 1) {
    combat.update(STEP, { x: player.x, z: player.z }, true);
    traffic.update(STEP, { x: player.x, z: player.z, driving: false }, null);
    city.update(STEP, i * STEP);
  }
  const marker = missions.marker;
  if (marker) {
    beacon.visible = true;
    beaconRing.visible = true;
    beacon.position.set(marker.x, 30, marker.z);
    beaconRing.position.set(marker.x, 0.1, marker.z);
  }
  cameraRig.setYaw(Math.PI);
  cameraRig.update(0.5, { x: player.x, y: 0, z: player.z }, 'foot');
  refreshHud();
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// --- Main loop ------------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  if (state.screen !== 'playing') {
    // Menu backdrop: slow orbit over the city.
    if (state.screen === 'menu') {
      const t = performance.now() * 0.00004;
      camera.position.set(Math.sin(t) * 180, 70, Math.cos(t) * 180);
      camera.lookAt(0, 10, 0);
      city.update(1 / 60, state.elapsed);
      renderer.render(scene, camera);
    }
    return;
  }
  const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
  lastNow = now;
  stepWorld(dt);
  renderer.render(scene, camera);
}

let lastNow = performance.now();

if (shot) {
  stageShot(shot);
} else {
  hud.showMenu(hasSave());
  requestAnimationFrame(frame);
}
