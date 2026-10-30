import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from '../../vendor/jsm/libs/meshopt_decoder.module.js';

// glTF/GLB loading with a shared cache. Supports Draco and Meshopt compression, which
// optimisers like gltf-transform and most AI 3D generators can output.
// Loads are kicked off per scene (preload) so building actors and props stays synchronous.

const vendor = new URL('../../vendor/jsm/', import.meta.url).href;
const draco = new DRACOLoader().setDecoderPath(`${vendor}libs/draco/gltf/`);
const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);

const cache = new Map();   // url -> Promise<gltf | null>
const ready = new Map();   // url -> gltf (or null if it failed)

export function loadModel(url) {
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          // skinned meshes animate outside their bind-pose bounds
          if (o.isSkinnedMesh) o.frustumCulled = false;
        }
      });
      ready.set(url, gltf);
      return gltf;
    }).catch((e) => {
      console.warn(`Model failed to load: ${url}`, e);
      ready.set(url, null);
      return null;
    }));
  }
  return cache.get(url);
}

// Synchronous access once a model has been preloaded; undefined if not loaded (yet).
export const getModel = (url) => ready.get(url);

export function preloadModels(urls) {
  return Promise.all([...new Set(urls.filter(Boolean))].map(loadModel));
}

// Every model a story needs for one scene: its characters (including animation packs) and props.
export function sceneModelUrls(story, scene) {
  const urls = [];
  const addChar = (id) => {
    const look = story.characters[id]?.look;
    if (look?.model) urls.push(look.model, ...(look.animationFiles || []));
  };
  addChar(scene.playAs || story.player);
  for (const n of scene.npcs || []) addChar(n.character || n.id);
  for (const w of Object.values(scene.waves || {})) for (const e of w.enemies) addChar(e.character);
  const walk = (steps) => {
    for (const st of steps || []) {
      if (st.do === 'npcAdd') addChar(st.character || st.id);
      walk(st.then); walk(st.else); walk(st.talk);
      for (const c of st.choices || []) walk(c.then);
    }
  };
  walk(scene.intro);
  for (const n of scene.npcs || []) walk(n.talk);
  for (const it of scene.interactables || []) walk(it.script);
  for (const t of scene.triggers || []) walk(t.script);
  for (const w of Object.values(scene.waves || {})) walk(w.onClear);
  for (const p of scene.props || []) if (p.type === 'model') urls.push(p.src);
  return urls;
}

// Uniform scale + offset so a model stands on y=0 at the requested height (metres).
export function fitToHeight(obj, height) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const h = box.max.y - box.min.y;
  if (h > 0 && height) obj.scale.multiplyScalar(height / h);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj, true);
  obj.position.y -= b2.min.y;
  return b2;
}
