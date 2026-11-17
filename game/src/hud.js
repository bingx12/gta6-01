// HUD for VELDORA BAY: the DOM chrome around the 3D view — wanted stars,
// health, cash, speed, clock, objective, mission list, toasts, dialogue, the
// start/pause/wasted screens, and a 2D canvas minimap drawn from the live
// world (roads, buildings, cars, cops, the mission marker).

const MAP_SIZE = 208;
const WORLD_HALF = 320;

function starsMarkup(wanted) {
  let out = '';
  for (let i = 0; i < 5; i += 1) out += `<span class="star${i < wanted ? ' on' : ''}">★</span>`;
  return out;
}

function formatClock(hour, minute) {
  const h = ((hour % 24) + 24) % 24;
  const m = Math.floor(minute);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Wire the HUD elements in the page; returns the live HUD object. */
export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    minimap: $('minimap'),
    stars: $('stars'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    cash: $('cash'),
    speed: $('speed'),
    clock: $('clock'),
    objective: $('objective'),
    missionList: $('mission-list'),
    toast: $('toast'),
    dialogue: $('dialogue'),
    dialogueText: $('dialogue-text'),
    menu: $('menu'),
    pauseMenu: $('pause-menu'),
    endScreen: $('end-screen'),
    endTitle: $('end-title'),
    endText: $('end-text'),
    muteBtn: $('mute-btn'),
    crosshair: $('crosshair'),
    timer: $('timer'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let toastTimer = null;
  let dialogueTimer = null;

  function bindButton(id, fn) {
    const button = $(id);
    if (button) button.addEventListener('click', () => {
      callbacks.audioResume();
      fn();
    });
  }
  bindButton('btn-start', () => callbacks.onStart());
  bindButton('btn-continue', () => callbacks.onContinue());
  bindButton('btn-resume', () => callbacks.onResume());
  bindButton('btn-save', () => callbacks.onSave());
  bindButton('btn-restart', () => callbacks.onRestart());
  bindButton('btn-respawn', () => callbacks.onRespawn());
  bindButton('btn-mission', () => callbacks.onMission());
  if (el.muteBtn) el.muteBtn.addEventListener('click', () => callbacks.onMute());

  function showToast(message, seconds = 3.5) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), seconds * 1000);
  }

  function showDialogue(text, seconds = 7) {
    el.dialogueText.textContent = text;
    el.dialogue.classList.add('show');
    if (dialogueTimer) window.clearTimeout(dialogueTimer);
    dialogueTimer = window.setTimeout(() => el.dialogue.classList.remove('show'), seconds * 1000);
  }

  function drawMinimap(state, time) {
    const ctx = mapCtx;
    const scale = MAP_SIZE / (WORLD_HALF * 2);
    const toMap = (x, z) => [MAP_SIZE / 2 + x * scale, MAP_SIZE / 2 + z * scale];
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Water on the east edge.
    ctx.fillStyle = '#164e6b';
    const [waterX] = toMap(292, 0);
    ctx.fillRect(waterX, 0, MAP_SIZE - waterX, MAP_SIZE);
    ctx.fillStyle = '#d9b380';
    const [sandX] = toMap(252, 0);
    ctx.fillRect(sandX, 0, waterX - sandX, MAP_SIZE);
    // Roads.
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = 5;
    for (const road of state.roads) {
      const [rx] = toMap(road, 0);
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx, MAP_SIZE);
      ctx.stroke();
      const [, rz] = toMap(0, road);
      ctx.beginPath();
      ctx.moveTo(0, rz);
      ctx.lineTo(MAP_SIZE, rz);
      ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#6a6255';
    for (const b of state.colliders) {
      const [x1, z1] = toMap(b.minX, b.minZ);
      const [x2, z2] = toMap(b.maxX, b.maxZ);
      ctx.fillRect(x1, z1, Math.max(1, x2 - x1), Math.max(1, z2 - z1));
    }
    // Mission marker: pulsing yellow diamond.
    if (state.marker) {
      const [mx, mz] = toMap(state.marker.x, state.marker.z);
      const pulse = 5 + Math.sin(time * 5) * 2;
      ctx.fillStyle = '#ffd21a';
      ctx.beginPath();
      ctx.moveTo(mx, mz - pulse);
      ctx.lineTo(mx + pulse, mz);
      ctx.lineTo(mx, mz + pulse);
      ctx.lineTo(mx - pulse, mz);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic cars: grey dots. Enemies: red dots. Cops: flashing blue.
    ctx.fillStyle = '#c8c8c8';
    for (const car of state.trafficCars) {
      const [cx, cz] = toMap(car.pos.x, car.pos.z);
      ctx.fillRect(cx - 1.5, cz - 1.5, 3, 3);
    }
    ctx.fillStyle = '#ff3b30';
    for (const enemy of state.enemies) {
      const [ex, ez] = toMap(enemy.x, enemy.z);
      ctx.beginPath();
      ctx.arc(ex, ez, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const copOn = Math.floor(time * 2) % 2 === 0;
    ctx.fillStyle = copOn ? '#2a6bff' : '#ff2a1a';
    for (const unit of state.policeUnits) {
      const ux = unit.car ? unit.car.pos.x : unit.x;
      const uz = unit.car ? unit.car.pos.z : unit.z;
      const [px, pz] = toMap(ux, uz);
      ctx.beginPath();
      ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: white arrow pointing along the heading.
    const [px, pz] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, pz);
    // Canvas y grows with world z; the arrow's rest direction is up (-y), so
    // the rotation that points it along (sin h, cos h) is PI - heading.
    ctx.rotate(Math.PI - state.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', MAP_SIZE / 2 - 4, 12);
  }

  return {
    showToast,
    showDialogue,
    showMenu(hasSave) {
      el.menu.classList.remove('hidden');
      el.pauseMenu.classList.add('hidden');
      el.endScreen.classList.add('hidden');
      el.hud.classList.add('hidden');
      const cont = $('btn-continue');
      if (cont) cont.style.display = hasSave ? '' : 'none';
    },
    showPause() {
      el.pauseMenu.classList.remove('hidden');
      el.menu.classList.add('hidden');
      el.endScreen.classList.add('hidden');
    },
    hidePause() {
      el.pauseMenu.classList.add('hidden');
    },
    showEnd(kind, text) {
      el.endTitle.textContent = kind;
      el.endTitle.className = kind === 'WASTED' ? 'wasted' : 'busted';
      el.endText.textContent = text;
      el.endScreen.classList.remove('hidden');
      el.pauseMenu.classList.add('hidden');
    },
    hideEnd() {
      el.endScreen.classList.add('hidden');
    },
    showHud() {
      el.hud.classList.remove('hidden');
      el.menu.classList.add('hidden');
    },
    setMuted(muted) {
      if (el.muteBtn) el.muteBtn.textContent = muted ? '🔇 Muted' : '🔊 Sound';
    },
    /** Refresh every HUD readout from the live game state. */
    update(state, time) {
      el.stars.innerHTML = starsMarkup(state.wanted);
      el.stars.classList.toggle('hot', state.wanted > 0);
      el.healthFill.style.width = `${Math.max(0, state.health)}%`;
      el.healthFill.className = state.health < 30 ? 'low' : '';
      el.healthText.textContent = `${Math.max(0, Math.ceil(state.health))}`;
      el.cash.textContent = `$${state.cash.toLocaleString('en-US')}`;
      el.speed.textContent = state.driving ? `${Math.round(state.speedKmh)} mph` : '';
      el.clock.textContent = formatClock(state.hour, state.minute);
      el.objective.textContent = state.objective || 'Free roam — press M to start the next mission';
      el.timer.textContent = state.timeLeft !== null ? `⏱ ${Math.ceil(state.timeLeft)}s` : '';
      el.crosshair.style.display = state.onFoot ? '' : 'none';
      const list = el.missionList;
      list.innerHTML = state.missions
        .map((m) => `<div class="mission ${m.state}"><span class="m-state">${m.state === 'done' ? '✓' : m.state === 'active' ? '▶' : '○'}</span> ${m.title} <span class="m-reward">$${m.reward}</span></div>`)
        .join('');
      drawMinimap(state, time);
    },
  };
}
