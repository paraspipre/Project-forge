import * as THREE from 'three';

// Comic / Moebius-style material: flat albedo, a hard lit/shadow split (sun + shadow map),
// a cool tinted shadow colour, fine world-space hatching inside shadows, and the world
// normal packed into alpha so the post pass (Post.js) can ink creases as well as silhouettes.
//
// Options switch on extra features per surface: building windows, ground stipple, water,
// skinning (avatars), instancing, vertex colours, unlit/emissive.

// The look: 'sa' (default) is a San Andreas-style realistic pass: smooth sun + sky lighting, weathered
// textured walls, asphalt, paving and grass, reflective glass and glossy cars, no ink or hatching.
// 'comic' is the original Moebius-style ink look. Switch in Settings (needs a reload).
export const STYLE = (() => { try { return localStorage.getItem('pb.look') || 'sa'; } catch { return 'sa'; } })();

// Uniforms shared by every toon material; the day/night cycle and weather drive them.
export const Look = {
  uLitTint: { value: new THREE.Color(1.0, 0.97, 0.9) },
  uShadeTint: { value: new THREE.Color(0.6, 0.6, 0.8) },
  uInk: { value: new THREE.Color(0.17, 0.14, 0.16) },
  uNight: { value: 0 },          // 0 day .. 1 night (lights windows, lamps)
  uWet: { value: 0 },            // rain darkens and glosses the ground
  uTime: { value: 0 },
  uHatchFreq: { value: 4.0 },    // lines per metre
  uFocus: { value: new THREE.Vector3(0, -1000, 0) },   // the player's head, for see-through cutouts
};

const common = /* glsl */ `
  uniform vec3 uLitTint;
  uniform vec3 uShadeTint;
  uniform vec3 uInk;
  uniform float uNight;
  uniform float uWet;
  uniform float uTime;
  uniform float uHatchFreq;
  uniform vec3 uFocus;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
`;

const vertex = /* glsl */ `
  #include <common>
  #include <color_pars_vertex>
  #include <fog_pars_vertex>
  #include <skinning_pars_vertex>
  #include <shadowmap_pars_vertex>
  ${common}
  #ifdef USE_BUILDING
    attribute vec4 aBld;      // x: wall u (m), y: height above base (m), z: total height, w: style
    varying vec4 vBld;
  #endif
  #ifdef USE_SWAY
    uniform float uSway;
  #endif
  #ifdef USE_GLOWATTR
    attribute float aGlow;
    varying float vGlow;
  #endif
  void main() {
    #ifdef USE_GLOWATTR
      vGlow = aGlow;
    #endif
    #include <color_vertex>
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #ifdef USE_SWAY
      // trees and grass: gentle wind sway above the trunk
      float h = max(0.0, transformed.y - 1.0);
      vec4 ip = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_INSTANCING
        ip = instanceMatrix * ip;
      #endif
      transformed.x += sin(uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17) * h * 0.02 * uSway;
      transformed.z += cos(uTime * 1.1 + ip.x * 0.13) * h * 0.015 * uSway;
    #endif
    #include <skinning_vertex>
    #include <project_vertex>
    #include <worldpos_vertex>
    #include <shadowmap_vertex>
    #include <fog_vertex>
    vec4 wp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
    #endif
    vWorldPos = (modelMatrix * wp).xyz;
    vWorldNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
    #ifdef USE_BUILDING
      vBld = aBld;
    #endif
  }
`;

