// ============================================================================
//  SCENE — renderer, sky, sun, environment light, camera
//
//  The light is the thing that decides whether a model reads as a building or
//  as a toy, so it is modelled rather than painted:
//
//  * Sky       — Preetham analytic daylight (three's Sky), driven by the real
//                sun position for Beijing's latitude, not a gradient.
//  * Ambient   — the same sky, rendered into a PMREM environment map, so every
//                surface is lit and reflects the actual sky above it. A ground
//                disc in that environment returns bounce light from below at
//                the paving's albedo, which is what keeps the underside of a
//                deep eave dark instead of glowing with horizon blue.
//  * Haze      — fog whose colour is read back from the rendered horizon, so
//                the ground meets the sky with no seam.
//  * Shadows   — one sun, its frustum fitted to the building on every rebuild
//                and never re-rendered just because the camera moved.
// ============================================================================

var IS_TOUCH = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

var scene = new THREE.Scene();

var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 9000);
camera.position.set(12, 8, 13);

var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The shadow map depends on the sun and the geometry, never on the camera, so
// it is only redrawn when one of those changes (see markShadowsDirty).
renderer.shadowMap.autoUpdate = false;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
document.getElementById('wrap').appendChild(renderer.domElement);

var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.75;
controls.zoomSpeed = 1.1;
controls.minDistance = 0.8;
controls.maxDistance = 320;
// Below the horizon is allowed -- standing in the courtyard looking up at the
// eaves is the view a visitor actually has. The ground clamp in render.js is
// what keeps the camera out of the paving.
controls.maxPolarAngle = Math.PI * 0.66;

var buildingGroup = new THREE.Group();     // exported: the building only
scene.add(buildingGroup);
var siteGroup = new THREE.Group();         // never exported: courtyard, walls, ground
scene.add(siteGroup);

// Hex colours are sRGB. With outputEncoding = sRGB the renderer converts
// linear -> sRGB on output, so feeding sRGB in unconverted brightens everything
// twice -- deep red renders as salmon. Convert on the way in.
function C(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

// ---------------------------------------------------------------------------
//  render requests: render.js owns the loop; anything that changes the image
//  calls requestRender(), anything that changes the sun or the geometry also
//  calls markShadowsDirty().
// ---------------------------------------------------------------------------
var RENDER_STATE = { dirty: true, shadowsDirty: true, hqDone: false, lastMotion: 0 };
function requestRender() { RENDER_STATE.dirty = true; RENDER_STATE.hqDone = false; }
function markShadowsDirty() { RENDER_STATE.shadowsDirty = true; requestRender(); }

// ============================================================================
//  SKY + SUN
// ============================================================================
var sky = new THREE.Sky();
sky.scale.setScalar(8000);   // the hills at 2600 must sit inside the sky box
scene.add(sky);

var sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.castShadow = true;
var SHADOW_SIZE = IS_TOUCH ? 2048 : 4096;
SHADOW_SIZE = Math.min(SHADOW_SIZE, renderer.capabilities.maxTextureSize || 4096);
sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.012;
sun.shadow.radius = 2;
scene.add(sun);
scene.add(sun.target);

// a faint hemisphere fill only to stop pure-black on back faces if the
// environment map is ever unavailable; the PMREM sky does the real work
var hemi = new THREE.HemisphereLight(0xdfe7f0, 0x5a5048, 0.08);
scene.add(hemi);

// Linear haze, scaled to the building: nothing on the model or in its court is
// touched, and the open ground beyond fades to the horizon over a broad band.
// (Exponential fog crushes that whole transition into a few pixels just under
// the horizon, which reads as a hard edge to the world.)
scene.fog = new THREE.Fog(0xc9d3dc, 80, 600);
var FOG_SCALE = 20;

// The environment: a second Sky inside a 50-unit box, a ground disc under it,
// and a black occluder over the sun disc (the directional light already draws
// the sun; leaving it in the env map would light everything twice).
var envScene = new THREE.Scene();
var envSky = new THREE.Sky();
envSky.scale.setScalar(50);
envScene.add(envSky);
var envGround = new THREE.Mesh(new THREE.CircleGeometry(80, 48),
  new THREE.MeshBasicMaterial({ color: 0x404040, toneMapped: false }));
envGround.rotation.x = -Math.PI / 2;
envGround.position.y = -0.6;
envScene.add(envGround);
var envSunMask = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24),
  new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, side: THREE.DoubleSide }));
