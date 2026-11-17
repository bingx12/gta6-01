// VELDORA BAY — world constants and tuning. One place for every number the
// city, the cars, the police and the missions share, so tuning never means
// hunting through the systems that use it.

export const WORLD = {
  // City grid: BLOCKS x BLOCKS blocks, each BLOCK_SIZE wide, roads ROAD_W wide.
  BLOCKS: 7,
  BLOCK_SIZE: 56,
  ROAD_W: 14,
  // East edge of the city: everything past BEACH_X is sand, then water.
  BEACH_X: 252,
  WATER_X: 292,
  WORLD_HALF: 320,
  // Sunset palette.
  SKY_TOP: 0x2b3a67,
  SKY_HORIZON: 0xff9a56,
  FOG_COLOR: 0xe08a5a,
  FOG_NEAR: 120,
  FOG_FAR: 620,
  SUN_COLOR: 0xffb36b,
  SUN_INTENSITY: 1.7,
  AMBIENT_COLOR: 0x8a7bb8,
  AMBIENT_INTENSITY: 0.85,
  WATER_COLOR: 0x1e6f8e,
  SAND_COLOR: 0xd9b380,
  ROAD_COLOR: 0x404047,
  SIDEWALK_COLOR: 0x8d8578,
};

export const PLAYER = {
  WALK_SPEED: 6.5,
  RUN_SPEED: 11,
  TURN_SPEED: 9,
  RADIUS: 0.55,
  HEALTH_MAX: 100,
  // Cash lost on WASTED / BUSTED.
  DEATH_PENALTY: 150,
  BUST_PENALTY: 100,
};

export const CAR = {
  ACCEL: 16,
  BRAKE: 30,
  REVERSE_ACCEL: 10,
  MAX_SPEED: 34,
  MAX_REVERSE: 10,
  STEER_MAX: 0.55,
  STEER_SPEED: 2.4,
  DRAG: 0.55,
  LENGTH: 4.4,
  WIDTH: 2.0,
};

export const TRAFFIC = {
  COUNT: 14,
  SPEED: 9,
  // Pedestrians wandering the sidewalks.
  PED_COUNT: 22,
  PED_SPEED: 1.6,
};

export const POLICE = {
  // How many police units each wanted level fields.
  UNITS_PER_STAR: [0, 1, 2, 3, 4, 6],
  CAR_SPEED: 26,
  COP_SPEED: 7.2,
  RAM_DAMAGE: 6,
  // Seconds a cop must stay within BUST_RANGE of the player on foot to bust them.
  BUST_RANGE: 2.2,
  BUST_TIME: 2.5,
  // Seconds without a crime before the heat starts to cool, then seconds per star lost.
  COOL_DELAY: 18,
  COOL_PER_STAR: 10,
  SPAWN_DISTANCE: 55,
  DESPAWN_DISTANCE: 160,
};

export const COMBAT = {
  PISTOL_DAMAGE: 34,
  PISTOL_RANGE: 70,
  FIRE_INTERVAL: 0.22,
  ENEMY_HEALTH: 100,
  ENEMY_DAMAGE: 9,
  ENEMY_RANGE: 34,
  ENEMY_FIRE_INTERVAL: 1.1,
};

export const MISSIONS = {
  REWARDS: [200, 400, 500, 800, 2000],
};

// In-game clock: one game hour every 90 real seconds, starting at 18:20 (sunset).
export const CLOCK = {
  START_HOUR: 18,
  START_MINUTE: 20,
  SECONDS_PER_HOUR: 90,
};

export const SAVE_KEY = 'veldorabay-save-v1';
