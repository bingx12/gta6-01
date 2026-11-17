// Heads-up display and minimap: health, cash, wanted stars, speed, the
// in-game clock, the objective tracker, the mission list, dialogue,
// menus, and the WASTED / BUSTED screens. All DOM, drawn over the canvas.
import { MISSIONS } from './missions.js';
import { PALETTE } from './config.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.build();
    this.bannerTimer = 0;
    this.messageTimer = 0;
  }

  build() {
    this.root.innerHTML = `
      <div id="hud-top-left">
        <div id="stars"></div>
        <div id="cash">$0</div>
        <div id="clock">17:24</div>
      </div>
      <div id="hud-top-right">
        <div id="objective">Welcome to Veldora Bay</div>
        <div id="mission-list"></div>
      </div>
      <div id="hud-bottom-left">
        <div id="health-bar"><div id="health-fill"></div><span id="health-text">100</span></div>
        <div id="speed">0 mph</div>
        <div id="hint">WASD move · Space jump · E steal car · Click shoot · M mute · P pause</div>
      </div>
      <canvas id="minimap" width="180" height="180"></canvas>
      <div id="dialogue"></div>
      <div id="banner"></div>
      <div id="menu">
        <div class="menu-card">
          <h1>VELDORA BAY</h1>
          <p class="tagline">Rae Calloway owes Marla Voss one last job.</p>
          <p class="controls">WASD move &nbsp;·&nbsp; Space jump &nbsp;·&nbsp; E steal a car &nbsp;·&nbsp; Mouse aim, click to shoot<br>
          N start mission &nbsp;·&nbsp; M mute &nbsp;·&nbsp; P pause &nbsp;·&nbsp; C continue a saved game</p>
          <button id="btn-play">START THE JOB</button>
          <button id="btn-continue">CONTINUE</button>
          <p class="small">An original open-world crime game. All names, places and music are invented.</p>
        </div>
      </div>
      <div id="overlay" class="hidden"><h1 id="overlay-title">WASTED</h1><p id="overlay-text"></p><button id="btn-respawn">RESPAWN</button></div>
      <div id="pause-menu" class="hidden"><div class="menu-card"><h1>PAUSED</h1><p>Take a breath, Rae.</p><button id="btn-resume">RESUME</button><button id="btn-save">SAVE GAME</button><button id="btn-quit">QUIT TO MENU</button></div></div>`;
    this.starsEl = document.getElementById('stars');
    this.cashEl = document.getElementById('cash');
    this.clockEl = document.getElementById('clock');
    this.objectiveEl = document.getElementById('objective');
    this.listEl = document.getElementById('mission-list');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.speedEl = document.getElementById('speed');
    this.dialogueEl = document.getElementById('dialogue');
    this.bannerEl = document.getElementById('banner');
    this.menuEl = document.getElementById('menu');
    this.overlayEl = document.getElementById('overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlayText = document.getElementById('overlay-text');
    this.pauseEl = document.getElementById('pause-menu');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    document.getElementById('btn-play').addEventListener('click', () => this.game.startGame(false));
    document.getElementById('btn-continue').addEventListener('click', () => this.game.startGame(true));
    document.getElementById('btn-respawn').addEventListener('click', () => this.game.respawn());
    document.getElementById('btn-resume').addEventListener('click', () => this.game.togglePause(false));
    document.getElementById('btn-save').addEventListener('click', () => { this.game.saveGame(); this.say('Game saved.'); });
    document.getElementById('btn-quit').addEventListener('click', () => this.game.quitToMenu());
  }

  say(text) {
    this.dialogueEl.textContent = text;
    this.dialogueEl.classList.add('show');
    this.messageTimer = 7;
  }

  setObjective(text) {
    this.objectiveEl.textContent = '★ ' + text;
  }

  flashBanner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add('show');
    this.bannerTimer = 3.5;
  }

  showMenu(show) {
    this.menuEl.classList.toggle('hidden', !show);
  }

  showPause(show) {
    this.pauseEl.classList.toggle('hidden', !show);
  }

  showOverlay(kind, text) {
    this.overlayTitle.textContent = kind;
    this.overlayText.textContent = text;
    this.overlayEl.classList.remove('hidden');
  }

  hideOverlay() {
    this.overlayEl.classList.add('hidden');
  }

  update(dt, state) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    }
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.dialogueEl.classList.remove('show');
    }
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.stars ? '★' : '☆';
    this.starsEl.textContent = stars;
    this.starsEl.style.color = PALETTE.star;
    this.cashEl.textContent = '$' + state.cash.toLocaleString('en-US');
    const totalMin = Math.floor(state.clockMinutes) % (24 * 60);
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    this.clockEl.textContent = `${hh}:${mm}`;
    const hp = Math.max(0, Math.round(state.health));
    this.healthFill.style.width = hp + '%';
    this.healthFill.style.background = hp > 50 ? '#4ade80' : hp > 25 ? '#facc15' : '#ef4444';
    this.healthText.textContent = String(hp);
    this.speedEl.textContent = state.inCar
      ? `${Math.round(Math.abs(state.speed) * 2.2)} mph`
      : 'On foot';
    let list = '';
    MISSIONS.forEach((m, i) => {
      const mark = i < state.missionIndex ? '✓' : i === state.missionIndex ? '►' : '·';
      list += `<div class="mission-row ${i === state.missionIndex ? 'current' : ''}">${mark} ${i + 1}. ${m.name} — $${m.reward}</div>`;
    });
    this.listEl.innerHTML = list;
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const ctx = this.mapCtx;
    const s = 180;
    const scale = s / 420;
    const cx = s / 2 - state.playerX * scale;
    const cy = s / 2 - state.playerZ * scale;
    ctx.fillStyle = '#0e1a24';
    ctx.fillRect(0, 0, s, s);
    // Ocean to the east.
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(cx + 168 * scale, 0, s, s);
    ctx.fillStyle = '#e8c98f';
    ctx.fillRect(cx + 155 * scale, 0, 26 * scale, s);
    // Roads.
    ctx.strokeStyle = '#55555e';
    ctx.lineWidth = 7;
    for (let i = 0; i < 5; i += 1) {
      const c = (-116 + i * 58) * scale;
      ctx.beginPath(); ctx.moveTo(0, cy + c); ctx.lineTo(s, cy + c); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + c, 0); ctx.lineTo(cx + c, s); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#8a6a4a';
    for (let bx = 0; bx < 4; bx += 1) {
      for (let bz = 0; bz < 4; bz += 1) {
        const x = cx + (-87 + bx * 58) * scale;
        const y = cy + (-87 + bz * 58) * scale;
        ctx.fillRect(x, y, 26 * scale, 26 * scale);
      }
    }
    const dot = (x, z, colour, r = 4) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(cx + x * scale, cy + z * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (state.marker) dot(state.marker.x, state.marker.z, '#ffd23e', 6);
    for (const t of state.traffic) dot(t.x, t.z, '#9fb3c8', 2.5);
    for (const p of state.police) dot(p.x, p.z, '#3b82f6', 4);
    for (const e of state.enemies) dot(e.x, e.z, '#ef4444', 3.5);
    // Player arrow, pointing along the heading.
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  }
}
