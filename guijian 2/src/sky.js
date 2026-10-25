// ============================================================================
//  天 SKY LAYERS — clouds, the night sky, the moon
//
//  The Preetham sky in scene.js is a clear, empty atmosphere. A real sky over a
//  palace has weather in it, and after dusk it has stars. Four layers sit
//  inside the Preetham box, each a large sphere (or point set) drawn in display
//  space so it matches the readback-coloured haze exactly:
//
//  * night  — the dark-blue sky that takes over as the sun goes down, with a
//             faint Milky Way across it
//  * stars  — a few thousand points, faint ones many and bright ones rare,
//             dimmed toward the horizon by the air they shine through
//  * moon   — full, opposite the sun (the equinox full moon rises at sunset
//             and stands fifty degrees up in the south at midnight)
//  * clouds — a cloud deck projected onto a plane overhead, so it shrinks and
//             crowds toward the horizon as a real one does; each cloud shades
//             itself on the side away from the sun, glows at its thin edges
//             when you look toward the sun, and takes the sunset colour
//
//  None of this writes depth, so the hills and the buildings sit in front of
//  it, and none of it is in the normal pass, so ambient occlusion ignores it.
// ============================================================================

var SKY_LAYERS = new THREE.Group();
SKY_LAYERS.name = 'skyLayers';
scene.add(SKY_LAYERS);
AO_HIDDEN.push(SKY_LAYERS);

var SKY_R = 3600;

var SKY_VS = [
  'varying vec3 vDir;',
  'void main(){',
  '  vec4 wp = modelMatrix*vec4(position, 1.0);',
  '  vDir = wp.xyz - cameraPosition;',
  '  gl_Position = projectionMatrix*viewMatrix*wp;',
  '}'
].join('\n');

var NOISE_GLSL = [
  'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }',
  'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);',
  '  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }',
  'const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);',
  // octaves past `lod` fade to their mean, so a distant cloud is drawn smooth
  // instead of shimmering with detail finer than a pixel
  'float fbm(vec2 p, float lod){ float s = 0.0, a = 0.5;',
  '  for (int i = 0; i < 6; i++) { float w = clamp(lod - float(i), 0.0, 1.0); s += a*mix(0.5, vnoise(p), w); p = ROT*p; a *= 0.5; }',
  '  return s/0.984375; }',
  'float hash13(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y)*p3.z); }',
  'float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0 - 2.0*f);',
  '  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);',
  '  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);',
  '  return mix(a, b, u.z); }'
].join('\n');

// ---------------------------------------------------------------- night sky
var nightDome = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 48, 24), new THREE.ShaderMaterial({
  vertexShader: SKY_VS,
  fragmentShader: [
    'varying vec3 vDir;',
    'uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uK; uniform float uMw; uniform vec3 uPole;',
    NOISE_GLSL,
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  float h = max(d.y, 0.0);',
    '  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));',
    // the galactic band: a great circle, broken up by dust lanes
    '  float b = dot(d, uPole);',
    '  float band = exp(-b*b*30.0);',
    '  float dust = vnoise3(d*7.0)*0.6 + vnoise3(d*19.0)*0.4;',
    '  float mw = band*smoothstep(0.25, 0.85, dust)*smoothstep(0.0, 0.35, h);',
    '  col += vec3(0.060, 0.064, 0.080)*mw*uMw;',
    '  gl_FragColor = vec4(col, uK);',
    '}'
  ].join('\n'),
  uniforms: {
    uZenith: { value: new THREE.Color(0.010, 0.016, 0.040) },
    uHorizon: { value: new THREE.Color(0.060, 0.075, 0.115) },
    uK: { value: 0 }, uMw: { value: 1 },
    uPole: { value: new THREE.Vector3(0.45, 0.35, -0.82).normalize() }
  },
  side: THREE.BackSide, transparent: true, depthWrite: false, fog: false
}));
nightDome.renderOrder = -4;
nightDome.frustumCulled = false;
SKY_LAYERS.add(nightDome);