envScene.add(envSunMask);

var pmrem = new THREE.PMREMGenerator(renderer);
var envRT = null;

var WEATHER = {
  clear:    { turbidity: 3.2, rayleigh: 1.25, mie: 0.0035, g: 0.80, sun: 1.00, fog: [2.6, 16], hills: 0.30, bounce: 1.0, ev: 1.0 },
  hazy:     { turbidity: 8.5, rayleigh: 2.2,  mie: 0.0085, g: 0.85, sun: 0.78, fog: [1.8, 9],  hills: 0.14, bounce: 0.9, ev: 1.08 },
  overcast: { turbidity: 16,  rayleigh: 3.6,  mie: 0.025,  g: 0.70, sun: 0.16, fog: [1.4, 7],  hills: 0.06, bounce: 0.7, ev: 1.3 }
};
var LIGHT = { t: 0.66, weather: 'clear', dir: new THREE.Vector3(0, 1, 0), elev: 45 };

// sun path for a building at Beijing's latitude (39.9 N) facing south (+z),
// at the equinox: sunrise due east at 06:00, 50 degrees at noon, due west at
// 18:00. The slider runs 05:00 -> 19:00, so both ends sit in twilight.
function sunDirection(t, out) {
  var hour = 5 + t * 14;
  var H = (hour - 12) * 15 * Math.PI / 180;            // hour angle
  var phi = 39.9 * Math.PI / 180;
  var sinEl = Math.cos(phi) * Math.cos(H);
  var el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  var A = Math.atan2(Math.sin(H), Math.sin(phi) * Math.cos(H)); // from south, + west
  // a sun two degrees under the horizon still lights the sky; keep a floor so
  // the directional light never flips beneath the ground
  var elC = Math.max(el, -0.02);
  out.set(-Math.sin(A) * Math.cos(elC), Math.sin(elC), Math.cos(A) * Math.cos(elC)).normalize();
  return el * 180 / Math.PI;
}

// warm, dim, and low near the horizon (air mass), white and strong overhead
function sunColourIntensity(elDeg, colour) {
  var k = Math.max(0, Math.min(1, (elDeg + 1) / 6));         // fades in over the first few degrees
  var warm = Math.max(0, Math.min(1, (elDeg - 1) / 28));
  colour.setRGB(1.0, 0.56 + 0.40 * warm, 0.30 + 0.62 * warm);
  return 3.1 * k * (0.45 + 0.55 * Math.pow(Math.max(0, Math.min(1, elDeg / 40)), 0.6));
}