const fragment = /* glsl */ `
  uniform vec3 diffuse;
  uniform vec3 emissive;
  uniform float hatch;
  uniform float rimAmt;
  #include <common>
  #include <packing>
  #include <color_pars_fragment>
  #include <fog_pars_fragment>
  #include <bsdfs>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
  ${common}
  #ifdef USE_BUILDING
    varying vec4 vBld;
  #endif
  #ifdef USE_GLOWATTR
    varying float vGlow;
  #endif

  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.13 + 7.1) * 0.3 + vnoise(p * 4.71 + 3.3) * 0.15; }
  // fine detail fades out where it would shimmer (far away / grazing)
  float detail(vec2 p, float k) { return mix(0.5, vnoise(p * k), 1.0 - smoothstep(0.25, 0.9, fwidth(p.x * k) + fwidth(p.y * k))); }

  // Anti-aliased parallel lines along coordinate c; fades out when lines get denser than a few pixels.
  float lines(float c, float width) {
    float w = fwidth(c);
    float d = abs(fract(c) - 0.5);
    float l = 1.0 - smoothstep(0.5 - width - w, 0.5 - width + w, d);
    return l * (1.0 - smoothstep(0.18, 0.42, w));
  }

  // Octahedral-encode the world normal into 8 bits (15 x 16 cells, 0 reserved for "no ink").
  float packNormal(vec3 n) {
    n /= (abs(n.x) + abs(n.y) + abs(n.z));
    vec2 e = n.y >= 0.0 ? n.xz : (1.0 - abs(n.zx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.z >= 0.0 ? 1.0 : -1.0);
    e = e * 0.5 + 0.5;
    float ix = floor(clamp(e.x, 0.0, 0.999) * 15.0), iy = floor(clamp(e.y, 0.0, 0.999) * 16.0);
    return (1.0 + ix * 16.0 + iy) / 255.0;
  }

  void main() {
    #ifdef USE_CUTOUT
    {
      // cut a hole through anything between the camera and the player (and right at the camera)
      vec3 ab = uFocus - cameraPosition;
      float L2 = max(dot(ab, ab), 1e-4);
      float t = clamp(dot(vWorldPos - cameraPosition, ab) / L2, 0.0, 1.0);
      float d = length(vWorldPos - (cameraPosition + ab * t));
      float r = mix(1.6, 2.6, t);
      if ((t < 0.92 && d < r) || length(vWorldPos - cameraPosition) < 2.5) discard;
    }
    #endif
    vec3 albedo = diffuse;
    #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
      albedo *= vColor;
    #endif
    vec3 N = normalize(vWorldNormal);
    vec3 glow = emissive;
    float hatchAmt = hatch;
    #ifdef SA_LOOK
      vec3 Vsa = normalize(cameraPosition - vWorldPos);
      float fresSa = pow(1.0 - max(dot(N, Vsa), 0.0), 4.0);
      vec3 skyRefl = mix(vec3(0.55, 0.66, 0.78), uLitTint, 0.35);
      #if defined( USE_BUILDING ) || defined( USE_GROUND )
        albedo = mix(albedo, vec3(dot(albedo, vec3(0.299, 0.587, 0.114))), 0.2) * 0.96;
      #endif
    #endif

    #ifdef USE_BUILDING
      // Procedural facade: storeys of windows, a shopfront band at street level, a darker plinth.
      // styles: 0 homes, 1 shops, 2 offices, 3 glass, 4 civic, 5 worship, 6 industrial,
      //         7 plain props, 8 construction, 9 station, 10 lamp head
      float sv = floor(vBld.w + 0.5);
      float style = floor(sv / 10.0 + 0.001);
      float variant = sv - style * 10.0;
      float wallU = vBld.x, hy = vBld.y, H = vBld.z;
      #ifdef SA_LOOK
        if (abs(N.y) < 0.5 && style != 10.0) {
          // plaster with patchy paint, rising damp at the base, rain streaks from the parapet
          vec2 wp2 = vec2(wallU, hy);
          float n = fbm(wp2 * 0.55 + vWorldPos.xz * 0.01);
          albedo *= 0.8 + 0.3 * n;
          albedo *= 0.94 + 0.12 * detail(wp2, 5.0);
          albedo *= mix(0.72, 1.0, smoothstep(0.0, 1.3 + 0.8 * n, hy));
          float streak = smoothstep(0.5, 0.85, vnoise(vec2(wallU * 0.9, 1.7))) * smoothstep(H - 4.5 - 4.0 * n, H, hy);
          albedo *= 1.0 - 0.28 * streak;
          if (style == 6.0) albedo *= 0.9 + 0.1 * smoothstep(0.2, 0.8, vnoise(wp2 * vec2(0.3, 2.0)));
        } else if (N.y > 0.5) {
          vec2 rp = vWorldPos.xz;
          albedo *= 0.78 + 0.28 * fbm(rp * 0.3);
          albedo *= 0.93 + 0.1 * detail(rp, 3.0);
        }
      #endif
      if (style == 10.0) {
        glow += vec3(1.0, 0.9, 0.65) * uNight * 1.6;
        hatchAmt = 0.0;
      } else if (style == 7.0 || style == 9.0 || style == 5.0) {
        // plain surfaces; temples get a painted band
        if (style == 5.0 && abs(N.y) < 0.5) albedo = mix(albedo, vec3(0.85, 0.42, 0.3), step(H - 1.6, hy) * step(hy, H - 0.9));
      } else if (style == 6.0 && abs(N.y) < 0.5) {
        // corrugated sheet walls
        albedo *= 0.9 + 0.1 * lines(wallU * 2.5, 0.3);
        albedo *= mix(0.8, 1.0, step(0.5, hy));
      } else if (style == 8.0 && abs(N.y) < 0.5) {
        // bare RCC frame: dark open floors between slabs, rebar on top
        float fl = fract(hy / 3.2);
        albedo = mix(albedo, vec3(0.28, 0.27, 0.3), step(0.22, fl) * step(hy, H - 0.4));
        albedo = mix(albedo, albedo * 0.8, lines(wallU / 3.6, 0.42));
      } else if (abs(N.y) < 0.5) {
        float storey = style == 3.0 ? 3.8 : style == 4.0 ? 4.2 : 3.2;
        vec2 cell = vec2(wallU / (style == 3.0 ? 1.6 : style == 2.0 ? 2.0 : 2.6), (hy - 0.3) / storey);
        vec2 f = fract(cell);
        vec2 id = floor(cell);
        float top = H - 0.6;
        bool shopBand = hy < 3.0 && style == 1.0;
        float rnd = hash12(id + floor(vWorldPos.xz * 0.05));
        if (style == 3.0) {
          // glass tower: curtain wall grid
          float g = max(lines(cell.x, 0.46), lines(cell.y, 0.44));
          vec3 glass = mix(vec3(0.55, 0.72, 0.8), vec3(0.75, 0.86, 0.9), step(0.5, rnd));
          #ifdef SA_LOOK
            glass = mix(vec3(0.16, 0.22, 0.28) + rnd * 0.05, skyRefl, 0.35 + 0.55 * fresSa);
          #endif
          albedo = mix(glass * (0.85 + 0.15 * f.y), albedo * 0.8, g * 0.9);
          glow += vec3(1.0, 0.85, 0.55) * uNight * step(0.45, rnd) * (1.0 - g) * 0.9;
        } else if (shopBand) {
          // a row of shops ~4.5 m wide: big painted signboard, shutter or lit glass, pillar between
          float shopU = wallU / 4.5;
          float sid = floor(shopU) + floor(vWorldPos.x * 0.013) * 17.0 + floor(vWorldPos.z * 0.013) * 31.0;
          float fx = fract(shopU);
          float r1 = hash12(vec2(sid, 1.3)), r2 = hash12(vec2(sid, 7.1)), r3 = hash12(vec2(sid, 3.7));
          vec3 signCol = r1 < 0.2 ? vec3(0.93, 0.33, 0.27) : r1 < 0.4 ? vec3(0.2, 0.5, 0.74) : r1 < 0.55 ? vec3(0.98, 0.78, 0.22) : r1 < 0.7 ? vec3(0.25, 0.62, 0.42) : r1 < 0.85 ? vec3(0.96, 0.96, 0.92) : vec3(0.85, 0.3, 0.55);
          float sign = step(2.35, hy) * step(hy, 3.0);
          float pillar = 1.0 - step(0.06, fx) * step(fx, 0.94);
          float shut = step(0.55, r2);
          float shutter = lines(hy * 7.0, 0.32) * shut;
          vec3 inside = mix(vec3(0.26, 0.24, 0.26), vec3(0.36, 0.33, 0.3), r3);
          vec3 shut_c = mix(vec3(0.62, 0.64, 0.66), vec3(0.5, 0.62, 0.7), step(0.8, r3));
          vec3 shop = mix(inside, shut_c * (1.0 - shutter * 0.18), shut);
          // tiny lettering scribbles on the board
          float letters = step(0.35, fract(wallU * 3.1 + r2 * 9.0)) * step(2.55, hy) * step(hy, 2.8) * step(0.18, fx) * step(fx, 0.82);
          vec3 board = mix(signCol, signCol * 0.45 + 0.05, letters * 0.8);
          albedo = mix(mix(shop, albedo * 0.85, pillar), board, sign);
          glow += (vec3(1.0, 0.82, 0.55) * (1.0 - sign) * (1.0 - shut) * (1.0 - pillar) * 0.7 + signCol * sign * 0.6) * uNight;
          hatchAmt *= 0.4;
        } else if (hy > 0.9 && hy < top) {
          // facade variants keep whole streets from looking stamped out
          float bay = 2.6 * (0.85 + 0.08 * mod(variant, 4.0));
          if (style != 3.0 && style != 2.0) { cell.x = wallU / bay; f.x = fract(cell.x); id.x = floor(cell.x); }
          float tall = style == 4.0 ? 0.12 : 0.32;
          float wx0 = 0.28, wx1 = 0.72;
          if (variant == 6.0) { wx0 = 0.4; wx1 = 0.6; tall = 0.18; }
          if (variant == 7.0) { wx0 = 0.18; wx1 = 0.82; }
          float skip = (variant == 9.0 && mod(id.x, 2.0) > 0.5) ? 0.0 : 1.0;
          float win = step(wx0, f.x) * step(f.x, wx1) * step(tall, f.y) * step(f.y, 0.78) * skip;
          float frame = win * (1.0 - step(wx0 + 0.05, f.x) * step(f.x, wx1 - 0.05) * step(tall + 0.06, f.y) * step(f.y, 0.72));
          vec3 glassC = vec3(0.32, 0.38, 0.46);
          #ifdef SA_LOOK
            glassC = mix(vec3(0.12, 0.14, 0.17) + vec3(0.06, 0.05, 0.04) * rnd, skyRefl * 0.85, 0.15 + 0.7 * fresSa);
          #endif
          albedo = mix(albedo, glassC, win * 0.85);
          albedo = mix(albedo, variant == 8.0 ? vec3(0.2, 0.45, 0.55) : albedo * 0.6, frame);
          // window grills
          if (variant == 7.0) albedo = mix(albedo, albedo * 0.55, win * lines(f.x * 9.0, 0.38));
          // chajja sunshade over each window, heavier on some buildings
          float sh0 = variant == 8.0 ? 0.78 : 0.8, sh1 = variant == 8.0 ? 0.9 : 0.86;
          float shade = step(sh0, f.y) * step(f.y, sh1) * step(wx0 - 0.06, f.x) * step(f.x, wx1 + 0.06) * skip;
          albedo = mix(albedo, albedo * 0.72, shade);
          // balconies: a slab line at each floor and a railing across alternate bays
          if (variant == 4.0 || variant == 5.0) {
            float slab = step(f.y, 0.07);
            float rail = step(0.07, f.y) * step(f.y, 0.3) * step(0.5, mod(id.x + variant, 2.0));
            albedo = mix(albedo, albedo * 0.7, slab);
            albedo = mix(albedo, mix(albedo * 0.9, vec3(0.25, 0.25, 0.28), lines(wallU * 6.0, 0.4)), rail);
          }
          glow += vec3(1.0, 0.82, 0.5) * uNight * win * step(0.55, rnd) * 0.85;
        }
        // plinth and parapet bands
        albedo *= mix(0.78, 1.0, step(0.6, hy));
        albedo *= mix(1.0, 0.88, step(top, hy));
      } else if (N.y > 0.5) {
        // roofs: faint rain stains rather than noise
        float st = hash12(floor(vWorldPos.xz * 0.15));
        albedo *= 0.95 + 0.05 * st;
      }
    #endif

    #if defined( USE_GROUND ) && defined( SA_LOOK )
      {
        vec2 P = vWorldPos.xz;
        float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
        float sat = max(albedo.r, max(albedo.g, albedo.b)) - min(albedo.r, min(albedo.g, albedo.b));
        #ifdef USE_ROADMAT
          if (lum < 0.62 && sat < 0.08) {
            // asphalt: dark, grainy, patched
            albedo = vec3(0.34, 0.34, 0.36) * (0.82 + 0.28 * fbm(P * 0.22)) * (0.88 + 0.24 * detail(P, 9.0));
            albedo *= 1.0 - 0.2 * smoothstep(0.64, 0.7, fbm(P * 0.11 + 11.0));
            albedo *= 1.0 - 0.12 * smoothstep(0.7, 0.75, fbm(P * 0.6 + 3.0));
          } else {
            // footpath: worn concrete slabs
            vec2 t = fract(P / vec2(1.2, 0.9));
            float grout = (1.0 - step(0.035, t.x) * step(0.045, t.y)) * (1.0 - smoothstep(0.1, 0.5, fwidth(P.x)));
            albedo = albedo * vec3(0.8, 0.79, 0.76) * (0.82 + 0.24 * fbm(P * 0.45));
            albedo = mix(albedo, albedo * 0.62, grout * 0.6);
          }
        #else
          if (albedo.g > albedo.r + 0.03 && albedo.g >= albedo.b) {
            // grass: muted olive with dry, trampled patches
            float n = fbm(P * 0.3);
            albedo = mix(vec3(0.3, 0.38, 0.17), vec3(0.42, 0.48, 0.24), n) * (0.86 + 0.24 * detail(P, 3.5));
            albedo = mix(albedo, vec3(0.5, 0.45, 0.31), smoothstep(0.62, 0.82, fbm(P * 0.07 + 3.0)) * 0.65);
          } else {
            // bare earth and compound yards
            albedo = mix(albedo, vec3(0.62, 0.55, 0.45), 0.35) * (0.78 + 0.3 * fbm(P * 0.16));
            albedo *= 0.9 + 0.16 * detail(P, 4.0);
          }
        #endif
        albedo = mix(albedo, albedo * 0.5, uWet * 0.7);
      }
    #elif defined( USE_GROUND )
      // fine sand speckles + soft blotches, like printed comics; fade before they alias
      vec2 sc = vWorldPos.xz * 7.0;
      vec2 sci = floor(sc);
      float sn = hash12(sci);
      float spd = length(fract(sc) - 0.5 - (vec2(hash12(sci + 1.7), hash12(sci + 4.1)) - 0.5) * 0.5);
      float wfade = 1.0 - smoothstep(0.08, 0.3, fwidth(sc.x));
      albedo *= 1.0 - step(0.86, sn) * (1.0 - smoothstep(0.1, 0.16, spd)) * 0.28 * wfade;
      float blotch = hash12(floor(vWorldPos.xz * 0.08));
      albedo *= 0.965 + 0.05 * blotch;
      albedo = mix(albedo, albedo * 0.72, uWet * 0.6);
    #endif

    // sun term: hard toon split, shadow-mapped
    float NdL = 0.0;
    #if NUM_DIR_LIGHTS > 0
      NdL = dot(normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix)), N);
    #endif
    float lit = smoothstep(0.0, 0.06, NdL);
    #ifdef USE_SHADOWMAP
      lit *= getShadowMask();
    #endif
    #ifdef UNLIT
      lit = 1.0;
    #endif
    vec3 litCol = albedo * uLitTint;
    vec3 shadeCol = albedo * uShadeTint;
    #ifdef SA_LOOK
      // smooth sun (Lambert) through the shadow map + a sky/ground ambient, like a classic 3D city game
      float sunAmt = max(NdL, 0.0);
      #ifdef USE_SHADOWMAP
        sunAmt *= getShadowMask();
      #endif
      #ifdef UNLIT
        sunAmt = 1.0;
      #endif
      float hemi = N.y * 0.5 + 0.5;
      vec3 amb = uShadeTint * mix(0.58, 0.86, hemi);
      vec3 col = albedo * (amb + uLitTint * 0.72 * sunAmt);
      #if defined( UNLIT ) && defined( USE_COLOR )
        col = albedo * mix(vec3(1.0), uLitTint * 0.85, 0.4) * (1.0 - uNight * 0.6);
      #endif
      #ifdef USE_GROUND
        // wet streets mirror the sky
        col = mix(col, skyRefl * 0.7, uWet * fresSa * 0.6);
      #endif
      #ifdef USE_GLOSS
        // car paint: a sun highlight and a sky reflection
        #if NUM_DIR_LIGHTS > 0
          vec3 Lw = normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix));
          float spec = pow(max(dot(N, normalize(Lw + Vsa)), 0.0), 80.0) * sunAmt;
          col += uLitTint * spec * 0.9;
        #endif
        col += skyRefl * fresSa * 0.3;
      #endif
    #else
    // a third, mid band on surfaces turned slightly away from the sun gives rounder forms
    float mid = smoothstep(0.0, 0.06, NdL - 0.45) * 0.08;
    vec3 col = mix(shadeCol, litCol * (1.0 + mid), lit);
    #endif

    // hatching inside shadow: horizontal strokes on walls, diagonal on floors
    #if !defined( UNLIT ) && !defined( SA_LOOK )
    {
      vec3 an = abs(N);
      float c = an.y > 0.75 ? (vWorldPos.x + vWorldPos.z) * 0.7071 : vWorldPos.y + (an.x > an.z ? vWorldPos.z : vWorldPos.x) * 0.12;
      float hl = lines(c * uHatchFreq, 0.36);
      col = mix(col, mix(shadeCol, uInk, 0.35), hl * (1.0 - lit) * hatchAmt * 0.55);
    }
    #endif

    // a rim of light on characters reads well against busy backgrounds
    if (rimAmt > 0.0) {
      vec3 V = normalize(cameraPosition - vWorldPos);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      #ifdef SA_LOOK
        col += litCol * rim * rimAmt * 0.35 * (0.4 + 0.6 * lit);
      #else
        col += litCol * rim * rimAmt * (0.4 + 0.6 * lit);
      #endif
    }

    #ifdef USE_WATER
      vec3 V = normalize(cameraPosition - vWorldPos);
      float fres = pow(1.0 - max(V.y, 0.0), 4.0);
      float rip = lines((vWorldPos.x * 0.6 + sin(vWorldPos.z * 0.35 + uTime * 0.8) * 1.2) * 0.9, 0.42);
      float rip2 = lines((vWorldPos.z * 0.5 + sin(vWorldPos.x * 0.3 - uTime * 0.6) * 1.5) * 0.7, 0.45);
      col = mix(col, vec3(0.85, 0.93, 0.95), fres * 0.6);
      col = mix(col, col * 1.18 + 0.05, max(rip, rip2) * 0.45);
    #endif

    #ifdef USE_GLOWATTR
      col = mix(col, albedo * (1.1 + 0.25 * uNight), vGlow);
    #endif
    col += glow;
    gl_FragColor = vec4(col, packNormal(N));
    #include <fog_fragment>
    #ifdef NO_INK
      gl_FragColor.a = 0.0;
    #endif
  }
`;

