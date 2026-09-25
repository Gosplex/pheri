// Exports the deterministic POI table so the multiplayer server can generate and verify jobs
// without building the 3D world. Run: npm run export:pois
import './stub.mjs';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { buildWorld } from '../src/world/world.js';
const world = await buildWorld(new THREE.Scene());
const pois = world.pois.map((p, i) => ({ i, name: p.name, kind: p.kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2), zone: p.zone, shop: !!p.shop, nightOpen: !!p.nightOpen }));
const sp = world.campus.spawn;
const hash = pois.length + ':' + Math.round(pois.reduce((a, p) => a + p.x * 3 + p.z * 7, 0));
writeFileSync(new URL('../server/data/world.json', import.meta.url), JSON.stringify({ hash, spawn: sp, fuel: world.props.fuelZones, pois }));
console.log('exported', pois.length, 'pois, hash', hash);
