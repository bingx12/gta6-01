// Missions and story: five jobs for Rae Calloway, who owes the fixer
// Marla Voss one last job in Veldora Bay. Each mission stages its
// characters and vehicles before the action starts, so the chase cop is
// already visible when the chase begins and the dock guards are already
// standing on the pier when the shooting starts.
import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 1, name: 'First Gear', reward: 400,
    briefing: 'MARLA VOSS: "Rae. You are back. One last job and we are square. First, prove you can still drive. Take the car and reach the Coral Plaza marker."',
    objective: 'Drive to the Coral Plaza marker',
    target: new THREE.Vector3(58, 0, 58),
    start: { x: 0, z: 0 },
    needsCar: true,
  },
  {
    id: 2, name: 'Hot Pursuit', reward: 800,
    briefing: 'MARLA VOSS: "The package is in the car. The cops already know. Lose them — or outrun them — and get to the marina."',
    objective: 'Outrun the police and reach the marina',
    target: new THREE.Vector3(-116, 0, 116),
    start: { x: 0, z: -58 },
    needsCar: true, wanted: 2,
  },
  {
    id: 3, name: 'Parcel Run', reward: 1200,
    briefing: 'MARLA VOSS: "A parcel for the old harbour master. Ninety seconds, no excuses. The clock is already running, Rae."',
    objective: 'Deliver the parcel to the harbour office in 90 seconds',
    target: new THREE.Vector3(-116, 0, -116),
    start: { x: 116, z: 116 },
    needsCar: true, timed: 90,
  },
  {
    id: 4, name: 'Dockside', reward: 2000,
    briefing: 'MARLA VOSS: "The manifest is in the dock office. The guards will not hand it over. Go in loud, get it, get out."',
    objective: 'Clear the dock guards, then reach the dock office',
    target: new THREE.Vector3(-40, 0, -126),
    start: { x: -40, z: -108 },
    shootout: true,
  },
  {
    id: 5, name: 'The Last Job', reward: 5000,
    briefing: 'MARLA VOSS: "The armoured van leaves the bank at sunset. Take it, bring it to the old warehouse, and your debt is gone. One last job, Rae."',
    objective: 'Steal the armoured van and deliver it to the warehouse',
    target: new THREE.Vector3(116, 0, -116),
    start: { x: -58, z: 58 },
    needsCar: true, van: true,
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.active = null;
    this.timer = 0;
    this.marker = null;
    this.van = null;
    this.stagedCop = null;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  get done() {
    return this.index >= MISSIONS.length;
  }

  makeMarker(pos) {
    const geo = new THREE.CylinderGeometry(3.2, 3.2, 0.25, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.75 });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.set(pos.x, 0.15, pos.z);
    this.game.scene.add(marker);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beam.position.set(pos.x, 13, pos.z);
    this.game.scene.add(beam);
    marker.userData.beam = beam;
    return marker;
  }

  clearMarker() {
    if (!this.marker) return;
    this.game.scene.remove(this.marker);
    if (this.marker.userData.beam) this.game.scene.remove(this.marker.userData.beam);
    this.marker = null;
  }

  start(index = this.index) {
    const def = MISSIONS[index];
    if (!def) return false;
    this.active = def;
    this.timer = def.timed || 0;
    const g = this.game;
    // Stage the player at the mission start, on foot, before anything moves.
    g.player.teleport(def.start.x, def.start.z);
    g.exitCar();
    g.combat.clearEnemies();
    g.police.clearHeat();
    if (this.stagedCop) {
      g.scene.remove(this.stagedCop.mesh);
      this.stagedCop = null;
    }
    if (this.van) {
      g.scene.remove(this.van.mesh);
      this.van = null;
    }
    if (def.needsCar) {
      // A getaway car is parked at the player's feet when the job starts.
      const car = g.spawnMissionCar(def.start.x + 4, def.start.z + 2, 0);
      g.hud.say('A car is waiting. Press E to steal it.');
    }
    if (def.wanted) {
      // The chase cop is staged in the scene BEFORE the chase begins.
      this.stagedCop = g.police.spawnPoliceCar(new THREE.Vector3(def.start.x, 0, def.start.z));
      g.police.addHeat(def.wanted);
    }
    if (def.shootout) {
      // Guards are standing on the pier before the player arrives.
      const dock = g.city.dockPos;
      const spots = [
        [dock.x - 18, dock.z + 2], [dock.x - 6, dock.z - 4],
        [dock.x + 8, dock.z + 4], [dock.x + 18, dock.z - 2],
        [dock.x, dock.z - 10],
      ];
      for (const [x, z] of spots) g.combat.spawnEnemy(x, z);
      g.hud.say('Five guards hold the docks. Clear them out.');
    }
    if (def.van) {
      this.van = g.spawnMissionCar(-30, 30, Math.PI / 2, 0x3a3a42);
      this.van.mesh.scale.set(1.15, 1.1, 1.25);
      g.hud.say('The armoured van is by the bank. Take it.');
    }
    this.clearMarker();
    this.marker = this.makeMarker(def.target);
    g.hud.say(def.briefing);
    g.hud.setObjective(def.objective);
    g.audio.pickup();
    return true;
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    if (this.marker) {
      this.marker.rotation.y += dt * 1.2;
      this.marker.position.y = 0.15 + Math.sin(performance.now() / 300) * 0.08;
    }
    if (this.active.timed) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.fail('Out of time — the parcel run failed.');
        return;
      }
    }
    if (this.active.shootout && g.combat.aliveCount() > 0) return;
    const pos = g.playerCar ? g.playerCar.pos : g.player.pos;
    const dist = pos.distanceTo(this.active.target);
    if (this.active.van && g.playerCar !== this.van) {
      // The van itself must be the delivery vehicle.
      if (dist < 6 && g.playerCar) {
        g.hud.say('Wrong car — bring the armoured van, not this one.');
      }
      return;
    }
    if (dist < 6) this.complete();
  }

  complete() {
    const def = this.active;
    const g = this.game;
    g.player.addCash(def.reward);
    g.audio.cashSound();
    g.hud.say(`MISSION COMPLETE — ${def.name}. +$${def.reward}`);
    g.hud.flashBanner(`MISSION COMPLETE: ${def.name}  +$${def.reward}`);
    this.clearMarker();
    g.combat.clearEnemies();
    g.police.clearHeat();
    this.active = null;
    this.index += 1;
    if (this.index >= MISSIONS.length) {
      g.hud.say('MARLA VOSS: "Debt paid, Rae. Veldora Bay is yours now. Free roam — the city is open."');
      g.hud.setObjective('Free roam — explore Veldora Bay');
      g.saveGame();
    } else {
      g.hud.setObjective(`Next: ${MISSIONS[this.index].name} — press N to start`);
    }
    g.saveGame();
  }

  fail(reason) {
    const g = this.game;
    g.hud.say(`MISSION FAILED — ${reason}`);
    g.hud.flashBanner(`MISSION FAILED: ${reason}`);
    this.clearMarker();
    g.combat.clearEnemies();
    g.police.clearHeat();
    this.active = null;
    g.hud.setObjective(`Retry: ${MISSIONS[this.index].name} — press N to start`);
  }
}
