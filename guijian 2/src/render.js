// ============================================================================
//  RENDER LOOP — on demand, with a high-quality still
//
//  Nothing is drawn unless something changed. While the camera moves the scene
//  is drawn directly (MSAA, shadows from the cached map), which keeps orbiting
//  smooth. The moment it stops, one more frame is drawn through the HQ path:
//  4x multisampled colour, a normal + depth pass, screen-space ambient
//  occlusion and a depth-aware blur, composited over the colour. That frame
//  then stays on screen at zero cost until the next change. Ambient occlusion
//  is what puts the dark into the 斗栱, the lattice, the underside of the
//  eave and the foot of every column -- the part of realism that direct
//  sunlight and an environment map cannot produce on their own.
// ============================================================================

var HQ = {
  enabled: true,   // the 精细 switch
  ok: true,        // false if this GPU can't run it -- then we never try again
  rt: null, size: new THREE.Vector2(), aoScale: 1,
  strength: 0.9
};

var _quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
var _quadGeo = new THREE.PlaneGeometry(2, 2);
function FsQuad(mat) { this.mesh = new THREE.Mesh(_quadGeo, mat); this.scene = new THREE.Scene(); this.scene.add(this.mesh); }
FsQuad.prototype.render = function (target) {
  renderer.setRenderTarget(target || null);
  renderer.render(this.scene, _quadCam);
};

var QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

var AO_FS = [
  'varying vec2 vUv;',
  'uniform sampler2D tNormal; uniform sampler2D tDepth;',
  'uniform mat4 uProj; uniform mat4 uInvProj;',
  'uniform float uRadius; uniform float uBias; uniform float uIntensity; uniform vec2 uFade;',
  'vec3 viewPos(vec2 uv, float d){ vec4 c = vec4(uv*2.0-1.0, d*2.0-1.0, 1.0); vec4 v = uInvProj*c; return v.xyz/v.w; }',
  'float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }',
  'void main(){',
  '  float d = texture2D(tDepth, vUv).x;',
  '  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }',
  '  vec3 P = viewPos(vUv, d);',
  '  vec3 N = normalize(texture2D(tNormal, vUv).xyz*2.0-1.0);',
  // a fixed tangent frame; the per-pixel rotation goes into the spiral instead
  '  vec3 up = abs(N.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);',
  '  vec3 T = normalize(cross(up, N)); vec3 B = cross(N, T);',
  '  float rot = ign(gl_FragCoord.xy)*6.2831853;',
  '  float occ = 0.0;',
  // 16 samples on a golden-angle spiral over the hemisphere, denser near the
  // centre, so both the crease of a 斗 and the depth of an eave register
  '  for (int i = 0; i < 16; i++) {',
  '    float fi = float(i);',
  '    float a = fi*2.39996 + rot;',
  '    float r = sqrt((fi + 0.5)/16.0);',
  '    vec3 k = vec3(cos(a)*r, sin(a)*r, sqrt(max(0.0, 1.0 - r*r)));',
  '    float sc = mix(0.12, 1.0, (fi/16.0)*(fi/16.0));',
  '    vec3 S = P + (T*k.x + B*k.y + N*k.z)*sc*uRadius;',
  '    vec4 o = uProj*vec4(S, 1.0);',
  '    vec2 suv = o.xy/o.w*0.5+0.5;',
  '    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;',
  '    vec3 SP = viewPos(suv, texture2D(tDepth, suv).x);',
  '    float range = smoothstep(0.0, 1.0, uRadius/max(1e-4, abs(P.z - SP.z)));',
  '    occ += (SP.z >= S.z + uBias ? 1.0 : 0.0)*range;',
  '  }',
  // fade out with distance: far off, the radius is smaller than a depth step
  // and the ground would occlude itself into a band along the horizon
  '  float fade = 1.0 - smoothstep(uFade.x, uFade.y, -P.z);',
  '  float ao = clamp(1.0 - occ/16.0*uIntensity*fade, 0.0, 1.0);',
  '  gl_FragColor = vec4(vec3(ao), 1.0);',
  '}'
].join('\n');

