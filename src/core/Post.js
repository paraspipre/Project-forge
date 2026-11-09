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
  uniform sampler2D tBloom;
  uniform float uBloom;
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
    // glow from lamps, neon and lit windows (strong at night)
    if (uBloom > 0.0) col += texture2D(tBloom, vUv).rgb * uBloom;

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

// Bloom: a bright-pass at quarter resolution, blurred twice; FXAA smooths the final image.
const brightFs = /* glsl */ `
  precision highp float;
  uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThresh;
  varying vec2 vUv;
  void main() {
    vec3 c = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(float(i - (i / 2) * 2) - 0.5, float(i / 2) - 0.5) * uTexel * 2.0;
      vec3 s = texture2D(tColor, vUv + o).rgb;
      float m = max(s.r, max(s.g, s.b));
      c += s * smoothstep(uThresh, uThresh + 0.12, m);
    }
    gl_FragColor = vec4(c * 0.25, 1.0);
  }
`;
const blurFs = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc; uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
    c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
    c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
    gl_FragColor = vec4(c, 1.0);
  }
`;
const fxaaFs = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc; uniform vec2 uRes;
  varying vec2 vUv;
  void main() {
    vec2 inv = 1.0 / uRes;
    vec3 nw = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * inv).rgb, ne = texture2D(tSrc, vUv + vec2(1.0, -1.0) * inv).rgb;
    vec3 sw = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * inv).rgb, se = texture2D(tSrc, vUv + vec2(1.0, 1.0) * inv).rgb;
    vec3 m = texture2D(tSrc, vUv).rgb;
    vec3 L = vec3(0.299, 0.587, 0.114);
    float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
    float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
    vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
    float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
    dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * inv;
    vec3 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
    float lb = dot(b, L);
    gl_FragColor = vec4((lb < lmin || lb > lmax) ? a : b, 1.0);
  }
`;

export class Post {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.opts = opts;
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
        tBloom: { value: null }, uBloom: { value: 0 },
      },
    });
    const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType, depthBuffer: false };
    const pass = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false, uniforms });
    if (opts.bloom) {
      this.bA = new THREE.WebGLRenderTarget(4, 4, lin);
      this.bB = new THREE.WebGLRenderTarget(4, 4, lin);
      this.brightMat = pass(brightFs, { tColor: { value: this.target.texture }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0.9 } });
      this.blurMat = pass(blurFs, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
      this.material.uniforms.tBloom.value = this.bA.texture;
    }
    if (opts.fxaa) {
      this.comp = new THREE.WebGLRenderTarget(4, 4, lin);
      this.fxaaMat = pass(fxaaFs, { tSrc: { value: this.comp.texture }, uRes: { value: new THREE.Vector2() } });
    }
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
    this.w = w; this.h = h;
    if (this.bA) {
      const bw = Math.max(1, Math.floor(w / 4)), bh = Math.max(1, Math.floor(h / 4));
      this.bA.setSize(bw, bh); this.bB.setSize(bw, bh);
      this.brightMat.uniforms.uTexel.value.set(1 / w, 1 / h);
      this.bw = bw; this.bh = bh;
    }
    if (this.comp) { this.comp.setSize(w, h); this.fxaaMat.uniforms.uRes.value.set(w, h); }
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCam);
  }

  render(scene, camera) {
    const r = this.renderer, u = this.material.uniforms;
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    if (this.bA) {
      const night = Look.uNight.value;
      this.brightMat.uniforms.uThresh.value = 0.93 - night * 0.3;
      u.uBloom.value = 0.12 + night * 0.85;
      this._pass(this.brightMat, this.bA);
      const bu = this.blurMat.uniforms;
      for (const s of [1, 2.2]) {
        bu.tSrc.value = this.bA.texture; bu.uDir.value.set(s / this.bw, 0); this._pass(this.blurMat, this.bB);
        bu.tSrc.value = this.bB.texture; bu.uDir.value.set(0, s / this.bh); this._pass(this.blurMat, this.bA);
      }
    }
    this._pass(this.material, this.comp || null);
    if (this.comp) this._pass(this.fxaaMat, null);
  }
}