var _fogRT = null, _fogCam = null, _fogScene = null, _fogSky = null;
// Read the sky's actual colour just above the horizon in four directions and
// average them. The fog is mixed in after tone mapping and encoding in r128,
// so the readback is taken through an sRGB target and used as-is.
function sampleHorizon() {
  try {
    if (!_fogRT) {
      _fogRT = new THREE.WebGLRenderTarget(16, 16);
      _fogRT.texture.encoding = THREE.sRGBEncoding;
      _fogCam = new THREE.PerspectiveCamera(20, 1, 0.1, 100);
      _fogScene = new THREE.Scene();
      _fogSky = new THREE.Sky();
      _fogSky.scale.setScalar(50);
      _fogScene.add(_fogSky);
    }
    copySkyUniforms(_fogSky);
    var buf = new Uint8Array(16 * 16 * 4), acc = [0, 0, 0], n = 0;
    var prev = renderer.getRenderTarget();
    for (var k = 0; k < 4; k++) {
      var a = k * Math.PI / 2 + 0.4;
      _fogCam.position.set(0, 0, 0);
      _fogCam.lookAt(Math.sin(a), 0.035, Math.cos(a));
      renderer.setRenderTarget(_fogRT);
      renderer.render(_fogScene, _fogCam);
      renderer.readRenderTargetPixels(_fogRT, 0, 0, 16, 16, buf);
      for (var i = 0; i < buf.length; i += 4) { acc[0] += buf[i]; acc[1] += buf[i + 1]; acc[2] += buf[i + 2]; n++; }
    }
    renderer.setRenderTarget(prev);
    scene.fog.color.setRGB(acc[0] / n / 255, acc[1] / n / 255, acc[2] / n / 255);
  } catch (e) { /* keep the previous fog colour */ }
}

function copySkyUniforms(s) {
  var src = sky.material.uniforms, dst = s.material.uniforms;
  ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'].forEach(function (k) {
    dst[k].value = src[k].value;
  });
  dst.sunPosition.value.copy(src.sunPosition.value);
  dst.up.value.set(0, 1, 0);
}

// paving albedo the bounce light is taken from; site.js sets it from the
// courtyard material so a pale marble court lights the eaves more than earth
var BOUNCE_ALBEDO = new THREE.Color(0.26, 0.25, 0.23);

var _envTimer = 0;
function rebuildEnvironment() {
  var w = WEATHER[LIGHT.weather];
  copySkyUniforms(envSky);
  envSunMask.position.copy(LIGHT.dir).multiplyScalar(24);
  envSunMask.lookAt(0, 0, 0);
  // ground radiance ~ albedo x (direct + sky) irradiance, in the same legacy
  // units the materials use (outgoing = albedo * I * NdotL)
  var direct = sun.intensity * Math.max(0, LIGHT.dir.y);
  var skyAmb = 0.55 * w.bounce;
  envGround.material.color.copy(BOUNCE_ALBEDO).multiplyScalar(direct * 0.55 + skyAmb)
    .multiply(new THREE.Color(1, 0.97, 0.92));
  var next = pmrem.fromScene(envScene, 0, 0.1, 200);
  if (envRT) envRT.dispose();
  envRT = next;
  scene.environment = envRT.texture;
  requestRender();
}

function applySky() {
  var w = WEATHER[LIGHT.weather] || WEATHER.clear;
  var u = sky.material.uniforms;
  u.turbidity.value = w.turbidity;
  u.rayleigh.value = w.rayleigh;
  u.mieCoefficient.value = w.mie;
  u.mieDirectionalG.value = w.g;
  u.sunPosition.value.copy(LIGHT.dir).multiplyScalar(1000);
  u.up.value.set(0, 1, 0);
  scene.fog.near = w.fog[0] * FOG_SCALE;
  scene.fog.far = w.fog[1] * FOG_SCALE;
}

function setFogScale(r) {
  FOG_SCALE = Math.max(8, r);
  applySky();
  requestRender();
}

