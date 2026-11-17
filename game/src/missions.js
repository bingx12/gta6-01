// Story missions for VELDORA BAY. Rae Calloway, ex-getaway driver, is back in
// the city and owes the fixer Marla Voss one last job. Five missions, each a
// list of steps the controller walks through: reach a place, get in a car,
// survive the heat, clear the docks, or steal the van. The controller owns
// the state; main.js owns the world effects (spawning enemies, setting
// wanted, paying out) through the hooks each step fires.

import { MISSIONS } from './config.js';

const TITLES = [
  "Back in the Driver's Seat",
  'The Getaway',
  'Parcel Run',
  'Dockside Heat',
  'The Veldora Job',
];

const BRIEFS = [
  "Marla Voss: \"Rae. You're back. The city's changed, the driving hasn't. Steal a car and meet me at the plaza. Don't make it complicated.\"",
  "Dizzy's waiting at the docks with a duffel of Marla's money and the cops already sniffing. Pick him up, lose the tail, and bring him to the safehouse.",
  "Three parcels, three drops, one clock. The clients pay for discretion and speed — mostly speed. 150 seconds, no excuses.",
  "Marla's shipment is pinned down at the docks by Voss's rivals. Clear the guards, grab the crate, and get out breathing.",
  "The last job. An armored van full of casino cash is parked at Bay 12. Take it, outrun everything the city throws at you, and bring it to the beach.",
];

const DEBRIEFS = [
  '"Not bad, Rae. You still drive like the city owes you money."',
  '"Dizzy\'s safe. Marla says you\'re earning your way back."',
  '"All three drops, on time. The clients are asking for you by name."',
  '"The crate\'s ours. You just made a lot of enemies, Rae — and one friend."',
  '"It\'s done. The debt is paid, the city is yours again. Welcome home, Rae."',
];

/**
 * Build the five missions from the city landmarks. `api` is what the steps
 * call into the world: spawnEnemy, spawnVan, setWanted, clearWanted, toast.
 */
export function buildMissions(landmarks, api) {
  const L = landmarks;
  const missions = [
    {
      id: 0,
      title: TITLES[0],
      brief: BRIEFS[0],
      debrief: DEBRIEFS[0],
      reward: MISSIONS.REWARDS[0],
      steps: [
        { kind: 'drive', text: 'Steal a car — walk up to one and press E', target: null, radius: 0 },
        { kind: 'reach', text: 'Drive to the plaza meet', target: L.plaza, radius: 10 },
      ],
    },
    {
      id: 1,
      title: TITLES[1],
      brief: BRIEFS[1],
      debrief: DEBRIEFS[1],
      reward: MISSIONS.REWARDS[1],
      steps: [
        { kind: 'reach', text: 'Pick up Dizzy at the docks', target: L.docks, radius: 10 },
        {
          kind: 'reach',
          text: 'Lose the cops — reach the safehouse',
          target: L.safehouse,
          radius: 10,
          onEnter() {
            api.setWanted(2);
            api.toast('WANTED: 2 stars — the VBPD is on you');
          },
          onLeave() {
            api.clearWanted();
          },
        },
      ],
    },
    {
      id: 2,
      title: TITLES[2],
      brief: BRIEFS[2],
      debrief: DEBRIEFS[2],
      reward: MISSIONS.REWARDS[2],
      timeLimit: 150,
      steps: [
        { kind: 'reach', text: 'Drop 1 of 3 — the beach kiosk', target: L.beach, radius: 9 },
        { kind: 'reach', text: 'Drop 2 of 3 — the hospital', target: L.hospital, radius: 9 },
        { kind: 'reach', text: 'Drop 3 of 3 — the warehouse', target: L.warehouse, radius: 9 },
      ],
    },
    {
      id: 3,
      title: TITLES[3],
      brief: BRIEFS[3],
      debrief: DEBRIEFS[3],
      reward: MISSIONS.REWARDS[3],
      steps: [
        { kind: 'reach', text: 'Get to the docks', target: L.docks, radius: 14 },
        {
          kind: 'kill',
          text: 'Clear the dock guards (4)',
          target: L.docks,
          radius: 16,
          count: 4,
          onEnter() {
            api.spawnDockGuards();
            api.toast('Four guards between you and the crate');
          },
        },
        { kind: 'reach', text: 'Grab the crate at the pier', target: { x: -175, z: 252 }, radius: 6 },
      ],
    },
    {
      id: 4,
      title: TITLES[4],
      brief: BRIEFS[4],
      debrief: DEBRIEFS[4],
      reward: MISSIONS.REWARDS[4],
      steps: [
        { kind: 'reach', text: 'Get to Bay 12 Warehouse', target: L.warehouse, radius: 12 },
        {
          kind: 'van',
          text: 'Steal the armored van (press E)',
          target: L.warehouse,
          radius: 12,
          onEnter() {
            api.spawnVan();
          },
        },
        {
          kind: 'reach',
          text: 'Escape to the beach with the van',
          target: L.beach,
          radius: 12,
          onEnter() {
            api.setWanted(4);
            api.toast('WANTED: 4 stars — every unit in the city is coming');
          },
        },
      ],
    },
  ];

  return {
    missions,
    /** The next mission the player has not finished, or null. */
    nextMission(completed) {
      return missions.find((m) => !completed.has(m.id)) || null;
    },
  };
}

