import * as THREE from 'three';
import { Look } from './Toon.js';

// The comic pass: renders the scene into a target with a depth texture, then inks it.
//  - silhouettes: discontinuities in 1/z (planes are affine in 1/z, so grazing ground doesn't ink)
//  - creases: the world normal the toon shader packed into alpha
//  - lines thin out and lighten with distance so the skyline doesn't turn to mush
//  - finished with paper grain, a faint warm print tint and a soft vignette

const vs = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fs = /* glsl */ `
  precision highp float;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform float uNear, uFar, uThick, uTime, uGrain, uInkFar, uFlash;
  uniform vec3 uInk;
  uniform vec3 uTint;
  varying vec2 vUv;

  float linZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return (uNear * uFar) / (uFar - d * (uFar - uNear));
  }
  vec3 unpackN(float a) {
    float code = floor(a * 255.0 + 0.5) - 1.0;
    float ix = floor(code / 16.0), iy = code - ix * 16.0;
    vec2 e = vec2((ix + 0.5) / 15.0, (iy + 0.5) / 16.0) * 2.0 - 1.0;
    vec3 n = vec3(e.x, 1.0 - abs(e.x) - abs(e.y), e.y);
    float t = max(-n.y, 0.0);
    n.x += n.x >= 0.0 ? -t : t;
    n.z += n.z >= 0.0 ? -t : t;
    return normalize(n);
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 px = uThick / uRes;
    vec4 c = texture2D(tColor, vUv);
    vec4 cl = texture2D(tColor, vUv - vec2(px.x, 0.0));
    vec4 cr = texture2D(tColor, vUv + vec2(px.x, 0.0));
    vec4 cu = texture2D(tColor, vUv + vec2(0.0, px.y));
    vec4 cd = texture2D(tColor, vUv - vec2(0.0, px.y));
    float zc = linZ(vUv);
    float wc = 1.0 / zc;
    float wl = 1.0 / linZ(vUv - vec2(px.x, 0.0)), wr = 1.0 / linZ(vUv + vec2(px.x, 0.0));
    float wu = 1.0 / linZ(vUv + vec2(0.0, px.y)), wd = 1.0 / linZ(vUv - vec2(0.0, px.y));
    float lap = abs(wl + wr - 2.0 * wc) + abs(wu + wd - 2.0 * wc);
    float edge = smoothstep(0.035, 0.09, lap / wc);

    // creases from packed normals (alpha 0 = surface opted out of inking)
    if (c.a > 0.002) {
      vec3 n = unpackN(c.a);
      float e = 0.0;
      if (cl.a > 0.002) e = max(e, 1.0 - dot(n, unpackN(cl.a)));
      if (cr.a > 0.002) e = max(e, 1.0 - dot(n, unpackN(cr.a)));
      if (cu.a > 0.002) e = max(e, 1.0 - dot(n, unpackN(cu.a)));
      if (cd.a > 0.002) e = max(e, 1.0 - dot(n, unpackN(cd.a)));
      edge = max(edge, smoothstep(0.22, 0.4, e));
    }
    // ink fades into the haze with distance; the sky never inks itself
    float far = smoothstep(uInkFar * 0.25, uInkFar, zc);
    edge *= mix(1.0, 0.3, far) * step(zc, uFar * 0.98 + 1.0) ;
    vec3 col = c.rgb;
    col = mix(col, uInk, edge * 0.92);

    // print finish: grain that ticks at ~10 fps, paper blotches, warm tint, vignette
    vec2 fc = gl_FragCoord.xy;
    float g = hash(floor(fc) + floor(uTime * 10.0) * 7.31) - 0.5;
    float blot = hash(floor(fc / 90.0)) - 0.5;
    col += g * uGrain + blot * 0.012;
    col = mix(col, col * uTint, 0.5);
    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * 0.32;
    col = mix(col, vec3(1.0), uFlash);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.UnsignedByteType,
      depthTexture: new THREE.DepthTexture(4, 4, THREE.UnsignedIntType),
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        uRes: { value: new THREE.Vector2(4, 4) },
        uNear: { value: 0.3 }, uFar: { value: 3000 },
        uThick: { value: 1 }, uTime: Look.uTime, uGrain: { value: 0.035 },
        uInkFar: { value: 900 }, uFlash: { value: 0 },
        uInk: Look.uInk, uTint: { value: new THREE.Color(1.0, 0.97, 0.9) },
      },
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g, this.material);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h, pixelRatio) {
    this.target.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
    // ~1.3px lines at 1080p, scaled with resolution
    this.material.uniforms.uThick.value = Math.max(1, (h / 1080) * 1.3 * Math.min(pixelRatio, 1.5));
  }

  render(scene, camera) {
    const r = this.renderer, u = this.material.uniforms;
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}
