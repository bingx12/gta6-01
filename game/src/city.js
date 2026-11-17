// VELDORA BAY city builder: a sunset grid city with a beach, built from
// boxes and canvas textures — no model files. Roads run on a grid, blocks hold
// procedural towers with lit windows, palms line the beach, streetlights line
// the roads, and the east edge drops to sand and water. Returns the colliders
// and the landmark spots the missions and the HUD need.

import * as THREE from 'three';
import { WORLD } from './config.js';

const ROAD_POSITIONS = [-210, -140, -70, 0, 70, 140, 210];
const BLOCK_CENTERS = [-175, -105, -35, 35, 105, 175];
const BUILDING_COLORS = [0x9a8f7a, 0x7d8aa0, 0xa08a7d, 0x8a7f95, 0xb0a08a, 0x6f7f8a];
const ROOF_COLORS = [0x4a4238, 0x5a4a3a, 0x3f4a55, 0x6b5a48];

/** A canvas texture of a building face: dark glass with lit and unlit windows. */
function makeFacadeTexture(rng, baseColor, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = `#${baseColor.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 14;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? (rng.next() < 0.7 ? '#ffd27a' : '#9fd8ff') : '#20242e';
      g.fillRect(8 + c * 20, 10 + r * 17, 12, 10);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A canvas texture with a big sign line, for the landmark buildings. */
function makeSignTexture(text, bgColor, fgColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = bgColor;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = fgColor;
  g.font = 'bold 52px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePalm(rng) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5.5, 6), trunkMat);
  trunk.position.y = 2.75;
  trunk.rotation.z = rng.range(-0.08, 0.08);
  palm.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3a, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 4), leafMat);
    const angle = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 1.2, 5.6, Math.sin(angle) * 1.2);
    leaf.rotation.set(Math.sin(angle) * 1.1, 0, -Math.cos(angle) * 1.1);
    leaf.scale.set(1, 1, 0.25);
    palm.add(leaf);
  }
  return palm;
}

function makeStreetlight() {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6), poleMat);
  pole.position.y = 3.25;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), poleMat);
  arm.position.set(0.8, 6.4, 0);
  group.add(arm);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampMat);
  lamp.position.set(1.55, 6.35, 0);
  group.add(lamp);
  const light = new THREE.PointLight(0xffd27a, 12, 22, 1.8);
  light.position.set(1.55, 6.2, 0);
  group.add(light);
  return group;
}

/** Build the whole city into `scene`. Returns colliders and landmarks. */
export function buildCity(scene, rng) {
  const colliders = [];
  const landmarks = {};
  const group = new THREE.Group();
  scene.add(group);

  // Sunset sky dome: a gradient shader sphere, sun low in the west.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(WORLD.SKY_TOP) },
      horizon: { value: new THREE.Color(WORLD.SKY_HORIZON) },
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vPos; uniform vec3 top; uniform vec3 horizon; void main(){ float h = normalize(vPos).y * 0.5 + 0.5; gl_FragColor = vec4(mix(horizon, top, pow(max(h, 0.0), 0.6)), 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
  group.add(sky);

  // Sun disc low over the ocean, plus the light that makes the long shadows.
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 128;
  sunCanvas.height = 128;
  const sg = sunCanvas.getContext('2d');
  const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 236, 180, 1)');
  grad.addColorStop(0.35, 'rgba(255, 170, 90, 0.9)');
  grad.addColorStop(1, 'rgba(255, 120, 60, 0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 128, 128);
  const sunTexture = new THREE.CanvasTexture(sunCanvas);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture, transparent: true, depthWrite: false, fog: false }));
  sunSprite.scale.set(180, 180, 1);
  sunSprite.position.set(620, 95, -260);
  group.add(sunSprite);

  const sun = new THREE.DirectionalLight(WORLD.SUN_COLOR, WORLD.SUN_INTENSITY);
  sun.position.set(320, 140, -180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320;
  sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320;
  sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 900;
  group.add(sun);
  group.add(new THREE.AmbientLight(WORLD.AMBIENT_COLOR, WORLD.AMBIENT_INTENSITY));
  // Hemisphere fill so the shadow side of the street never goes black.
  group.add(new THREE.HemisphereLight(0xffc890, 0x4a3a55, 0.55));
  scene.fog = new THREE.Fog(WORLD.FOG_COLOR, WORLD.FOG_NEAR, WORLD.FOG_FAR);

  // Ground: one big slab for the city, sand past the beach line, water beyond.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x6f6a5e });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sandMat = new THREE.MeshLambertMaterial({ color: WORLD.SAND_COLOR });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(120, 700), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.BEACH_X + 30, 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const waterMat = new THREE.MeshLambertMaterial({ color: WORLD.WATER_COLOR, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 700), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.WATER_X + 220, 0.05, 0);
  group.add(water);

  // Roads: dark strips along every grid line, with dashed centre lines.
  const roadMat = new THREE.MeshLambertMaterial({ color: WORLD.ROAD_COLOR });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  const dashGeo = new THREE.PlaneGeometry(0.5, 3);
  for (const p of ROAD_POSITIONS) {
    for (const [w, h, x, z] of [[700, WORLD.ROAD_W, 0, p], [WORLD.ROAD_W, 700, p, 0]]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, h), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.03, z);
      road.receiveShadow = true;
      group.add(road);
    }
    // Centre dashes along both directions.
    for (let t = -330; t < 330; t += 12) {
      const d1 = new THREE.Mesh(dashGeo, dashMat);
      d1.rotation.x = -Math.PI / 2;
      d1.position.set(t, 0.05, p);
      group.add(d1);
      const d2 = new THREE.Mesh(dashGeo, dashMat);
      d2.rotation.x = -Math.PI / 2;
      d2.rotation.z = Math.PI / 2;
      d2.position.set(p, 0.05, t);
      group.add(d2);
    }
  }

  // Sidewalks: lighter strips hugging each road.
  const walkMat = new THREE.MeshLambertMaterial({ color: WORLD.SIDEWALK_COLOR });
  for (const p of ROAD_POSITIONS) {
    for (const off of [-WORLD.ROAD_W / 2 - 2.5, WORLD.ROAD_W / 2 + 2.5]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(700, 5), walkMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.04, p + off);
      strip.receiveShadow = true;
      group.add(strip);
      const strip2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 700), walkMat);
      strip2.rotation.x = -Math.PI / 2;
      strip2.position.set(p + off, 0.04, 0);
      strip2.receiveShadow = true;
      group.add(strip2);
    }
  }

  // Buildings: 1-3 towers per block, facades from shared canvas textures.
  const facades = BUILDING_COLORS.map((c) => makeFacadeTexture(rng, c, 0.45));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4238 });
  let buildingIndex = 0;
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      // The south-west block is the dock yard; the north-east block stays open plaza.
      if (bx === -175 && bz === 175) continue;
      if (bx === 175 && bz === -175) continue;
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(16, 26);
        const d = rng.range(16, 26);
        const h = rng.range(14, 62);
        const x = bx + rng.range(-14, 14);
        const z = bz + rng.range(-14, 14);
        const facade = facades[buildingIndex % facades.length];
        buildingIndex += 1;
        const mat = new THREE.MeshLambertMaterial({ map: facade });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(x, h / 2, z);
        tower.castShadow = true;
        tower.receiveShadow = true;
        group.add(tower);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
        roof.position.set(x, h + 0.4, z);
        group.add(roof);
        // Rooftop box (AC unit / stairwell) for silhouette variety.
        if (rng.chance(0.6)) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(rng.range(3, 6), rng.range(2, 4), rng.range(3, 6)), roofMat);
          box.position.set(x + rng.range(-4, 4), h + 1.6, z + rng.range(-4, 4));
          group.add(box);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }

  // Landmarks with signs: hospital (north), police station (centre), safehouse (west).
  // The body wears a window facade like any tower; the sign rides on its front.
  function addLandmark(text, bg, fg, x, z, w, h, d, key) {
    const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg) });
    const bodyMat = new THREE.MeshLambertMaterial({ map: makeFacadeTexture(rng, 0x8a7f6a, 0.4) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.set(x, h / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 2.2), signMat);
    sign.position.set(x, h - 2.5, z + d / 2 + 0.06);
    group.add(sign);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    landmarks[key] = { x, z };
  }
  addLandmark('VELDORA GENERAL', '#7a1f1f', '#ffffff', -35, -175, 34, 26, 24, 'hospital');
  addLandmark('VBPD', '#1f2a5a', '#ffffff', 35, 35, 30, 20, 22, 'policeStation');
  addLandmark('SAFEHOUSE', '#1f5a2a', '#ffffff', -175, -35, 24, 12, 20, 'safehouse');
  landmarks.docks = { x: -175, z: 210 };
  landmarks.warehouse = { x: 175, z: 175 };
  landmarks.plaza = { x: 175, z: -175 };
  landmarks.beach = { x: 268, z: -40 };

  // Dock yard: shipping containers + a pier at the south-west block.
  const containerColors = [0xb0402e, 0x2e6ab0, 0x3a8a4a, 0xc08a2e, 0x7a3ab0];
  for (let i = 0; i < 10; i += 1) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(12, 2.6, 2.6),
      new THREE.MeshLambertMaterial({ color: containerColors[i % containerColors.length] }),
    );
    c.position.set(-195 + (i % 5) * 14, 1.3 + (i >= 5 ? 2.6 : 0), 195 + Math.floor(i / 5) * 8);
    c.rotation.y = (i % 2) * 0.12;
    c.castShadow = true;
    group.add(c);
    colliders.push({ minX: c.position.x - 6, maxX: c.position.x + 6, minZ: c.position.z - 1.3, maxZ: c.position.z + 1.3 });
  }
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b543a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 60), pierMat);
  pier.position.set(-175, 0.6, 252);
  group.add(pier);

  // Warehouse block (north-east): big low shed, the heist drop-off.
  const shed = new THREE.Mesh(
    new THREE.BoxGeometry(40, 10, 26),
    new THREE.MeshLambertMaterial({ map: makeFacadeTexture(rng, 0x5a5f6a, 0.3) }),
  );
  shed.position.set(175, 5, 175);
  shed.castShadow = true;
  group.add(shed);
  colliders.push({ minX: 155, maxX: 195, minZ: 162, maxZ: 188 });
  const shedSign = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 2.2),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('BAY 12 WAREHOUSE', '#222831', '#ffd27a') }),
  );
  shedSign.position.set(175, 8.5, 188.06);
  group.add(shedSign);

  // Palms along the beach and a few on the plaza.
  for (let z = -300; z <= 300; z += 28) {
    const palm = makePalm(rng);
    palm.position.set(WORLD.BEACH_X + 8 + rng.range(-3, 3), 0, z + rng.range(-4, 4));
    group.add(palm);
  }
  for (let i = 0; i < 8; i += 1) {
    const palm = makePalm(rng);
    palm.position.set(155 + rng.range(-14, 14), 0, -195 + rng.range(-14, 14));
    group.add(palm);
  }

  // Streetlights along the roads.
  for (const p of ROAD_POSITIONS) {
    for (let t = -280; t <= 280; t += 70) {
      const light = makeStreetlight();
      light.position.set(t, 0, p + WORLD.ROAD_W / 2 + 1.2);
      group.add(light);
      const light2 = makeStreetlight();
      light2.position.set(p + WORLD.ROAD_W / 2 + 1.2, 0, t);
      light2.rotation.y = Math.PI / 2;
      group.add(light2);
    }
  }

  // A few benches and hydrants for street detail.
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x4a3a28 });
  for (let i = 0; i < 14; i += 1) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
    bench.position.set(rng.pick(ROAD_POSITIONS) + 10.5, 0.45, rng.range(-280, 280));
    group.add(bench);
  }

  return {
    colliders,
    landmarks,
    roads: ROAD_POSITIONS,
    update(dt, time) {
      // Gentle water shimmer.
      water.position.y = 0.05 + Math.sin(time * 0.7) * 0.06;
      sunSprite.material.opacity = 0.9 + Math.sin(time * 0.3) * 0.1;
    },
  };
}