// -------------------------------------------------------------------- stars
var stars = (function () {
  var N = 4200, r = TEXGEN.rng(9071);
  var pos = new Float32Array(N * 3), size = new Float32Array(N), bright = new Float32Array(N), col = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) {
    // uniform on the sphere, upper hemisphere and a little below
    var y = r() * 1.08 - 0.08, a = r() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - y * y));
    pos[i * 3] = Math.cos(a) * s * SKY_R * 0.97;
    pos[i * 3 + 1] = y * SKY_R * 0.97;
    pos[i * 3 + 2] = Math.sin(a) * s * SKY_R * 0.97;
    var m = Math.pow(r(), 5.5);                 // most stars faint, a few bright
    size[i] = 1.0 + 2.6 * m;
    bright[i] = 0.18 + 0.82 * Math.pow(r(), 2.2) * (0.35 + 0.65 * m) + 0.6 * m;
    // colour temperature: most white, some blue, some orange
    var t = r();
    var c = t < 0.12 ? [0.78, 0.86, 1.0] : t > 0.85 ? [1.0, 0.86, 0.70] : [1.0, 0.98, 0.95];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  var m = new THREE.ShaderMaterial({
    vertexShader: [
      'attribute float aSize; attribute float aBright; attribute vec3 aColor;',
      'uniform float uPx; uniform float uK;',
      'varying vec3 vC;',
      'void main(){',
      '  vec3 d = normalize(position);',
      // extinction: a star near the horizon shines through forty times the air
      '  float ext = smoothstep(-0.02, 0.30, d.y);',
      '  vC = aColor*aBright*ext*uK;',
      '  vec4 wp = modelMatrix*vec4(position, 1.0);',
      '  gl_Position = projectionMatrix*viewMatrix*wp;',
      '  gl_PointSize = aSize*uPx;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vC;',
      'void main(){',
      '  float r = length(gl_PointCoord - 0.5)*2.0;',
      '  float a = smoothstep(1.0, 0.15, r);',
      '  gl_FragColor = vec4(vC*a, 1.0);',
      '}'
    ].join('\n'),
    uniforms: { uPx: { value: renderer.getPixelRatio() }, uK: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  var p = new THREE.Points(g, m);
  p.renderOrder = -3;
  p.frustumCulled = false;
  SKY_LAYERS.add(p);
  return p;
})();

// --------------------------------------------------------------------- moon
var moon = (function () {
  var c = document.createElement('canvas');
  c.width = c.height = 256;
  var x = c.getContext('2d');
  var R = 120, cx = 128;
  // limb-darkened disc
  var g = x.createRadialGradient(cx - 10, cx - 12, 4, cx, cx, R);
  g.addColorStop(0, '#fbf8ee'); g.addColorStop(0.7, '#ebe6d6'); g.addColorStop(1, '#c9c3b2');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cx, R, 0, Math.PI * 2); x.fill();
  // maria: the dark seas, soft-edged blotches in their real rough places
  var rnd = TEXGEN.rng(55);
  [[-30, -40, 38], [10, -55, 30], [35, -20, 34], [-45, 15, 26], [20, 20, 22], [-10, 45, 18], [50, 30, 16], [-55, -10, 20]].forEach(function (m) {
    var gg = x.createRadialGradient(cx + m[0], cx + m[1], 1, cx + m[0], cx + m[1], m[2]);
    gg.addColorStop(0, 'rgba(120,118,112,0.55)'); gg.addColorStop(1, 'rgba(120,118,112,0)');
    x.fillStyle = gg; x.beginPath(); x.arc(cx + m[0], cx + m[1], m[2], 0, Math.PI * 2); x.fill();
  });
  for (var i = 0; i < 70; i++) {
    var a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.92, rr = 1 + rnd() * 5;
    x.fillStyle = 'rgba(90,88,84,' + (0.08 + rnd() * 0.15) + ')';
    x.beginPath(); x.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, rr, 0, Math.PI * 2); x.fill();
  }
  // clip to the disc
  x.globalCompositeOperation = 'destination-in';
  x.beginPath(); x.arc(cx, cx, R, 0, Math.PI * 2); x.fill();
  var tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;

  var h = document.createElement('canvas');
  h.width = h.height = 128;
  var hx = h.getContext('2d');
  var hg = hx.createRadialGradient(64, 64, 0, 64, 64, 64);
  hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(0.12, 'rgba(255,255,255,0.45)');
  hg.addColorStop(0.35, 'rgba(255,255,255,0.10)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
  var htex = new THREE.CanvasTexture(h);

  var grp = new THREE.Group();
  // a little larger than its true half-degree: the eye always sees it so
  var size = SKY_R * 0.0165;
  var disc = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, color: 0xffffff
  }));
  disc.renderOrder = -2;
  var halo = new THREE.Mesh(new THREE.PlaneGeometry(size * 9, size * 9), new THREE.MeshBasicMaterial({
    map: htex, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.AdditiveBlending, color: new THREE.Color(0.10, 0.12, 0.16)
  }));
  halo.renderOrder = -2.5;
  halo.position.z = -1;
  grp.add(halo); grp.add(disc);
  grp.frustumCulled = false;
  disc.frustumCulled = false; halo.frustumCulled = false;
  SKY_LAYERS.add(grp);
  return { group: grp, disc: disc, halo: halo };
})();

