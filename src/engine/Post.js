import * as THREE from '../../vendor/three.module.js';
import { EffectComposer } from '../../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from '../../vendor/jsm/postprocessing/ShaderPass.js';

// HDR render → bloom → tone mapping → cinematic grade (vignette, grain, fringing, sepia, damage flash).

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uSepia: { value: 0 }, uVignette: { value: 0.9 },
    uGrain: { value: 0.06 }, uAberr: { value: 0.0015 }, uHurt: { value: 0 }, uScan: { value: 0 }, uSlow: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSepia, uVignette, uGrain, uAberr, uHurt, uScan, uSlow; uniform vec3 uTint;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime * 7.13) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uAberr * 8.;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= uTint;
      // gentle S-curve + cool shadows / warm highlights
      float l = dot(col, vec3(.299,.587,.114));
      col = mix(col, col * vec3(.92,.96,1.08), (1. - l) * .35);
      col = mix(col, smoothstep(0., 1., col), .25);
      if (uSepia > 0.) {
        vec3 sep = vec3(l * 1.07 + .05, l * .9 + .02, l * .68);
        col = mix(col, sep, uSepia);
        // film scratches + flicker for old memories
        float sc = step(.997, rnd(vec2(floor(vUv.x * 300.), floor(uTime * 12.)))) * .25;
        col += sc * uSepia;
        col *= 1. - uSepia * .06 * rnd(vec2(floor(uTime * 20.), 1.));
      }
      // detective vision: cold desaturated read with a sweeping scanline
      if (uScan > 0.) {
        vec3 cold = vec3(l) * vec3(.55, .85, 1.15);
        float sweep = smoothstep(.02, 0., abs(fract(vUv.y * .5 - uTime * .35) - .5) - .47);
        col = mix(col, cold + col * .35, uScan * .75) + vec3(.2, .5, .7) * sweep * uScan * .25;
      }
      // slow-motion: crushed edges, slight warm push
      col = mix(col, col * vec3(1.08, 1.0, .9), uSlow * .5);
      col *= 1. - smoothstep(.15, .85, r2 * 2.2) * (uVignette + uSlow * .6) * .75;
      col += (rnd(vUv * 731.) - .5) * uGrain;
      col = mix(col, vec3(.7, .02, .05), uHurt * smoothstep(.05, .5, r2 * 2.));
      gl_FragColor = vec4(col, 1.);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.enabled = quality !== 'low';
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.enabled ? 4 : 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    if (this.enabled) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.75, 0.55, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.u = this.grade.uniforms;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  set(opts) {
    if (opts.sepia !== undefined) this.u.uSepia.value = opts.sepia;
    if (opts.bloom !== undefined && this.bloom) this.bloom.strength = opts.bloom;
    if (opts.tint) this.u.uTint.value.set(opts.tint);
  }

  render(dt, hurt, scan = 0, slow = 0) {
    this.u.uTime.value += dt;
    this.u.uHurt.value = hurt || 0;
    this.u.uScan.value = scan;
    this.u.uSlow.value = slow;
    this.composer.render(dt);
  }
}
