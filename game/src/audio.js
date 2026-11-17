// Procedural sound for VELDORA BAY: every sound is synthesized with WebAudio,
// no audio files. Engine hum follows the driven car's speed, sirens wail while
// the heat is on, gunshots are filtered noise bursts, and a small synth loop
// (bass + hats + pad) plays under the city. All of it mutes with one toggle.

const MUSIC_BPM = 96;
const BASS_LINE = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 82.41, 0, 73.42, 0];
const ARP_LINE = [220, 261.63, 329.63, 392, 329.63, 261.63, 220, 196, 220, 261.63, 329.63, 440, 392, 329.63, 261.63, 220];

/** Build the audio engine. Call resume() from a user gesture before playing. */
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 42;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that an LFO sweeps between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.55;
      const sirenLfoGain = ctx.createGain();
      sirenLfoGain.gain.value = 260;
      sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, seconds, type, volume, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  }

  function playMusicStep() {
    if (!ctx || muted) return;
    const stepSeconds = 60 / MUSIC_BPM / 2;
    const bass = BASS_LINE[musicStep % BASS_LINE.length];
    if (bass > 0) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = bass;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stepSeconds * 1.8);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start();
      osc.stop(ctx.currentTime + stepSeconds * 2);
    }
    const arp = ARP_LINE[musicStep % ARP_LINE.length];
    if (musicStep % 2 === 0) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = arp;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stepSeconds);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start();
      osc.stop(ctx.currentTime + stepSeconds);
    }
    // Hat tick on every off-beat.
    if (musicStep % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.03);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const gain = ctx.createGain();
      gain.gain.value = 0.12;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(musicGain);
      src.start();
    }
    musicStep += 1;
  }

  return {
    resume,
    get muted() {
      return muted;
    },
    startMusic() {
      if (started || !ensure()) return;
      started = true;
      const stepSeconds = 60 / MUSIC_BPM / 2;
      musicTimer = window.setInterval(playMusicStep, stepSeconds * 1000);
    },
    stopMusic() {
      if (musicTimer !== null) window.clearInterval(musicTimer);
      musicTimer = null;
      started = false;
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    /** Engine hum volume/pitch from the driven car's speed (0..1). */
    setEngine(speed01) {
      if (!ctx) return;
      const target = speed01 > 0.02 ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(42 + speed01 * 110, ctx.currentTime, 0.1);
    },
    /** Siren on while wanted >= 2, louder with more stars. */
    setSiren(wanted) {
      if (!ctx) return;
      const target = wanted >= 2 ? 0.02 + wanted * 0.008 : 0;
      sirenGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.2);
    },
    gunshot() {
      if (!ctx || muted) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.14);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
      blip(160, 0.08, 'square', 0.2, 60);
    },
    crash() {
      if (!ctx || muted) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.3);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.25);
      window.setTimeout(() => blip(990, 0.12, 'sine', 0.25), 70);
    },
    cash() {
      blip(880, 0.08, 'triangle', 0.22);
      window.setTimeout(() => blip(1174, 0.1, 'triangle', 0.22), 80);
      window.setTimeout(() => blip(1568, 0.16, 'triangle', 0.22), 160);
    },
    missionStart() {
      blip(392, 0.12, 'triangle', 0.25);
      window.setTimeout(() => blip(523, 0.12, 'triangle', 0.25), 110);
      window.setTimeout(() => blip(659, 0.2, 'triangle', 0.25), 220);
    },
    fail() {
      blip(220, 0.25, 'sawtooth', 0.2, 110);
    },
    horn() {
      blip(370, 0.18, 'square', 0.15);
    },
  };
}
