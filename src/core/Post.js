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
  uniform sampler2D tAO;
  uniform float uAO;
  uniform vec3 uGradeMul, uLift;
  uniform float uSat, uContrast;
  uniform vec2 uSunUV;
  uniform float uSunVis;
  uniform vec3 uSunCol;
  uniform float uBlur;
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
    // speed: a radial blur towards the screen centre when you're flying down a flyover
    if (uBlur > 0.01) {
      vec2 dir = (vUv - 0.5) * uBlur * 0.06;
      vec3 acc = col;
      for (int i = 1; i <= 5; i++) acc += texture2D(tColor, vUv - dir * float(i)).rgb;
      col = acc / 6.0;
    }
    // ambient occlusion: contact shadows where walls meet the street, under cars and people
    if (uAO > 0.0) col *= mix(1.0, texture2D(tAO, vUv).r, uAO);
    col = mix(col, uInk, edge * 0.92);
    // glow from lamps, neon and lit windows (strong at night)
    if (uBloom > 0.0) col += texture2D(tBloom, vUv).rgb * uBloom;
    // the sun: a hazy glare around it when it's in view (and not behind a building), and lens ghosts
    if (uSunVis > 0.0) {
      float sky = step(uFar * 0.9, linZ(clamp(uSunUV, 0.001, 0.999)));
      float vis = uSunVis * sky;
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      float r = length((vUv - uSunUV) * asp);
      col += uSunCol * vis * (0.32 * exp(-r * 9.0) + 0.1 * exp(-r * 2.6));
      for (int k = 1; k <= 3; k++) {
        vec2 gp = uSunUV + (vec2(0.5) - uSunUV) * (float(k) * 0.55 + 0.25);
        float gr = length((vUv - gp) * asp);
        float sz = 0.025 + float(k) * 0.018;
        col += vec3(0.55 + 0.15 * float(k), 0.7, 0.9 - 0.12 * float(k)) * vis * 0.05 * smoothstep(sz, sz * 0.6, gr);
      }
    }

    // print finish: grain that ticks at ~10 fps, paper blotches, warm tint, vignette
    vec2 fc = gl_FragCoord.xy;
    float g = hash(floor(fc) + floor(uTime * 10.0) * 7.31) - 0.5;
    float blot = hash(floor(fc / 90.0)) - 0.5;
    col += g * uGrain + blot * 0.012;
    col = mix(col, col * uTint, 0.5);
    // time-of-day grade: golden hours run warm and rich, nights cool with punchy neon, rain greys out
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, uSat);
    col = (col - 0.5) * uContrast + 0.5;
    col = col * uGradeMul + uLift;
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

