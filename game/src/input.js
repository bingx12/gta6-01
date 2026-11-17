// Keyboard and mouse input for VELDORA BAY. One object owns the key state and
// the camera orbit drag; the game loop reads it every frame and consumes the
// edge-triggered actions (enter car, shoot, pause, mission, mute).

export const ACTION_ENTER = 1 << 0;
export const ACTION_SHOOT = 1 << 1;
export const ACTION_PAUSE = 1 << 2;
export const ACTION_MISSION = 1 << 3;
export const ACTION_MUTE = 1 << 4;
export const ACTION_JUMP = 1 << 5;
export const ACTION_INTERACT = 1 << 6;

const KEY_ACTIONS = {
  KeyE: ACTION_ENTER,
  KeyF: ACTION_INTERACT,
  KeyM: ACTION_MISSION,
  KeyK: ACTION_MUTE,
  Space: ACTION_JUMP,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
};

/** Create the input state bound to the page; call takeActions() once a frame. */
export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let dragX = 0;
  let dragY = 0;
  let orbitDX = 0;
  let orbitDY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) actions |= action;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseDown(event) {
    if (event.button === 0) {
      mouseDown = true;
      dragX = event.clientX;
      dragY = event.clientY;
    }
  }
  function onMouseMove(event) {
    if (!mouseDown) return;
    orbitDX += event.clientX - dragX;
    orbitDY += event.clientY - dragY;
    dragX = event.clientX;
    dragY = event.clientY;
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }
  function onBlur() {
    keys.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    /** Held keys: W/A/S/D or arrows, Shift to run. */
    get forward() {
      return (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    },
    get strafe() {
      return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    },
    get run() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    get mouseHeld() {
      return mouseDown;
    },
    /** Orbit delta accumulated since the last read, in pixels; resets on read. */
    takeOrbit() {
      const out = { x: orbitDX, y: orbitDY };
      orbitDX = 0;
      orbitDY = 0;
      return out;
    },
    /** Edge-triggered actions pressed since the last call; clears them. */
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    /** True while the named key code is held down. */
    isDown(code) {
      return keys.has(code);
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