/** The live mission controller: starts missions, walks their steps, pays out. */
export function createMissionController(missionData, hooks) {
  const completed = new Set();
  let active = null;
  let stepIndex = 0;
  let timer = 0;
  let kills = 0;
  let failed = null;

  function currentStep() {
    return active ? active.steps[stepIndex] : null;
  }

  function enterStep() {
    const step = currentStep();
    if (step && step.onEnter) step.onEnter();
    if (step) hooks.onObjective(step.text);
  }

  function advance() {
    const step = currentStep();
    if (step && step.onLeave) step.onLeave();
    stepIndex += 1;
    kills = 0;
    if (stepIndex >= active.steps.length) {
      const reward = active.reward;
      hooks.onCash(reward);
      hooks.onDialogue(active.debrief);
      hooks.onMissionComplete(active);
      completed.add(active.id);
      active = null;
      stepIndex = 0;
      return;
    }
    enterStep();
  }

  return {
    get active() {
      return active;
    },
    get completed() {
      return completed;
    },
    get failed() {
      return failed;
    },
    get timeLeft() {
      return active && active.timeLimit ? Math.max(0, active.timeLimit - timer) : null;
    },
    get currentObjective() {
      const step = currentStep();
      return step ? step.text : null;
    },
    get marker() {
      const step = currentStep();
      return step && step.target ? step.target : null;
    },
    get missionList() {
      return missionData.missions.map((m) => ({
        id: m.id,
        title: m.title,
        reward: m.reward,
        state: completed.has(m.id) ? 'done' : active === m ? 'active' : 'available',
      }));
    },
    startNext() {
      if (active) return false;
      const next = missionData.nextMission(completed);
      if (!next) return false;
      active = next;
      stepIndex = 0;
      timer = 0;
      kills = 0;
      failed = null;
      hooks.onDialogue(next.brief);
      hooks.onMissionStart(next);
      enterStep();
      return true;
    },
    registerKill() {
      kills += 1;
      const step = currentStep();
      if (step && step.kind === 'kill' && kills >= (step.count || 1)) advance();
    },
    /** Advance the active mission one step; returns 'complete' | 'failed' | null. */
    update(dt, ctx) {
      if (!active) return null;
      timer += dt;
      if (active.timeLimit && timer > active.timeLimit) {
        failed = `${active.title} — time ran out`;
        hooks.onMissionFailed(active, 'Time ran out');
        hooks.onDialogue('Marla: "Too slow, Rae. The clients walked. Come back when you can drive."');
        active = null;
        stepIndex = 0;
        return 'failed';
      }
      const step = currentStep();
      if (!step) return null;
      if (step.kind === 'reach' && step.target) {
        const d = Math.hypot(ctx.playerPos.x - step.target.x, ctx.playerPos.z - step.target.z);
        if (d < step.radius) {
          if (step.kind === 'reach') hooks.onPickup();
          advance();
          return active ? null : 'complete';
        }
      } else if (step.kind === 'drive' && ctx.driving) {
        advance();
      } else if (step.kind === 'van' && ctx.drivingVan) {
        advance();
      } else if (step.kind === 'kill') {
        // Completion is driven by registerKill().
      }
      return null;
    },
    /** Abandon the active mission (player pressed M again, or died). */
    abandon(reason) {
      if (!active) return;
      const step = currentStep();
      if (step && step.onLeave) step.onLeave();
      hooks.onMissionFailed(active, reason);
      active = null;
      stepIndex = 0;
    },
  };
}