// Ambient occlusion at half resolution: a normal-oriented hemisphere of samples around each pixel's
// view-space position (normals come packed in the colour alpha; unpacked surfaces count as flat ground).
const aoFs = /* glsl */ `
  precision highp float;
  uniform sampler2D tDepth, tColor;
  uniform mat4 uProj, uInvProj, uView;
  uniform vec3 uKernel[12];
  uniform float uRadius;
  varying vec2 vUv;
  vec3 viewPos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
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
    float d = texture2D(tDepth, vUv).x;
    if (d >= 0.99995) { gl_FragColor = vec4(1.0); return; }
    vec3 P = viewPos(vUv);
    float a = texture2D(tColor, vUv).a;
    vec3 nW = a > 0.002 ? unpackN(a) : vec3(0.0, 1.0, 0.0);
    vec3 N = normalize((uView * vec4(nW, 0.0)).xyz);
    float ang = hash(gl_FragCoord.xy) * 6.2831853;
    vec3 rv = vec3(cos(ang), sin(ang), 0.0);
    vec3 T = normalize(rv - N * dot(rv, N));
    mat3 TBN = mat3(T, cross(N, T), N);
    float R = uRadius * clamp(-P.z / 10.0, 0.7, 2.5);
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
      vec3 s = P + TBN * uKernel[i] * R;
      vec4 o = uProj * vec4(s, 1.0);
      vec2 suv = o.xy / o.w * 0.5 + 0.5;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
      float sz = viewPos(suv).z;
      float range = smoothstep(0.0, 1.0, R / max(abs(P.z - sz), 1e-3));
      occ += (sz >= s.z + 0.03 * R ? 1.0 : 0.0) * range;
    }
    float ao = 1.0 - occ / 12.0;
    ao = mix(ao, 1.0, smoothstep(90.0, 220.0, -P.z));
    gl_FragColor = vec4(vec3(ao), 1.0);
  }
`;
const aoBlurFs = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc; uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float a = 0.0;
    for (int x = -1; x <= 2; x++) for (int y = -1; y <= 2; y++) a += texture2D(tSrc, vUv + (vec2(float(x), float(y)) - 0.5) * uTexel).r;
    gl_FragColor = vec4(vec3(a / 16.0), 1.0);
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
        tAO: { value: null }, uAO: { value: 0 },
        uGradeMul: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: new THREE.Vector3(0, 0, 0) }, uSat: { value: 1 }, uContrast: { value: 1 },
        uSunUV: { value: new THREE.Vector2(-1, -1) }, uSunVis: { value: 0 }, uSunCol: { value: new THREE.Color(1, 0.85, 0.6) },
        uBlur: { value: 0 },
      },
    });
    this.blur = 0;
    this.sunDir = null;
    this.sunStrength = 0;
    const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType, depthBuffer: false };
    const pass = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false, uniforms });
    if (opts.bloom) {
      this.bA = new THREE.WebGLRenderTarget(4, 4, lin);
      this.bB = new THREE.WebGLRenderTarget(4, 4, lin);
      this.brightMat = pass(brightFs, { tColor: { value: this.target.texture }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0.9 } });
      this.blurMat = pass(blurFs, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
      this.material.uniforms.tBloom.value = this.bA.texture;
    }
    if (opts.ssao) {
      this.aoA = new THREE.WebGLRenderTarget(4, 4, lin);
      this.aoB = new THREE.WebGLRenderTarget(4, 4, lin);
      const kernel = [];
      for (let i = 0; i < 12; i++) {
        const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 0.9 + 0.1).normalize();
        const s = i / 12;
        v.multiplyScalar(0.15 + 0.85 * s * s);
        kernel.push(v);
      }
      this.aoMat = pass(aoFs, {
        tDepth: { value: this.target.depthTexture }, tColor: { value: this.target.texture },
        uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uView: { value: new THREE.Matrix4() },
        uKernel: { value: kernel }, uRadius: { value: 0.9 },
      });
      this.aoBlurMat = pass(aoBlurFs, { tSrc: { value: this.aoA.texture }, uTexel: { value: new THREE.Vector2() } });
      this.material.uniforms.tAO.value = this.aoB.texture;
      this.material.uniforms.uAO.value = 0.8;
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
    if (this.aoA) {
      const aw = Math.max(1, Math.floor(w / 2)), ah = Math.max(1, Math.floor(h / 2));
      this.aoA.setSize(aw, ah); this.aoB.setSize(aw, ah);
      this.aoBlurMat.uniforms.uTexel.value.set(1 / aw, 1 / ah);
    }
  }

  // Colour grade by time of day (t: 0..1 day clock), night (0..1) and rain (0..1).
  grade(t, night, rain) {
    const u = this.material.uniforms;
    const golden = Math.max(0, 1 - Math.abs(t - 0.28) / 0.06) + Math.max(0, 1 - Math.abs(t - 0.75) / 0.07);
    const g = Math.min(1, golden);
    // day: a touch warm and rich; golden hour: orange haze; night: cool, with saturated lights
    const mul = new THREE.Vector3(1.02 + g * 0.08 - night * 0.06, 1.0 - g * 0.02 - night * 0.02, 0.97 - g * 0.12 + night * 0.08);
    mul.lerp(new THREE.Vector3(0.96, 0.98, 1.02), rain * 0.6);
    u.uGradeMul.value.copy(mul);
    u.uLift.value.set(0.006 + g * 0.02, 0.004 + g * 0.006, 0.01 + night * 0.02);
    u.uSat.value = 1.06 + g * 0.1 + night * 0.12 - rain * 0.25;
    u.uContrast.value = 1.04 + g * 0.04 - rain * 0.04;
    u.uSunCol.value.setRGB(1, 0.82 - g * 0.12, 0.58 - g * 0.2);
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
    if (this.aoA) {
      const au = this.aoMat.uniforms;
      au.uProj.value.copy(camera.projectionMatrix);
      au.uInvProj.value.copy(camera.projectionMatrixInverse);
      au.uView.value.copy(camera.matrixWorldInverse);
      this._pass(this.aoMat, this.aoA);
      this._pass(this.aoBlurMat, this.aoB);
      u.uAO.value = 0.8 - Look.uNight.value * 0.25;
    }
    // sun glare: where the sun is on screen, and how much of it to show
    if (this.sunDir && this.sunStrength > 0.01) {
      const p = this._sp || (this._sp = new THREE.Vector3());
      p.copy(camera.position).addScaledVector(this.sunDir, 1000).project(camera);
      const front = p.z < 1 && Math.abs(p.x) < 1.4 && Math.abs(p.y) < 1.4;
      u.uSunUV.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      u.uSunVis.value = front ? this.sunStrength * Math.min(1, 1.4 - Math.max(Math.abs(p.x), Math.abs(p.y)) * 0.6) : 0;
    } else u.uSunVis.value = 0;
    u.uBlur.value += (this.blur - u.uBlur.value) * 0.15;
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