// ------------------------------------------------------------------- clouds
var clouds = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 0.94, 64, 32), new THREE.ShaderMaterial({
  vertexShader: SKY_VS,
  fragmentShader: [
    'varying vec3 vDir;',
    'uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uHaze; uniform vec3 uGlow; uniform vec3 uSunDir;',
    'uniform float uCover; uniform float uCirrus; uniform vec2 uSeed; uniform float uOpacity;',
    NOISE_GLSL,
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  if (d.y <= 0.0) discard;',
    '  float h = d.y;',
    // onto a deck overhead; the small constant stands in for the earth's
    // curvature, so the deck meets the horizon instead of running to infinity
    '  vec2 p = d.xz/(h + 0.06);',
    '  float dist = length(p);',
    '  float lod = clamp(6.5 - log2(1.0 + dist*1.3), 1.5, 6.0);',
    '  vec2 q = p*1.5 + uSeed;',
    // the field the clouds stand in: broad, slowly varying, domain-warped so
    // cells are irregular rather than round
    '  vec2 w = vec2(fbm(q*0.28 + 3.1, lod - 2.0), fbm(q*0.28 - 1.7, lod - 2.0)) - 0.5;',
    '  vec2 qq = q + w*2.2;',
    '  float base = fbm(qq*0.42, lod - 1.5);',
    // billows: the cauliflower edge of a cumulus
    '  float bill = fbm(qq*1.35 + 7.3, lod);',
    '  float n = base*0.68 + bill*0.32;',
    '  float lo = 1.0 - uCover*0.93 - 0.10;',
    '  float cov = smoothstep(lo, lo + 0.07 + uCover*0.10, n);',
    // self-shadow: denser toward the sun means this point is in the cloud's
    // own shade
    '  vec2 sdir = uSunDir.xz/max(length(uSunDir.xz), 1e-3);',
    '  float n1 = fbm((qq + sdir*0.10)*0.42, lod - 1.5)*0.68 + fbm((qq + sdir*0.10)*1.35 + 7.3, lod)*0.32;',
    '  float n2 = fbm((qq + sdir*0.26)*0.42, lod - 1.5)*0.68 + bill*0.32;',
    '  float occl = clamp(((n1 - n)*0.55 + (n2 - n)*0.45)*7.0, -0.5, 1.0);',
    '  float lit = clamp(0.58 - occl, 0.0, 1.0);',
    // seen from below, a cumulus is grey at its thick base and bright at its
    // thin, sunlit margins
    '  float thick = smoothstep(lo + 0.03, lo + 0.30, n);',
    '  vec3 col = mix(uShade, uLit, clamp(lit*(1.0 - 0.62*thick) + 0.22*(1.0 - thick), 0.0, 1.0));',
    '  float mu = dot(d, uSunDir);',
    '  float hg = 0.64/pow(1.36 - 1.2*mu, 1.5);',
    '  col += uGlow*hg*0.12*(1.0 - thick)*cov;',
    // cirrus: high, thin, combed out by the wind
    '  vec2 cq = vec2(q.x*0.25 + q.y*0.08, q.y*1.9 - q.x*0.3)*0.55 + 17.0;',
    '  float ci = fbm(cq, lod)*0.7 + fbm(cq*3.1, lod)*0.3;',
    '  float cia = smoothstep(0.55, 0.82, ci)*uCirrus*(1.0 - cov);',
    '  col = mix(col, uLit*1.02, cia*(1.0 - cov));',
    '  float a = max(cov, cia*0.55);',
    // the far deck dissolves into the haze it is seen through
    '  float haze = smoothstep(0.30, 0.0, h);',
    '  col = mix(col, uHaze, haze*0.8);',
    '  a *= smoothstep(0.015, 0.12, h)*uOpacity;',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n'),
  uniforms: {
    uLit: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.6, 0.64, 0.7) },
    uHaze: { value: new THREE.Color(0.8, 0.84, 0.88) }, uGlow: { value: new THREE.Color(1, 0.95, 0.85) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uCover: { value: 0.35 }, uCirrus: { value: 0.6 }, uSeed: { value: new THREE.Vector2(3.7, 1.9) },
    uOpacity: { value: 1 }
  },
  side: THREE.BackSide, transparent: true, depthWrite: false, fog: false
}));
clouds.renderOrder = -1;
clouds.frustumCulled = false;
SKY_LAYERS.add(clouds);

// ---------------------------------------------------------------------------
//  Colours are set in display space from the sun's height, the weather, and
//  the horizon colour that scene.js has just read back. Called on every
//  daylight tick (uniforms only, nothing allocated).
// ---------------------------------------------------------------------------
var _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
function mixC(out, a, b, k) { return out.copy(a).lerp(b, k); }
var SKYCOL = {
  litDay: new THREE.Color(0.97, 0.965, 0.95), shadeDay: new THREE.Color(0.66, 0.70, 0.76),
  litGold: new THREE.Color(1.00, 0.70, 0.46), shadeGold: new THREE.Color(0.52, 0.42, 0.46),
  litGlow: new THREE.Color(0.86, 0.46, 0.52), shadeGlow: new THREE.Color(0.24, 0.20, 0.28),
  litNight: new THREE.Color(0.13, 0.145, 0.185), shadeNight: new THREE.Color(0.030, 0.036, 0.052),
  overLit: new THREE.Color(0.80, 0.82, 0.85), overShade: new THREE.Color(0.48, 0.50, 0.54)
};