// separable, depth-aware: a sample on another surface (big depth jump) is
// ignored, so occlusion doesn't bleed across a column silhouette onto the sky
var BLUR_FS = [
  'varying vec2 vUv;',
  'uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir;',
  'uniform float uNear; uniform float uFar;',
  'float lin(float d){ float z = d*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); }',
  'void main(){',
  '  float c = lin(texture2D(tDepth, vUv).x);',
  '  float s = 0.0, w = 0.0;',
  '  for (int i = -4; i <= 4; i++) {',
  '    vec2 uv = vUv + uDir*float(i);',
  '    float dz = abs(lin(texture2D(tDepth, uv).x) - c)/max(c, 1e-3);',
  '    float k = exp(-float(i*i)/10.0)*(dz < 0.02 ? 1.0 : 0.0);',
  '    s += texture2D(tAO, uv).r*k; w += k;',
  '  }',
  '  gl_FragColor = vec4(vec3(s/max(w, 1e-4)), 1.0);',
  '}'
].join('\n');

var COMP_FS = [
  'varying vec2 vUv;',
  'uniform sampler2D tScene; uniform sampler2D tAO; uniform float uStrength; uniform float uDebug;',
  'void main(){',
  '  vec3 col = texture2D(tScene, vUv).rgb;',
  '  float ao = texture2D(tAO, vUv).r;',
  '  if (uDebug > 0.5) { gl_FragColor = vec4(vec3(ao), 1.0); return; }',
  // the scene target already holds tone-mapped, sRGB-encoded colour, so the
  // occlusion is applied in display space; a gentle curve keeps the lift in
  // the highlights
  '  ao = mix(1.0, ao, uStrength);',
  '  col *= ao;',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

var _hq = null;
function hqBuild() {
  if (_hq) return _hq;
  if (!renderer.capabilities.isWebGL2) { HQ.ok = false; return null; }
  _hq = {
    normalMat: new THREE.MeshNormalMaterial(),
    ao: new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: AO_FS, depthTest: false, depthWrite: false,
      uniforms: { tNormal: { value: null }, tDepth: { value: null }, uProj: { value: new THREE.Matrix4() },
                  uInvProj: { value: new THREE.Matrix4() }, uRadius: { value: 0.3 }, uBias: { value: 0.01 },
                  uIntensity: { value: 1.7 }, uFade: { value: new THREE.Vector2(30, 60) } }
    }),
    blur: new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false,
      uniforms: { tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() },
                  uNear: { value: 0.05 }, uFar: { value: 100 } }
    }),
    comp: new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: null }, tAO: { value: null }, uStrength: { value: HQ.strength }, uDebug: { value: 0 } }
    })
  };
  _hq.aoQuad = new FsQuad(_hq.ao);
  _hq.blurQuad = new FsQuad(_hq.blur);
  _hq.compQuad = new FsQuad(_hq.comp);
  _hq.normalMat.blending = THREE.NoBlending;
  return _hq;
}

function hqTargets() {
  var size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (HQ.rt && HQ.size.equals(size)) return HQ.rt;
  if (HQ.rt) ['scene', 'normal', 'ao', 'blur'].forEach(function (k) { HQ.rt[k].dispose(); });
  HQ.size.copy(size);
  var w = size.x, h = size.y;
  // occlusion is soft by nature: on a high-dpi screen half resolution is
  // indistinguishable and four times cheaper
  var s = renderer.getPixelRatio() > 1.4 ? 0.5 : 1;
  var aw = Math.max(1, Math.round(w * s)), ah = Math.max(1, Math.round(h * s));
  var sceneRT = new THREE.WebGLMultisampleRenderTarget(w, h, { format: THREE.RGBAFormat });
  sceneRT.samples = 4;
  // r128 gives a multisampled target a 16-bit depth buffer unless a depth
  // texture says otherwise -- at viewing distance that is ~0.3 m of depth
  // resolution, and the rafters z-fight up through the tiles. Ask for 24.
  sceneRT.depthTexture = new THREE.DepthTexture(w, h);
  sceneRT.depthTexture.type = THREE.UnsignedIntType;
  sceneRT.texture.encoding = THREE.sRGBEncoding;
  var depthTex = new THREE.DepthTexture(aw, ah);
  depthTex.type = THREE.UnsignedIntType;
  var normalRT = new THREE.WebGLRenderTarget(aw, ah, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, depthTexture: depthTex });
  var aoRT = new THREE.WebGLRenderTarget(aw, ah, { format: THREE.RGBAFormat });
  var blurRT = new THREE.WebGLRenderTarget(aw, ah, { format: THREE.RGBAFormat });
  HQ.rt = { scene: sceneRT, normal: normalRT, ao: aoRT, blur: blurRT, aw: aw, ah: ah };
  return HQ.rt;
}

