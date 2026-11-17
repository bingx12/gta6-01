// Veldora Bay — every tuning number and colour in one place.
// The city is a street grid; one block is 46 world units, roads are 12 wide.
export const CITY = {
  blocks: 5,
  blockSize: 46,
  roadWidth: 12,
  half: 140,
  beachX: 168,
  dockZ: -118,
};

export const PLAYER = {
  walkSpeed: 9,
  runSpeed: 14,
  jumpSpeed: 9.5,
  gravity: 26,
  radius: 0.7,
  height: 1.8,
  maxHealth: 100,
  regenPerSecond: 3.5,
  regenDelay: 5,
};

export const CAR = {
  accel: 26,
  brake: 42,
  reverseAccel: 14,
  maxSpeed: 42,
  maxReverse: 12,
  steer: 1.9,
  drag: 0.55,
  grip: 6,
};

export const WANTED = {
  maxStars: 5,
  coolPerSecond: 0.055,
  ramCooldown: 0.7,
  bustDistance: 2.4,
  bustTime: 2.2,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 90,
  fireInterval: 0.28,
  enemyHealth: 100,
  enemyDamage: 9,
  enemyRange: 42,
  enemyFireInterval: 1.15,
};

export const PALETTE = {
  skyTop: 0xff9e57,
  skyBottom: 0xffd9a0,
  fog: 0xf7a55c,
  sun: 0xffe3b0,
  ambient: 0xffe0b8,
  ground: 0x9a8a7a,
  road: 0x4d4d58,
  sidewalk: 0x9a938a,
  sand: 0xe8c98f,
  ocean: 0x2e7f9e,
  building: [0xd8a06a, 0xc98a7a, 0x7a9ab0, 0xb0a06a, 0x9a7ab0, 0x6ab09a],
  windowLit: 0xffd27a,
  windowDark: 0x2c3440,
  palmTrunk: 0x7a5a3a,
  palmLeaf: 0x3f9e4d,
  playerJacket: 0x2e6fb0,
  playerSkin: 0xc98a5e,
  policeBlue: 0x1e3fae,
  policeWhite: 0xf2f2f2,
  hudText: '#fff3e0',
  hudPanel: 'rgba(20,14,10,0.62)',
  star: '#ffd23e',
  cash: '#7dff8a',
  danger: '#ff4d4d',
};

export const SAVE_KEY = 'veldora-bay.save.v1';
export const START_CASH = 250;
export const CLOCK_START_MINUTES = 17 * 60 + 24;