function updateSkyLayers() {
  var w = LIGHT.weather, el = LIGHT.elev;
  var day = smoothK(-7, 8, el);
  var gold = smoothK(24, 3, el) * smoothK(-2, 1, el);       // sun low but up
  var glow = smoothK(1, -2, el) * smoothK(-9, -3, el);      // afterglow, sun just under
  var night = NIGHT.k;

  var cover = NIGHT.cover;
  if (w === 'overcast') cover = Math.max(cover, 0.94);
  if (w === 'hazy') cover = cover * 0.8;
  var u = clouds.material.uniforms;
  u.uCover.value = cover;
  u.uCirrus.value = w === 'overcast' ? 0 : w === 'hazy' ? 0.9 : 0.55;
  u.uSunDir.value.copy(el > -4 ? LIGHT.dir : NIGHT.moonDir);

  // lit side and shade side, through the day
  var lit = mixC(_c1, SKYCOL.litDay, SKYCOL.litGold, gold);
  lit.lerp(SKYCOL.litGlow, glow);
  var shade = mixC(_c2, SKYCOL.shadeDay, SKYCOL.shadeGold, gold);
  shade.lerp(SKYCOL.shadeGlow, glow);
  if (w === 'overcast') { lit.lerp(SKYCOL.overLit, 0.75 * day); shade.lerp(SKYCOL.overShade, 0.75 * day); }
  if (w === 'hazy') { lit.lerp(scene.fog.color, 0.25); shade.lerp(scene.fog.color, 0.35); }
  // by night, lit by the moon if it's up and by the sky glow if not
  var moonUp = smoothK(-3, 12, NIGHT.moonEl);
  _c3.copy(SKYCOL.litNight).multiplyScalar(0.45 + 0.55 * moonUp);
  lit.lerp(_c3, 1 - day);
  shade.lerp(SKYCOL.shadeNight, 1 - day);
  u.uLit.value.copy(lit);
  u.uShade.value.copy(shade);
  u.uHaze.value.copy(scene.fog.color);
  u.uGlow.value.copy(sun.color).multiplyScalar(day * (w === 'overcast' ? 0.2 : 1));

  // night sky
  var nu = nightDome.material.uniforms;
  nu.uK.value = night;
  nu.uMw.value = (1 - 0.8 * moonUp) * (w === 'clear' ? 1 : w === 'hazy' ? 0.4 : 0);
  // moonlight brightens the night sky toward a deep blue
  nu.uZenith.value.setRGB(0.010 + 0.016 * moonUp, 0.016 + 0.026 * moonUp, 0.040 + 0.055 * moonUp);
  nu.uHorizon.value.setRGB(0.050 + 0.030 * moonUp, 0.064 + 0.040 * moonUp, 0.100 + 0.055 * moonUp);
  if (w === 'overcast') { nu.uZenith.value.multiplyScalar(0.7); nu.uHorizon.value.multiplyScalar(0.8); }

  var starK = night * (w === 'clear' ? 1 : w === 'hazy' ? 0.45 : 0) * (1 - 0.45 * moonUp);
  stars.material.uniforms.uK.value = starK;
  stars.material.uniforms.uPx.value = renderer.getPixelRatio();
  stars.visible = starK > 0.003;

  // the moon
  var md = NIGHT.moonDir;
  moon.group.position.copy(md).multiplyScalar(SKY_R * 0.95);
  moon.group.lookAt(0, 0, 0);
  var mvis = smoothK(-1.5, 1.5, NIGHT.moonEl) * (0.25 + 0.75 * night) * (w === 'overcast' ? 0.15 : 1);
  moon.disc.material.opacity = mvis;
  moon.halo.material.opacity = mvis * (w === 'hazy' ? 1.6 : 1);
  // low in the sky it is yellowed by the same air that reddens the sun
  var low = smoothK(25, 2, NIGHT.moonEl);
  moon.disc.material.color.setRGB(1, 1 - 0.12 * low, 1 - 0.30 * low);
  moon.group.visible = mvis > 0.003;
}

function setCloudCover(c) {
  NIGHT.cover = Math.max(0, Math.min(1, c));
  updateSkyLayers();
  requestRender();
}

// colour the haze takes at night (display space)
function nightHorizon(out) {
  var moonUp = smoothK(-3, 12, NIGHT.moonEl);
  return out.setRGB(0.050 + 0.030 * moonUp, 0.064 + 0.040 * moonUp, 0.100 + 0.055 * moonUp);
}