const cache = new Map();

// opts: color, vertexColors, building, ground, water, sway, unlit, emissive, hatch, rim, side, skinning, noInk, fog, glowAttr
export function toon(opts = {}) {
  const defines = {};
  if (opts.building) defines.USE_BUILDING = '';
  if (opts.ground) defines.USE_GROUND = '';
  if (opts.water) defines.USE_WATER = '';
  if (opts.sway) defines.USE_SWAY = '';
  if (opts.unlit) defines.UNLIT = '';
  if (opts.noInk) defines.NO_INK = '';
  if (opts.glowAttr) defines.USE_GLOWATTR = '';
  if (opts.cutout) defines.USE_CUTOUT = '';
  if (opts.road) defines.USE_ROADMAT = '';
  if (opts.gloss) defines.USE_GLOSS = '';
  if (STYLE === 'sa') defines.SA_LOOK = '';
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    diffuse: { value: new THREE.Color(opts.color ?? 0xffffff) },
    emissive: { value: new THREE.Color(opts.emissive ?? 0x000000) },
    hatch: { value: opts.hatch ?? 1 },
    rimAmt: { value: opts.rim ?? 0 },
    ...Look,
  };
  if (opts.sway) uniforms.uSway = { value: opts.sway };
  const m = new THREE.ShaderMaterial({
    uniforms, defines, vertexShader: vertex, fragmentShader: fragment,
    lights: true, fog: opts.fog ?? true,
    vertexColors: !!opts.vertexColors,
    side: opts.side ?? THREE.FrontSide,
  });
  m.isToon = true;
  // three only sets USE_SKINNING for materials that expose this flag
  if (opts.skinning) m.skinning = true;
  // Material.color-style accessor so code can do mat.color.set(...)
  Object.defineProperty(m, 'color', { get: () => uniforms.diffuse.value });
  return m;
}

// Shared material for a colour, so meshes of the same colour batch their programs.
export function toonColor(hex, extra = {}) {
  const key = hex + JSON.stringify(extra);
  if (!cache.has(key)) cache.set(key, toon({ color: hex, ...extra }));
  return cache.get(key);
}
