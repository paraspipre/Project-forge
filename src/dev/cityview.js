// Dev viewer: ?zone=central&cam=x,y,z&look=x,y,z&t=0.5&q=high  (drag to orbit, wheel to zoom, WASD to pan)
import * as THREE from 'three';
import { Renderer } from '../core/Renderer.js';
import { City } from '../world/City.js';
import { Sky, Atmosphere } from '../world/Sky.js';
import { buildLandmarks, finishLandmarks } from '../world/landmarks/index.js';
import { Signs } from '../world/Signs.js';

const P = new URLSearchParams(location.search);
const zone = P.get('zone') || 'central';
const v3 = (s, d) => (s ? new THREE.Vector3(...s.split(',').map(Number)) : d);
const ren = new Renderer(document.getElementById('c'), P.get('q') || 'high');
const info = document.getElementById('info');
ren.r.info.autoReset = false;

const data = await (await fetch(`../data/zones/${zone}.json`)).json();
const city = new City(data, ren.quality);
const lms = buildLandmarks(zone, city);
ren.scene.add(city.build());
finishLandmarks(city, lms, zone);
for (const l of lms) ren.scene.add(l.object);
const signs = new Signs(city, data);
ren.scene.add(signs.group);
const sky = new Sky(ren.scene);
if (P.get('lambert')) city.group.children[0].material = new THREE.MeshLambertMaterial({ color: 0xddccaa });
const atmo = new Atmosphere(ren, sky);
if (P.get('t')) atmo.override = +P.get('t');
if (P.get('rain')) atmo.forceRain = +P.get('rain');

const cam = ren.camera;
const look = v3(P.get('look'), new THREE.Vector3(0, 0, 0));
cam.position.copy(v3(P.get('cam'), new THREE.Vector3(60, 40, 60)));
cam.lookAt(look);
let sph = new THREE.Spherical().setFromVector3(cam.position.clone().sub(look));
let drag = null;
addEventListener('pointerdown', (e) => (drag = [e.clientX, e.clientY]));
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  sph.theta -= (e.clientX - drag[0]) * 0.005; sph.phi = Math.min(1.55, Math.max(0.05, sph.phi - (e.clientY - drag[1]) * 0.005));
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => (sph.radius *= e.deltaY > 0 ? 1.1 : 0.9));
const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));

let frames = 0, acc = 0;
window.__ready = false;
function loop() {
  const dt = Math.min(0.05, ren.clock.getDelta());
  const f = new THREE.Vector3(Math.sin(sph.theta), 0, Math.cos(sph.theta)).multiplyScalar(-1);
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const sp = sph.radius * dt;
  if (keys.has('KeyW')) look.addScaledVector(f, sp);
  if (keys.has('KeyS')) look.addScaledVector(f, -sp);
  if (keys.has('KeyA')) look.addScaledVector(r, -sp);
  if (keys.has('KeyD')) look.addScaledVector(r, sp);
  cam.position.copy(look).add(new THREE.Vector3().setFromSpherical(sph));
  cam.lookAt(look);
  atmo.update(dt);
  sky.update(dt, cam.position);
  city.update(cam.position);
  ren.followShadow(cam.position.clone().lerp(look, 0.3));
  ren.r.info.reset();
  ren.render();
  frames++; acc += dt;
  if (acc > 0.5) {
    info.textContent = `${zone} fps ${(frames / acc).toFixed(0)} calls ${ren.r.info.render.calls} tris ${(ren.r.info.render.triangles / 1e3).toFixed(0)}k  build ${city.buildMs.toFixed(0)}ms trees ${city.treeCount} ${atmo.timeString()}  look ${look.x.toFixed(0)},${look.z.toFixed(0)}`;
    frames = 0; acc = 0;
  }
  window.__ready = true;
  window.__city = city; window.__ren = ren;
  requestAnimationFrame(loop);
}
loop();