function hqRender() {
  var q = hqBuild();
  if (!q) return false;
  var T = hqTargets();
  var prevBg = scene.background;

  // 1. colour, multisampled; the shadow map is updated here if it needs it
  renderer.setRenderTarget(T.scene);
  renderer.clear();
  renderer.render(scene, camera);

  // 2. view-space normals + depth, sky hidden, no shadow re-render
  var skyVis = sky.visible, fog = scene.fog;
  sky.visible = false; scene.fog = null;
  scene.overrideMaterial = q.normalMat;
  var oldClear = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x7f7fff, 1);
  renderer.setRenderTarget(T.normal);
  renderer.clear();
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  sky.visible = skyVis; scene.fog = fog;
  renderer.setClearColor(oldClear, oldAlpha);

  // 3. occlusion. Radius is in view-space units: about a metre and a half at
  // the building's real scale, which is the depth of a 斗栱 band
  var u = q.ao.uniforms;
  u.tNormal.value = T.normal.texture;
  u.tDepth.value = T.normal.depthTexture;
  u.uProj.value.copy(camera.projectionMatrix);
  u.uInvProj.value.copy(camera.projectionMatrixInverse);
  u.uRadius.value = Math.max(0.05, 1.4 * (MODEL_INFO.M || 0.25));
  u.uBias.value = 0.04 * u.uRadius.value;
  u.uFade.value.set(frameRadius * 1.6, frameRadius * 3.2);
  q.aoQuad.render(T.ao);

  // 4. blur, horizontal then vertical
  var b = q.blur.uniforms;
  b.tDepth.value = T.normal.depthTexture;
  b.uNear.value = camera.near; b.uFar.value = camera.far;
  b.tAO.value = T.ao.texture; b.uDir.value.set(1 / T.aw, 0);
  q.blurQuad.render(T.blur);
  b.tAO.value = T.blur.texture; b.uDir.value.set(0, 1 / T.ah);
  q.blurQuad.render(T.ao);

  // 5. composite to the screen
  q.comp.uniforms.tScene.value = T.scene.texture;
  q.comp.uniforms.tAO.value = T.ao.texture;
  q.comp.uniforms.uStrength.value = HQ.strength;
  q.comp.uniforms.uDebug.value = HQ.debug ? 1 : 0;
  q.compQuad.render(null);
  scene.background = prevBg;
  return true;
}

