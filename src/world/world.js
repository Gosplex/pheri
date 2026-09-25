import * as THREE from 'three';
import { ChunkedBuilder } from '../core/geom.js';
import { SignAtlas, asphaltTexture, groundTexture, grassTexture, pavingTexture, waterNormalTexture, plasterTexture } from '../core/textures.js';
import { buildMapData, WORLD_BOUNDS, FUEL_STATIONS, LANDMARKS } from './mapData.js';
import { RoadNetwork } from './roadNetwork.js';
import { Grid, Collision, CELL } from './spatial.js';
import { buildRoads } from './roadMesh.js';
import { buildCity } from './buildings.js';
import { buildCampus } from './campus.js';
import { buildProps, updateSignalLights } from './props.js';
import { lerp } from '../core/rng.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function buildWorld(scene, progress = () => {}) {
  progress(0.05, 'Laying out Rajkot');
  const atlas = new SignAtlas();
  const tex = { plaster: plasterTexture(), asphalt: asphaltTexture(), ground: groundTexture(), grass: grassTexture(), paving: pavingTexture(), water: waterNormalTexture() };
  tex.ground.repeat.set(1, 1);

  const mats = {
    road: new THREE.MeshStandardMaterial({ map: tex.asphalt, vertexColors: true, roughness: 0.92, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1 }),
    marking: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }),
    walk: new THREE.MeshStandardMaterial({ map: tex.paving, vertexColors: true, roughness: 0.9 }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    building: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: null }),
    winLit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    winDark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.3 }),
    shopLit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    shopDay: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    sign: new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.1 }),
    grass: new THREE.MeshStandardMaterial({ map: tex.grass, vertexColors: true, roughness: 1 }),
    paved: new THREE.MeshStandardMaterial({ map: tex.paving, vertexColors: true, roughness: 0.9 }),
    ground: new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1 }),
    pothole: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4 }),
    water: new THREE.MeshStandardMaterial({ color: 0x3f7282, roughness: 0.08, metalness: 0.2, normalMap: tex.water, normalScale: new THREE.Vector2(0.4, 0.4), transparent: true, opacity: 0.92 }),
    vehicle: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 }),
    vehLights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  tex.water.repeat.set(6, 2);
  // pre-draw vehicle signage before the atlas is uploaded
  atlas.truckBack();

  mats.building.map = tex.plaster;
  const net = new RoadNetwork(buildMapData());
  const grid = new Grid(WORLD_BOUNDS, 1);
  const collision = new Collision(16);
  await tick();
  progress(0.15, 'Paving roads, painting kerbs');
  const roads = buildRoads(net, grid, mats, collision);
  await tick();

  // reserve special areas before the city fills in
  for (const st of FUEL_STATIONS) grid.fillRect(st.x, st.z, (st.id === 'pump_n' ? 30 : 40) / 2 + 1, (st.id === 'pump_n' ? 40 : 28) / 2 + 1, 0, CELL.RESERVED, [CELL.EMPTY]);
  grid.fillRect(320, 445, 170, 157, 0, CELL.RESERVED, [CELL.EMPTY]); // Race Course Garden + Khau Gali strip

  const B = {
    body: new ChunkedBuilder(240), winLit: new ChunkedBuilder(320), winDark: new ChunkedBuilder(320),
    shopLit: new ChunkedBuilder(400), shopDay: new ChunkedBuilder(400), signs: new ChunkedBuilder(320),
    grass: new ChunkedBuilder(200), paved: new ChunkedBuilder(200),
  };
  const pois = [];
  const ctx = { net, grid, collision, atlas, B, pois, mats, parkedSpots: [] };
  progress(0.3, 'Building Marwadi University');
  const campus = buildCampus(ctx);
  await tick();
  progress(0.45, 'Raising Sardar Bazaar, societies and Juni Pol');
  buildCity(ctx);
  await tick();
  progress(0.65, 'Planting neem trees, stringing wires');
  const props = buildProps(ctx, roads, campus);
  await tick();

  progress(0.8, 'Hanging shop boards');
  mats.sign.map = atlas.finalize();
  mats.sign.emissiveMap = mats.sign.map;
  mats.sign.needsUpdate = true;

  const root = new THREE.Group(); root.name = 'world';
  const add = (arr) => arr.forEach((m) => root.add(m));
  add(roads.meshes);
  add(B.body.buildMeshes(mats.building, { castShadow: true, receiveShadow: true, name: 'buildings' }));
  add(B.winLit.buildMeshes(mats.winLit, { name: 'windows-lit' }));
  add(B.winDark.buildMeshes(mats.winDark, { name: 'windows-dark' }));
  add(B.shopLit.buildMeshes(mats.shopLit, { name: 'shops-lit' }));
  add(B.shopDay.buildMeshes(mats.shopDay, { name: 'shops-day' }));
  add(B.signs.buildMeshes(mats.sign, { name: 'signs' }));
  add(B.grass.buildMeshes(mats.grass, { receiveShadow: true, name: 'grass' }));
  add(B.paved.buildMeshes(mats.paved, { receiveShadow: true, name: 'paved' }));
  root.add(props.group);
  root.add(props.nightGroup);
  if (campus.lake) root.add(campus.lake);

  // Ground plane
  const gw = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 1400, gd = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ + 1400;
  const gg = new THREE.PlaneGeometry(gw, gd); gg.rotateX(-Math.PI / 2);
  const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * gw / 14, uv.getY(i) * gd / 14);
  const ground = new THREE.Mesh(gg, mats.ground);
  ground.position.set((WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2, 0, (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) / 2);
  ground.receiveShadow = true;
  root.add(ground);
  scene.add(root);

  // world boundary: soft invisible wall
  const b = WORLD_BOUNDS;
  collision.addBox((b.minX + b.maxX) / 2, b.minZ - 2, (b.maxX - b.minX) / 2, 2, 0, 1, 'bound');
  collision.addBox((b.minX + b.maxX) / 2, b.maxZ + 2, (b.maxX - b.minX) / 2, 2, 0, 1, 'bound');
  collision.addBox(b.minX - 2, (b.minZ + b.maxZ) / 2, 2, (b.maxZ - b.minZ) / 2, 0, 1, 'bound');
  collision.addBox(b.maxX + 2, (b.minZ + b.maxZ) / 2, 2, (b.maxZ - b.minZ) / 2, 0, 1, 'bound');

  progress(0.9, 'Waking up the city');
  let meshCount = 0; root.traverse((o) => { if (o.isMesh) meshCount++; });

  const world = {
    root, net, grid, collision, atlas, mats, roads, campus, props, pois, meshCount, landmarks: LANDMARKS,
    surfaceAt(x, z) {
      const c = grid.get(x, z);
      if (c === CELL.ROAD || c === CELL.JUNCTION) return 'road';
      if (c === CELL.WALK || c === CELL.PAVED) return 'paved';
      if (c === CELL.GRASS) return 'grass';
      if (c === CELL.WATER) return 'water';
      return 'dirt';
    },
    update(dt, env, t) {
      const n = env.state.night;
      const cut = world.powerCut ? 1 : 0;
      const wet = env.wet;
      const dayWin = 0.2;
      mats.winLit.color.setScalar(lerp(dayWin, cut ? 0.12 : 1.0, n));
      mats.shopLit.color.setScalar(lerp(0.78, 1.15, n));
      mats.shopDay.color.setScalar(lerp(0.78, 0.07, n));
      mats.sign.emissiveIntensity = lerp(0.06, 0.8, n);
      mats.vehLights.color.setScalar(lerp(0.45, 1.8, n));
      if (cut) { props.lampMat.color.setScalar(0.2); props.poolMat.opacity = 0; mats.shopLit.color.setScalar(lerp(0.78, 0.45, n)); mats.sign.emissiveIntensity = lerp(0.06, 0.25, n); }
      else { props.lampMat.color.setRGB(lerp(0.35, 1.9, n), lerp(0.35, 1.6, n), lerp(0.35, 1.1, n)); props.poolMat.opacity = n * (0.6 + wet * 0.3); }
      if (props.fairyMat) { const blink = 0.8 + Math.sin(t * 3) * 0.2; props.fairyMat.color.setScalar(lerp(0.3, 1.6, n) * blink); }
      props.nightGroup.visible = n > 0.25 || env.time > 18 || env.time < 1;
      mats.road.roughness = lerp(0.92, 0.3, wet); mats.road.color.setScalar(lerp(1, 0.6, wet));
      mats.walk.roughness = lerp(0.9, 0.45, wet); mats.walk.color.setScalar(lerp(1, 0.75, wet));
      mats.ground.color.setScalar(lerp(1, 0.72, wet));
      tex.water.offset.x = t * 0.01; tex.water.offset.y = t * 0.006;
      if (world._sigT === undefined || (world._sigT += dt) > 0.2) { world._sigT = 0; updateSignalLights(net, props.signals, n); }
    },
  };
  progress(1, 'Ready');
  return world;
}
