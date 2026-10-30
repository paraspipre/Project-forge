import * as THREE from '../../vendor/three.module.js';

// Night sky dome (gradient + drifting storm clouds + haloed moon + lightning), a distant
// city skyline with lit windows, and a matching PMREM environment map so wet and metallic
// surfaces reflect the same sky.

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`;
const skyFrag = `
  uniform vec3 uTop, uHorizon, uGlow, uMoonDir, uMoonCol; uniform float uTime, uFlash, uClouds, uStars;
  varying vec3 vDir;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float y = max(d.y, 0.);
    vec3 col = mix(uHorizon, uTop, pow(y, .55));
    col += uGlow * pow(1. - y, 6.) * .9;                     // city glow on the horizon
    float md = max(dot(d, normalize(uMoonDir)), 0.);
    // clouds, lit from below by the city and from behind by the moon
    vec2 uv = d.xz / (d.y + .25) * 1.6 + vec2(uTime * .012, uTime * .004);
    float c = smoothstep(.42, .85, fbm(uv)) * uClouds * smoothstep(0., .25, d.y);
    float stars = step(.997, h(floor(d.xz / (d.y + .3) * 220.))) * uStars * (1. - c) * y;
    col += stars;
    col += uMoonCol * (smoothstep(.9986, .9992, md) * 3. + pow(md, 60.) * .5 + pow(md, 8.) * .12) * (1. - c * .85);
    vec3 cloudCol = mix(uHorizon * 1.4 + uGlow * .3, uMoonCol * .35 + uTop, pow(md, 4.) * .6);
    col = mix(col, cloudCol, c * .85);
    col += vec3(.75, .8, 1.) * uFlash * (.6 + c * 1.6);
    gl_FragColor = vec4(col, 1.);
    #include <colorspace_fragment>
  }`;

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
  for (let y = 4; y < 256; y += 9) for (let x = 4; x < 128; x += 7) {
    if (Math.random() < 0.18) {
      const w = 0.4 + Math.random() * 0.6;
      g.fillStyle = `rgba(255,${190 + Math.random() * 50 | 0},${110 + Math.random() * 60 | 0},${w})`;
      g.fillRect(x, y, 4, 5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Sky {
  constructor(renderer, scene, env, parent, quality) {
    this.scene = scene;
    this.group = new THREE.Group();
    parent.add(this.group);
    const top = new THREE.Color(env.skyTop || env.sky || '#0a0814');
    const horizon = new THREE.Color(env.skyHorizon || env.fog || '#2a1f3a');
    const glow = new THREE.Color(env.cityGlow || '#5a3a40');
    const moonDir = new THREE.Vector3(...(env.moonDir || [-0.5, 0.45, -0.75]));
    this.uniforms = {
      uTop: { value: top }, uHorizon: { value: horizon }, uGlow: { value: glow },
      uMoonDir: { value: moonDir }, uMoonCol: { value: new THREE.Color(env.moonColor || '#dfe6ff') },
      uTime: { value: 0 }, uFlash: { value: 0 }, uClouds: { value: env.clouds ?? 1 }, uStars: { value: env.rain ? 0 : 1 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    scene.background = null;

    // distant skyline ring (not affected by fog; tinted to sit in the haze)
    if (env.skyline !== false) {
      const tex = windowTexture();
      const n = quality === 'low' ? 40 : 90;
      const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const mat = new THREE.MeshBasicMaterial({ color: horizon.clone().multiplyScalar(0.3), fog: false });
      const winMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.4 });
      const towers = new THREE.InstancedMesh(geo, mat, n);
      const wins = new THREE.InstancedMesh(geo, winMat, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.05;
        const r = 95 + Math.random() * 40;
        const h = 10 + Math.random() * 35 + (Math.random() < 0.1 ? 30 : 0);
        const w = 5 + Math.random() * 9;
        q.setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0));
        m.compose(new THREE.Vector3(Math.cos(a) * r, -1, Math.sin(a) * r), q, new THREE.Vector3(w, h, w));
        towers.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(Math.cos(a) * (r - 0.1), -1, Math.sin(a) * (r - 0.1)), q, new THREE.Vector3(w * 1.002, h * 0.98, w * 1.002));
        wins.setMatrixAt(i, m);
      }
      towers.frustumCulled = wins.frustumCulled = false;
      this.skyline = new THREE.Group();
      this.skyline.add(towers, wins);
      this.group.add(this.skyline);
    }

    // environment map for reflections: the same sky + a few warm "street light" panels
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uClouds: { value: 0.6 }, uFlash: { value: 0 }, uStars: { value: 0 } }, vertexShader: skyVert.replace('p.xyww', 'p'), fragmentShader: skyFrag, side: THREE.BackSide,
    }));
    envScene.add(envDome);
    const lampCol = new THREE.Color(env.envLights || '#ffb060').multiplyScalar(env.flashback ? 3 : 2.2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5), new THREE.MeshBasicMaterial({ color: lampCol, side: THREE.DoubleSide }));
      panel.position.set(Math.cos(a) * 30, 4 + (i % 2) * 3, Math.sin(a) * 30);
      panel.lookAt(0, 0, 0);
      envScene.add(panel);
    }
    this.envRT = pm.fromScene(envScene, 0.02);
    scene.environment = this.envRT.texture;
    pm.dispose();
    envDome.geometry.dispose();
  }

  setFlash(f) { this.uniforms.uFlash.value = f; }

  update(t, camPos) {
    this.uniforms.uTime.value = t;
    this.dome.position.copy(camPos);
    if (this.skyline) this.skyline.position.set(camPos.x * 0.9, 0, camPos.z * 0.9);
  }

  dispose() {
    this.envRT.dispose();
    this.scene.environment = null;
  }
}