// ---------------------------------------------------------------------------
//  远山 distant hills: a ring of low ridgelines far beyond the court, coloured
//  by hand as aerial perspective -- the horizon colour with a little of the
//  hills' own blue-grey left in it. Unfogged, so the haze can't erase them.
// ---------------------------------------------------------------------------
var hills = (function () {
  var N = 360, R = 2600, pos = [], idx = [];
  var f = new TEXGEN.Fbm(4242, 8, 5);
  for (var i = 0; i <= N; i++) {
    var a = i / N * Math.PI * 2;
    var u = i / N;
    // higher to the north and west, as round Beijing; low and broken to the south-east
    var dir = 0.55 + 0.45 * Math.max(0, -Math.cos(a - Math.PI * 0.15));
    var hgt = (40 + 260 * Math.pow(f.at(u, 0.3), 1.6) * dir) * (0.6 + 0.4 * f.at(u * 3, 0.7));
    var x = Math.sin(a) * R, z = Math.cos(a) * R;
    pos.push(x, -20, z, x, hgt, z);
    if (i < N) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  var g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x8090a0, fog: false, toneMapped: false, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  scene.add(m);
  return m;
})();
function tintHills() {
  var w = WEATHER[LIGHT.weather] || WEATHER.clear;
  var fogC = scene.fog.color.clone();             // display-space, like the fog
  var shade = new THREE.Color(0.30, 0.36, 0.44).lerp(fogC, 0.35);
  var dayK = Math.max(0.15, Math.min(1, (LIGHT.elev + 4) / 20));
  var c = fogC.clone().lerp(shade.multiplyScalar(dayK), w.hills);
  // toneMapped off, so convert: the encoder will turn this back into exactly c
  hills.material.color.copy(c).convertSRGBToLinear();
}

// Called on every slider tick: the cheap parts now, the PMREM + horizon
// readback at most every 90 ms and once more when the slider settles.
function applyDaylight(t, weather) {
  if (t !== undefined && t !== null) LIGHT.t = Math.max(0, Math.min(1, t));
  if (weather && WEATHER[weather]) LIGHT.weather = weather;
  var w = WEATHER[LIGHT.weather];
  LIGHT.elev = sunDirection(LIGHT.t, LIGHT.dir);
  sun.intensity = sunColourIntensity(LIGHT.elev, sun.color) * w.sun;
  if (LIGHT.weather === 'overcast') sun.color.lerp(new THREE.Color(0.9, 0.93, 1.0), 0.6);
  hemi.intensity = 0.08;
  // a camera opens up at golden hour: lift exposure as the sun drops so dawn
  // and dusk read as warm light rather than as night
  var low = Math.max(0, Math.min(1, (22 - LIGHT.elev) / 24));
  renderer.toneMappingExposure = 0.62 * w.ev * (1 + 1.5 * low * low);
  applySky();
  placeSun();
  markShadowsDirty();
  clearTimeout(_envTimer);
  var now = performance.now();
  if (!applyDaylight._last || now - applyDaylight._last > 90) {
    applyDaylight._last = now;
    rebuildEnvironment(); sampleHorizon(); tintHills();
  }
  _envTimer = setTimeout(function () { rebuildEnvironment(); sampleHorizon(); tintHills(); requestRender(); }, 120);
}

// ---------------------------------------------------------------------------
//  shadow frustum: fitted to the building's bounding sphere, so a 13-storey
//  pagoda and a three-bay hall both get the whole map
// ---------------------------------------------------------------------------
var SHADOW_FIT = { center: new THREE.Vector3(0, 2, 0), radius: 10 };
function fitShadowTo(center, radius) {
  SHADOW_FIT.center.copy(center);
  SHADOW_FIT.radius = radius;
  placeSun();
  markShadowsDirty();
}
function placeSun() {
  var c = SHADOW_FIT.center, r = SHADOW_FIT.radius;
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(LIGHT.dir, r * 3);
  var sc = sun.shadow.camera;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
  sc.near = r * 0.5; sc.far = r * 5.5;
  sc.updateProjectionMatrix();
  // texel size in world units decides how much bias a curved roof needs
  var texel = (2 * r) / SHADOW_SIZE;
  sun.shadow.normalBias = texel * 1.6;
  sun.shadow.bias = -0.00025;
  sun.target.updateMatrixWorld();
}

// ============================================================================
//  CAMERA FLIGHT — view presets and the entry sweep. Driven from the render
//  loop; any pointer or wheel on the canvas cancels it so the user always wins.
// ============================================================================
var camFlight = null;

// rebuild() records how big the thing it just built is, so the camera can frame
// it. Derived from the real dimensions rather than a Box3, because the tile and
// rafter runs are InstancedMesh and r128's Box3 ignores per-instance matrices.
var frameRadius = 20;
var MODEL_INFO = { type: 'hall', hw: 4.5, hd: 2.8, baseH: 0.34, eaveY: 2.4, top: 5, M: 0.25, frontZ: 4 };

function fitFor(width, height) {
  var t = Math.tan(camera.fov * Math.PI / 360);
  var byHeight = (height * 1.25) / t;
  var byWidth  = (width  * 1.15) / (t * camera.aspect);
  frameRadius = Math.max(byHeight, byWidth) * 0.92;
  frameRadius = Math.min(Math.max(frameRadius, controls.minDistance * 2), controls.maxDistance * 0.8);
  return frameRadius;
}

function flyTo(pos, target, ms) {
  camFlight = {
    start: performance.now(), ms: ms || 700,
    p0: camera.position.clone(), p1: pos.clone(),
    t0: controls.target.clone(), t1: target.clone()
  };
  requestRender();
}

function updateCameraFlight() {
  if (!camFlight) return false;
  var k = (performance.now() - camFlight.start) / camFlight.ms;
  if (k >= 1) k = 1;
  var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // easeInOutCubic
  camera.position.lerpVectors(camFlight.p0, camFlight.p1, e);
  controls.target.lerpVectors(camFlight.t0, camFlight.t1, e);
  if (k === 1) camFlight = null;
  return true;
}

// azimuth/elevation in degrees about a target (default: the current one)
function viewPreset(azDeg, elDeg, ms, radius, target) {
  var t = target || controls.target;
  var r = radius || Math.max(4, camera.position.distanceTo(controls.target));
  var el = elDeg * Math.PI / 180, az = azDeg * Math.PI / 180;
  flyTo(new THREE.Vector3(
    t.x + r * Math.cos(el) * Math.sin(az),
    t.y + r * Math.sin(el),
    t.z + r * Math.cos(el) * Math.cos(az)
  ), t.clone(), ms);
}

var FRAME_TARGET = new THREE.Vector3(0, 2, 0);
// re-frame the current model without changing which way the camera looks
function frameModel(ms) {
  var t = controls.target, p = camera.position;
  var dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z;
  var r = Math.hypot(dx, dy, dz) || 1;
  var az = Math.atan2(dx, dz) * 180 / Math.PI;
  var el = Math.asin(dy / r) * 180 / Math.PI;
  el = Math.max(8, Math.min(80, el));
  viewPreset(az, el, ms || 650, frameRadius, FRAME_TARGET);
}

// pull back and swing around into the three-quarter view
function introFlight() {
  var t = FRAME_TARGET;
  controls.target.copy(t);
  var r = frameRadius;
  var el0 = 38 * Math.PI / 180, az0 = -24 * Math.PI / 180, r0 = r * 1.9;
  camera.position.set(t.x + r0 * Math.cos(el0) * Math.sin(az0),
                      t.y + r0 * Math.sin(el0),
                      t.z + r0 * Math.cos(el0) * Math.cos(az0));
  viewPreset(36, 16, 2000, r, t);
}

['pointerdown', 'wheel'].forEach(function (ev) {
  renderer.domElement.addEventListener(ev, function () { camFlight = null; }, { passive: true });
});

// ============================================================================
//  TEXTURES — the procedural sets from textures.js, cloned per repeat and
//  cached, so a rebuild reuses GPU textures instead of re-uploading thirty
//  of them for every slider tick.
// ============================================================================
TEXGEN.init(renderer);

var TEX_CACHE = {}, TEX_USED = {};
function texRepeat(base, rx, ry) {
  var key = base.uuid + '|' + rx.toFixed(4) + '|' + ry.toFixed(4);
  TEX_USED[key] = true;
  var t = TEX_CACHE[key];
  if (t) return t;
  t = base.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  t.userData = t.userData || {};
  t.userData.cached = true;
  TEX_CACHE[key] = t;
  return t;
}
// called after each rebuild: anything the new building didn't ask for is freed
function purgeTextureCache() {
  Object.keys(TEX_CACHE).forEach(function (k) {
    if (!TEX_USED[k]) { TEX_CACHE[k].dispose(); delete TEX_CACHE[k]; }
  });
  TEX_USED = {};
}

// Dress a MeshStandardMaterial with one of the procedural sets. `size` is the
// real extent of one repeat in metres; M is scene units per metre, so the
// repeat comes out in tiles per scene unit -- which is what worldScaleUVs()
// makes the UVs measure.
function dress(mat, setName, M, opts) {
  opts = opts || {};
  var set = TEXGEN.sets[setName];
  var size = opts.size || set.size || 1;
  var sx = Array.isArray(size) ? size[0] : size, sy = Array.isArray(size) ? size[1] : size;
  var rx = 1 / (sx * M), ry = 1 / (sy * M);
  mat.map = texRepeat(set.map, rx, ry);
  mat.normalMap = texRepeat(set.normal, rx, ry);
  mat.roughnessMap = texRepeat(set.rough, rx, ry);
  var ns = opts.normal === undefined ? 1 : opts.normal;
  mat.normalScale = new THREE.Vector2(ns, ns);
  // the roughness map holds absolute values; the scalar becomes a multiplier
  mat.roughness = opts.roughMul === undefined ? 1 : opts.roughMul;
  return mat;
}

// ----------------------------------------------------------------------------
//  BoxGeometry gives every face UVs of 0..1 whatever its real size, so a 9-unit
//  platform tier and a 0.24-unit step tread would show the same number of
//  bricks. Rewriting the UVs in world units gives one texel density across the
//  whole building; each material's map.repeat then means "tiles per world unit".
// ----------------------------------------------------------------------------
function worldScaleUVs(root) {
  root.traverse(function (o) {
    if (!o.isMesh) return;
    var geo = o.geometry, p = geo.parameters;
    if (!p || geo.userData.uvScaled || geo.userData.ownUVs) return;
    var uv = geo.attributes.uv;
    if (!uv) return;
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    var tex = null;
    mats.forEach(function (m) { if (m && (m.map || m.normalMap) && !tex) tex = m.map || m.normalMap; });
    if (!tex) return;

    if (p.depth !== undefined && p.width !== undefined && p.height !== undefined && uv.count === 24) {
      // BoxGeometry face order is +X -X +Y -Y +Z -Z, four verts each
      var f = [[p.depth, p.height], [p.depth, p.height],
               [p.width, p.depth],  [p.width, p.depth],
               [p.width, p.height], [p.width, p.height]];
      for (var i = 0; i < 6; i++) {
        for (var v = 0; v < 4; v++) {
          var k = i * 4 + v;
          uv.setXY(k, uv.getX(k) * f[i][0], uv.getY(k) * f[i][1]);
        }
      }
    } else if (p.radiusTop !== undefined) {
      // Cylinder u wraps the circumference: land it on a whole number of
      // texture repeats or the grain tears open at the seam.
      var circ = Math.PI * (p.radiusTop + p.radiusBottom);
      var tiles = Math.max(1, Math.round(circ * tex.repeat.x));
      var us = tiles / tex.repeat.x;
      for (var q = 0; q < uv.count; q++)
        uv.setXY(q, uv.getX(q) * us, uv.getY(q) * p.height);
    } else if (p.width !== undefined && p.height !== undefined && p.depth === undefined) {
      for (var q2 = 0; q2 < uv.count; q2++)
        uv.setXY(q2, uv.getX(q2) * p.width, uv.getY(q2) * p.height);
    } else return;

    uv.needsUpdate = true;
    geo.userData.uvScaled = true;
  });
}
