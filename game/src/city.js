// Veldora Bay itself: a procedural sunset city — street grid, towers with
// lit windows, palms, streetlights, a beach and ocean, long shadows.
// Nothing here is a loaded asset; every mesh is built from primitives.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { makeRng, range, pick } from './random.js';

function windowTexture(rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 12) {
    for (let x = 4; x < 60; x += 10) {
      const lit = rng() < 0.55;
      ctx.fillStyle = lit ? '#ffd27a' : '#20242e';
      ctx.fillRect(x, y, 6, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function roadCoord(index) {
  // Centre line of the road that runs along block edge `index`.
  const pitch = CITY.blockSize + CITY.roadWidth;
  return (index - (CITY.blocks - 1) / 2) * pitch;
}

export function isOnRoad(x, z) {
  const pitch = CITY.blockSize + CITY.roadWidth;
  const halfRoad = CITY.roadWidth / 2 + 1.2;
  for (let i = 0; i < CITY.blocks; i += 1) {
    const c = roadCoord(i);
    if (Math.abs(x - c) < halfRoad || Math.abs(z - c) < halfRoad) return true;
  }
  return false;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'veldora-bay';

  const sky = new THREE.Color(PALETTE.skyBottom);
  scene.background = sky;
  scene.fog = new THREE.Fog(PALETTE.fog, 120, 420);

  const ambient = new THREE.AmbientLight(PALETTE.ambient, 0.8);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x5a4a6a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
  sun.position.set(-90, 70, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.camera.far = 420;
  scene.add(sun);
  // A low glowing disc on the horizon, due west over the ocean.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(16, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false }),
  );
  sunDisc.position.set(240, 26, -40);
  sunDisc.lookAt(0, 26, -40);
  scene.add(sunDisc);

  const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Beach strip and ocean to the east.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 420),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachX + 22, 0.05, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 700),
    new THREE.MeshStandardMaterial({ color: PALETTE.ocean, roughness: 0.25, metalness: 0.1 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(CITY.beachX + 160, 0.02, 0);
  group.add(ocean);

  // Roads: dark strips along every grid line, plus pale sidewalks.
  const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.road, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  const span = CITY.half * 2 + 40;
  for (let i = 0; i < CITY.blocks; i += 1) {
    const c = roadCoord(i);
    for (const [w, mat, y] of [
      [CITY.roadWidth, roadMat, 0.08],
      [CITY.roadWidth + 6, walkMat, 0.04],
    ]) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(span, w), mat);
      a.rotation.x = -Math.PI / 2;
      a.position.set(0, y, c);
      a.receiveShadow = true;
      group.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, span), mat);
      b.rotation.x = -Math.PI / 2;
      b.position.set(c, y, 0);
      b.receiveShadow = true;
      group.add(b);
    }
  }

  // Towers: one per block cell, height and colour from the seeded rng.
  const tex = windowTexture(rng);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let bx = 0; bx < CITY.blocks - 1; bx += 1) {
    for (let bz = 0; bz < CITY.blocks - 1; bz += 1) {
      const cx = (roadCoord(bx) + roadCoord(bx + 1)) / 2;
      const cz = (roadCoord(bz) + roadCoord(bz + 1)) / 2;
      const w = range(rng, 22, 34);
      const d = range(rng, 22, 34);
      const h = range(rng, 14, 58);
      const colour = pick(rng, PALETTE.building);
      const mat = new THREE.MeshStandardMaterial({
        color: colour, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex,
        emissiveIntensity: 0.55,
      });
      const tower = new THREE.Mesh(boxGeo, mat);
      tower.scale.set(w, h, d);
      tower.position.set(cx, h / 2, cz);
      tower.castShadow = true;
      tower.receiveShadow = true;
      group.add(tower);
      // A rooftop rim so the skyline reads at sunset.
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(w + 1.2, 1, d + 1.2),
        new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 1 }),
      );
      rim.position.set(cx, h + 0.5, cz);
      group.add(rim);
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }
  }

  // Palms along the beach and the main avenue.
  const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf, roughness: 0.9 });
  function palm(x, z) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 7, 7), trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    p.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 7.4, Math.sin(a) * 1.1);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      p.add(leaf);
    }
    p.position.set(x, 0, z);
    group.add(p);
  }
  for (let z = -160; z <= 160; z += 20) {
    palm(CITY.beachX - 6, z + range(rng, -4, 4));
    if (rng() < 0.6) palm(roadCoord(2) + 9, z);
  }

  // Streetlights at every intersection.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lights = [];
  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      const x = roadCoord(i) + 7;
      const z = roadCoord(j) + 7;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6), poleMat);
      pole.position.set(x, 3.25, z);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), lampMat);
      lamp.position.set(x, 6.6, z);
      group.add(lamp);
      lights.push(new THREE.Vector3(x, 6.6, z));
    }
  }

  // The docks: wooden pier, crates and containers at the south edge.
  const dockGroup = new THREE.Group();
  dockGroup.name = 'docks';
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 26), pierMat);
  pier.position.set(-40, 0.6, CITY.dockZ - 8);
  pier.castShadow = true;
  pier.receiveShadow = true;
  dockGroup.add(pier);
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 });
  const contCols = [0xb04030, 0x2e6fb0, 0x4a8a3a, 0xc98a2a];
  for (let i = 0; i < 10; i += 1) {
    const isCrate = rng() < 0.5;
    const w = isCrate ? 3 : 8;
    const h = isCrate ? 3 : 3.4;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 3.4),
      new THREE.MeshStandardMaterial({ color: isCrate ? 0x8a6a3a : pick(rng, contCols), roughness: 0.9 }),
    );
    mesh.position.set(-72 + i * 7 + range(rng, -1, 1), h / 2 + 1.2, CITY.dockZ - 6 + range(rng, -4, 6));
    mesh.castShadow = true;
    dockGroup.add(mesh);
    colliders.push({
      minX: mesh.position.x - w / 2, maxX: mesh.position.x + w / 2,
      minZ: mesh.position.z - 1.7, maxZ: mesh.position.z + 1.7,
    });
  }
  void crateMat;
  group.add(dockGroup);

  scene.add(group);
  return { group, colliders, lights, dockPos: new THREE.Vector3(-40, 0, CITY.dockZ - 8) };
}