function renderFrame(hq) {
  if (RENDER_STATE.shadowsDirty) {
    renderer.shadowMap.needsUpdate = true;
    RENDER_STATE.shadowsDirty = false;
  }
  if (hq && HQ.enabled && HQ.ok) {
    try { if (hqRender()) return; }
    catch (e) { HQ.ok = false; console.warn('HQ render disabled:', e); }
  }
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
//  near plane follows the viewing distance: depth precision goes as near/z^2,
//  so a fixed 5 cm near plane wastes most of the buffer on the first metre
// ---------------------------------------------------------------------------
function fitNearPlane() {
  var d = WALK.active ? 1 : camera.position.distanceTo(controls.target);
  var n = Math.max(0.03, Math.min(0.8, d * 0.012));
  if (Math.abs(n - camera.near) / camera.near > 0.05) {
    camera.near = n;
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
//  camera limits: never under the paving, never with the target underground
// ---------------------------------------------------------------------------
function clampCamera() {
  var minY = Math.max(0.08, 0.5 * (MODEL_INFO.M || 0.25));
  var changed = false;
  if (camera.position.y < minY) { camera.position.y = minY; changed = true; }
  if (controls.target.y < 0) { controls.target.y = 0; changed = true; }
  return changed;
}

// ---------------------------------------------------------------------------
//  漫游 WALK — eye height, WASD / arrows, drag to look. Steps onto the 台基
//  where it is, and is kept out of the hall itself.
// ---------------------------------------------------------------------------
var WALK = { active: false, yaw: 0, pitch: 0, keys: {}, last: 0, drag: null, speed: 1 };

function walkGround(x, z) {
  var I = MODEL_INFO;
  if (I.platform && Math.abs(x) <= I.platform.hw && Math.abs(z) <= I.platform.hd) return I.baseH;
  // the flight of steps ramps up to the platform
  if (I.steps && Math.abs(x) <= I.steps.hw && z > I.steps.z0 && z <= I.steps.z1) {
    return I.baseH * (1 - (z - I.steps.z0) / (I.steps.z1 - I.steps.z0));
  }
  return 0;
}

function walkEnter() {
  var I = MODEL_INFO;
  WALK.active = true;
  controls.enabled = false;
  camFlight = null;
  var eye = 1.6 * I.M;
  var z = (I.frontZ || 6) + 5.5 * I.M * 4;
  camera.position.set(0, walkGround(0, z) + eye, z);
  WALK.yaw = 0; WALK.pitch = 0.18;
  walkApply();
  document.body.classList.add('walking');
  requestRender();
}
function walkExit() {
  WALK.active = false;
  controls.enabled = true;
  var dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  controls.target.copy(camera.position).addScaledVector(dir, Math.max(2, frameRadius * 0.3));
  document.body.classList.remove('walking');
  requestRender();
}
function walkApply() {
  var d = new THREE.Vector3(-Math.sin(WALK.yaw) * Math.cos(WALK.pitch), Math.sin(WALK.pitch), -Math.cos(WALK.yaw) * Math.cos(WALK.pitch));
  camera.lookAt(camera.position.x + d.x, camera.position.y + d.y, camera.position.z + d.z);
}
function walkUpdate(dt) {
  if (!WALK.active) return false;
  var k = WALK.keys, f = 0, s = 0;
  if (k.KeyW || k.ArrowUp) f += 1;
  if (k.KeyS || k.ArrowDown) f -= 1;
  if (k.KeyA || k.ArrowLeft) s -= 1;
  if (k.KeyD || k.ArrowRight) s += 1;
  if (!f && !s) return false;
  var I = MODEL_INFO, sp = 3.2 * I.M * (k.ShiftLeft || k.ShiftRight ? 2.5 : 1) * dt;
  var fx = -Math.sin(WALK.yaw), fz = -Math.cos(WALK.yaw);
  var nx = camera.position.x + (fx * f - fz * s) * sp;
  var nz = camera.position.z + (fz * f + fx * s) * sp;
  // the hall's own walls and screens: slide along them rather than through
  if (I.solid && Math.abs(nx) < I.solid.hw && Math.abs(nz) < I.solid.hd) {
    if (Math.abs(camera.position.x) >= I.solid.hw) nx = camera.position.x;
    else if (Math.abs(camera.position.z) >= I.solid.hd) nz = camera.position.z;
    else return false;
  }
  if (I.court) { nx = Math.max(-I.court.hx, Math.min(I.court.hx, nx)); nz = Math.max(I.court.zb, Math.min(I.court.zf, nz)); }
  camera.position.x = nx; camera.position.z = nz;
  camera.position.y = walkGround(nx, nz) + 1.6 * I.M;
  walkApply();
  return true;
}

renderer.domElement.addEventListener('pointerdown', function (e) {
  if (!WALK.active) return;
  WALK.drag = { x: e.clientX, y: e.clientY, yaw: WALK.yaw, pitch: WALK.pitch };
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch (er) {}
});
renderer.domElement.addEventListener('pointermove', function (e) {
  if (!WALK.active || !WALK.drag) return;
  WALK.yaw = WALK.drag.yaw + (e.clientX - WALK.drag.x) * 0.004;
  WALK.pitch = Math.max(-1.2, Math.min(1.3, WALK.drag.pitch + (e.clientY - WALK.drag.y) * 0.004));
  walkApply();
  requestRender(); RENDER_STATE.lastMotion = performance.now();
});
['pointerup', 'pointercancel'].forEach(function (ev) {
  renderer.domElement.addEventListener(ev, function () { WALK.drag = null; });
});
renderer.domElement.addEventListener('wheel', function (e) {
  if (!WALK.active) return;
  e.preventDefault();
  camera.fov = Math.max(22, Math.min(75, camera.fov + e.deltaY * 0.03));
  camera.updateProjectionMatrix();
  requestRender();
}, { passive: false });

// ---------------------------------------------------------------------------
//  double-click: fly to whatever is under the cursor, so any detail -- a
//  走兽, a 斗栱, a 螭首 -- can be orbited at arm's length
// ---------------------------------------------------------------------------
var _ray = new THREE.Raycaster();
renderer.domElement.addEventListener('dblclick', function (e) {
  if (WALK.active) return;
  var r = renderer.domElement.getBoundingClientRect();
  var p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(p, camera);
  var hits = _ray.intersectObjects([buildingGroup, siteGroup], true);
  if (!hits.length) return;
  var at = hits[0].point;
  var dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  var dist = Math.max(1.0, Math.min(camera.position.distanceTo(at) * 0.45, frameRadius * 0.6));
  flyTo(at.clone().addScaledVector(dir, dist), at, 650);
});

// ---------------------------------------------------------------------------
//  keyboard orbit (when no control has focus)
// ---------------------------------------------------------------------------
function orbitBy(dAz, dEl, zoom) {
  var t = controls.target, p = camera.position;
  var off = new THREE.Vector3().subVectors(p, t);
  var sph = new THREE.Spherical().setFromVector3(off);
  sph.theta += dAz;
  sph.phi = Math.max(0.05, Math.min(controls.maxPolarAngle, sph.phi - dEl));
  sph.radius = Math.max(controls.minDistance, Math.min(controls.maxDistance, sph.radius * (zoom || 1)));
  off.setFromSpherical(sph);
  flyTo(new THREE.Vector3().addVectors(t, off), t.clone(), 260);
}
function typingInControl() {
  var a = document.activeElement;
  if (!a) return false;
  var tag = a.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || a.getAttribute('role') === 'slider';
}
document.addEventListener('keydown', function (e) {
  if (WALK.active) {
    if (e.code === 'Escape') { walkExit(); if (window.onWalkChange) window.onWalkChange(false); return; }
    WALK.keys[e.code] = true;
    if (/^Arrow/.test(e.code)) e.preventDefault();
    return;
  }
  if (!document.body.classList.contains('entered') || typingInControl() || e.metaKey || e.ctrlKey) return;
  var step = e.shiftKey ? 0.5 : 0.18;
  if (e.key === 'ArrowLeft') { orbitBy(-step, 0); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { orbitBy(step, 0); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { orbitBy(0, step * 0.6); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { orbitBy(0, -step * 0.6); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') orbitBy(0, 0, 0.8);
  else if (e.key === '-' || e.key === '_') orbitBy(0, 0, 1.25);
  else if (e.key === 'f' || e.key === 'F') frameModel(600);
});
document.addEventListener('keyup', function (e) { WALK.keys[e.code] = false; });
window.addEventListener('blur', function () { WALK.keys = {}; });

// ---------------------------------------------------------------------------
controls.addEventListener('change', function () { RENDER_STATE.lastMotion = performance.now(); requestRender(); });

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  requestRender();
});

var _lastT = performance.now();
function startLoop() {
  (function loop() {
    requestAnimationFrame(loop);
    var now = performance.now(), dt = Math.min(0.1, (now - _lastT) / 1000);
    _lastT = now;
    var moved = updateCameraFlight();
    if (!WALK.active) moved = controls.update() || moved;
    else moved = walkUpdate(dt) || moved;
    if (!WALK.active) moved = clampCamera() || moved;
    if (moved || camFlight) fitNearPlane();
    if (controls.autoRotate) moved = true;
    if (moved) { RENDER_STATE.lastMotion = now; RENDER_STATE.dirty = true; RENDER_STATE.hqDone = false; }
    if (RENDER_STATE.dirty) {
      RENDER_STATE.dirty = false;
      renderFrame(false);
      return;
    }
    if (!RENDER_STATE.hqDone && now - RENDER_STATE.lastMotion > 160) {
      RENDER_STATE.hqDone = true;
      renderFrame(true);
    }
  })();
}
