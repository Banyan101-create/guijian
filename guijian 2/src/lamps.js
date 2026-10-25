// ============================================================================
//  灯 LAMPS — what the palace lights after dark
//
//  * 宫灯 lanterns: red silk on a gilt frame, hung under the eaves, at the
//    corners of every pagoda storey, along the corridors. Instanced: one draw
//    call per material however many hang.
//  * 石灯 stone lanterns standing in the court, their windows lit.
//  * windows: the paper behind every lattice glows (the glass material's
//    emissive is driven from here), so a hall at night reads as lit within.
//  * glow: a soft billboard round every flame, so a lantern seen across the
//    court has the bloom the eye gives it; a pool of warm light on the paving
//    under each standing lantern; and a handful of real point lights at the
//    lanterns nearest the building, so its columns and terrace catch the light.
//
//  Everything here is driven by one number: how lit the lamps are, which rises
//  through dusk and falls through dawn (DAYLIGHT_HOOKS -> applyNightLights).
// ============================================================================

var LAMPS = { mats: [], lights: [], uniforms: [], k: 0 };
var LAMP_COLOUR = new THREE.Color(1.0, 0.62, 0.30);
var POINT_LIGHTS = 6;

// The point lights are made once and live in the scene for good: the number of
// lights is baked into every shader, so adding or removing one -- on a rebuild,
// at dusk -- would recompile every material. They are only moved and dimmed.
var LAMP_POOL = [];
for (var _pl = 0; _pl < POINT_LIGHTS; _pl++) {
  var _l = new THREE.PointLight(LAMP_COLOUR.getHex(), 0, 1, 2);
  _l.position.set(0, -1000, 0);
  _l.castShadow = false;
  scene.add(_l);
  LAMP_POOL.push(_l);
}

// called at the start of every rebuild: the old lamps went with the old groups
function resetLamps() {
  LAMPS.mats = []; LAMPS.lights = []; LAMPS.uniforms = [];
  LAMP_POOL.forEach(function (l) { l.intensity = 0; l.position.set(0, -1000, 0); });
}

// a material that glows at night: its emissive colour and full intensity
function lampMat(mat, colour, intensity) {
  mat.emissive = (colour || LAMP_COLOUR).clone();
  mat.emissiveIntensity = 0;
  LAMPS.mats.push({ m: mat, base: intensity });
  return mat;
}

function applyNightLights() {
  // lamps are lit as the sun goes down, a little before full dark
  var k = smoothK(1, -7, LIGHT.elev);
  LAMPS.k = k;
  for (var i = 0; i < LAMPS.mats.length; i++) LAMPS.mats[i].m.emissiveIntensity = LAMPS.mats[i].base * k;
  // the lights live outside the site group; they go out with it when 地面 is off
  var on = siteGroup.visible ? 1 : 0;
  for (var j = 0; j < LAMPS.lights.length; j++) LAMPS.lights[j].l.intensity = LAMPS.lights[j].base * k * on;
  for (var q = 0; q < LAMPS.uniforms.length; q++) LAMPS.uniforms[q].value = k;
  requestRender();
}
DAYLIGHT_HOOKS.push(applyNightLights);

// ---------------------------------------------------------------------------
//  the 宫灯 template, in metres: a silk drum on twelve ribs between gilt caps,
//  a red tassel below, hung on a short rod
// ---------------------------------------------------------------------------
var _lanternTex = null;
function lanternTexture() {
  if (_lanternTex) return _lanternTex;
  var c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  var x = c.getContext('2d');
  var g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#a8261a'); g.addColorStop(0.5, '#e0442a'); g.addColorStop(1, '#a8261a');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  // ribs
  x.strokeStyle = 'rgba(60,10,6,0.85)'; x.lineWidth = 3;
  for (var i = 0; i < 12; i++) { x.beginPath(); x.moveTo(i * 256 / 12, 0); x.lineTo(i * 256 / 12, 128); x.stroke(); }
  // gilt bands near top and bottom
  x.fillStyle = '#d9a83c';
  x.fillRect(0, 10, 256, 5); x.fillRect(0, 113, 256, 5);
  // a 福 roundel either side, as dark ink on the silk
  x.fillStyle = 'rgba(40,6,4,0.55)';
  [64, 192].forEach(function (cx) { x.beginPath(); x.arc(cx, 64, 20, 0, Math.PI * 2); x.fill(); });
  x.fillStyle = 'rgba(232,90,50,0.9)';
  [64, 192].forEach(function (cx) { x.beginPath(); x.arc(cx, 64, 15, 0, Math.PI * 2); x.fill(); });
  var t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.userData = { cached: true };      // shared across rebuilds: disposeGroup leaves it
  return (_lanternTex = t);
}

function lanternTemplate(mats) {
  var tpl = new THREE.Group();
  var prof = [[0.0001, 0], [0.13, 0.015], [0.26, 0.09], [0.33, 0.22], [0.345, 0.34], [0.33, 0.46], [0.26, 0.59], [0.13, 0.665], [0.0001, 0.68]];
  var body = new THREE.LatheGeometry(prof.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 24);
  body.userData.ownUVs = true;
  var silk = lampMat(new THREE.MeshStandardMaterial({
    color: 0xffffff, map: lanternTexture(), emissiveMap: lanternTexture(), roughness: 0.75, metalness: 0
  }), new THREE.Color(1.0, 0.55, 0.32), 3.6);
  part(body, silk, 0, -0.68 - 0.06, 0, 0, tpl);
  var cap = new THREE.CylinderGeometry(0.15, 0.17, 0.07, 16);
  part(cap, mats.gold, 0, -0.06 + 0.0, 0, 0, tpl);
  part(cap, mats.gold, 0, -0.74 - 0.03, 0, 0, tpl);
  part(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), mats.gold, 0, 0.22, 0, 0, tpl);
  var tassel = new THREE.ConeGeometry(0.07, 0.36, 10, 1, true);
  tassel.rotateX(Math.PI);
  part(tassel, mats.tassel || mats.gold, 0, -0.80 - 0.18, 0, 0, tpl);
  tpl.userData.centreY = -0.40;       // body centre below the attach point, metres
  return tpl;
}

// ---------------------------------------------------------------------------
//  glow billboards and light pools: one instanced quad each, additive,
//  faced to the camera in the vertex shader
// ---------------------------------------------------------------------------
var HALO_VS = [
  'uniform float uPull;',
  'varying vec2 vUv;',
  'void main(){',
  '  vUv = uv;',
  '  vec4 c = modelViewMatrix*instanceMatrix*vec4(0.0, 0.0, 0.0, 1.0);',
  '  float s = length(instanceMatrix[0].xyz);',
  // pulled toward the eye, so the lantern itself doesn't cut its own glow
  '  c.xyz += normalize(-c.xyz)*s*uPull;',
  '  c.xy += position.xy*s;',
  '  gl_Position = projectionMatrix*c;',
  '}'
].join('\n');
var HALO_FS = [
  'uniform float uK; uniform vec3 uColor; uniform float uGain;',
  'varying vec2 vUv;',
  'void main(){',
  '  float r = length(vUv - 0.5)*2.0;',
  '  float g = exp(-r*r*7.0)*0.55 + exp(-r*16.0)*0.9;',
  '  g *= 1.0 - smoothstep(0.85, 1.0, r);',
  '  gl_FragColor = vec4(uColor*g*uK*uGain, 1.0);',
  '}'
].join('\n');
var POOL_VS = [
  'varying vec2 vUv;',
  'void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position, 1.0); }'
].join('\n');
var POOL_FS = [
  'uniform float uK; uniform vec3 uColor; uniform float uGain;',
  'varying vec2 vUv;',
  'void main(){',
  '  float r = length(vUv - 0.5)*2.0;',
  '  float g = pow(max(0.0, 1.0 - r), 2.2);',
  '  gl_FragColor = vec4(uColor*g*uK*uGain, 1.0);',
  '}'
].join('\n');

function glowMaterial(vs, fs, gain, colour, pull) {
  var uK = { value: LAMPS.k };
  LAMPS.uniforms.push(uK);
  return new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs,
    uniforms: { uK: uK, uColor: { value: (colour || new THREE.Color(1.0, 0.66, 0.36)).clone() },
                uGain: { value: gain }, uPull: { value: pull || 0.35 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
}

// ---------------------------------------------------------------------------
//  LampSet: collect lamps while a scene is built, then make the instanced
//  meshes, glows, pools and point lights in one go.
//    hang(x, y, z, sizeM)   a 宫灯 whose rod is fixed at (x, y, z)
//    glow(x, y, z, r)       a bare glow (a stone lantern's window, a doorway)
//    pool(x, y, z, r)       light on the ground
//    light(x, y, z, I, d, priority)  a candidate point light
// ---------------------------------------------------------------------------
function LampSet(M) {
  this.M = M; this.hung = []; this.glows = []; this.pools = []; this.cands = [];
}
LampSet.prototype.hang = function (x, y, z, size) {
  var s = (size || 1) * this.M;
  this.hung.push({ x: x, y: y, z: z, s: s });
  // the glow sits on the silk drum
  this.glows.push({ x: x, y: y - 0.40 * s, z: z, r: 1.5 * s });
};
LampSet.prototype.glow = function (x, y, z, r) { this.glows.push({ x: x, y: y, z: z, r: r }); };
LampSet.prototype.pool = function (x, y, z, r) { this.pools.push({ x: x, y: y, z: z, r: r }); };
LampSet.prototype.light = function (x, y, z, I, d, pri) {
  this.cands.push({ p: new THREE.Vector3(x, y, z), I: I, d: d, pri: pri || 0 });
};
LampSet.prototype.build = function (mats, parent) {
  var g = new THREE.Group();
  g.name = 'lamps';
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  var rnd = TEXGEN.rng(4411);

  if (this.hung.length) {
    var tpl = lanternTemplate(mats);
    mergeStatic(tpl);
    var hung = this.hung;
    tpl.children.slice().forEach(function (src) {
      var im = new THREE.InstancedMesh(src.geometry, src.material, hung.length);
      hung.forEach(function (h, i) {
        q.setFromAxisAngle(up, rnd() * Math.PI * 2);
        m4.compose(ps.set(h.x, h.y, h.z), q, sc.set(h.s, h.s, h.s));
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = true;
      im.frustumCulled = false;
      g.add(im);
    });
  }

  function quads(list, mat, flat, y0) {
    if (!list.length) return null;
    var geo = new THREE.PlaneGeometry(1, 1);
    if (flat) geo.rotateX(-Math.PI / 2);
    var im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(function (o, i) {
      m4.makeScale(o.r * 2, o.r * 2, o.r * 2);
      m4.setPosition(o.x, o.y + (y0 || 0), o.z);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.castShadow = false; im.receiveShadow = false;
    im.renderOrder = 2;
    return im;
  }
  var halos = quads(this.glows, glowMaterial(HALO_VS, HALO_FS, 1.1, null, 0.35), false);
  if (halos) { g.add(halos); AO_HIDDEN.push(halos); halos.userData.aoHidden = true; }
  var pools = quads(this.pools, glowMaterial(POOL_VS, POOL_FS, 0.30, new THREE.Color(1.0, 0.60, 0.30)), true, 0.012 * this.M);
  if (pools) { g.add(pools); AO_HIDDEN.push(pools); pools.userData.aoHidden = true; }

  // point lights: always the same number in the scene, so a rebuild or the
  // time of day never changes the light count and recompiles every shader
  var cands = this.cands.slice().sort(function (a, b) { return b.pri - a.pri; });
  LAMPS.lights = [];
  for (var i = 0; i < POINT_LIGHTS; i++) {
    var c = cands[i], pl = LAMP_POOL[i];
    pl.distance = c ? c.d : 1;
    if (c) pl.position.copy(c.p); else pl.position.set(0, -1000, 0);
    LAMPS.lights.push({ l: pl, base: c ? c.I : 0 });
  }
  parent.add(g);
  applyNightLights();
  return g;
};

// AO_HIDDEN keeps references to glow meshes from earlier builds; drop them
// when their group is disposed
function pruneAoHidden() {
  for (var i = AO_HIDDEN.length - 1; i >= 0; i--) {
    var o = AO_HIDDEN[i], root = o;
    while (root.parent) root = root.parent;
    if (root !== scene) AO_HIDDEN.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
//  石灯 a standing stone lantern, metres: base, shaft, the 火室 fire box with
//  four lit openings, a hipped stone cap and a 宝珠 on top. Instanced too.
// ---------------------------------------------------------------------------
function stoneLanternTemplate(mats, glowMat) {
  var t = new THREE.Group();
  var st = mats.stone;
  part(new THREE.BoxGeometry(0.80, 0.18, 0.80), st, 0, 0.09, 0, 0, t);
  part(new THREE.CylinderGeometry(0.30, 0.36, 0.22, 8), st, 0, 0.29, 0, 0, t);
  part(latheGeo([[0.13, 0], [0.11, 0.25], [0.10, 0.8], [0.12, 1.05], [0.16, 1.12]], 12), st, 0, 0.40, 0, 0, t);
  part(new THREE.CylinderGeometry(0.40, 0.30, 0.14, 6), st, 0, 1.58, 0, 0, t);      // 中台
  // the fire box: four posts round a lit core
  part(new THREE.BoxGeometry(0.40, 0.42, 0.40), glowMat, 0, 1.86, 0, 0, t);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
    part(new THREE.BoxGeometry(0.09, 0.44, 0.09), st, c[0] * 0.22, 1.86, c[1] * 0.22, 0, t);
  });
  part(new THREE.BoxGeometry(0.52, 0.05, 0.52), st, 0, 1.64, 0, 0, t);
  // 笠 the cap: a low stone pyramid with a thick eave
  var cap = new THREE.CylinderGeometry(0.06, 0.56, 0.30, 4, 1);
  cap.rotateY(Math.PI / 4);
  part(cap, st, 0, 2.24, 0, 0, t);
  part(new THREE.BoxGeometry(0.80, 0.07, 0.80), st, 0, 2.10, 0, 0, t);
  part(new THREE.SphereGeometry(0.09, 12, 8), st, 0, 2.44, 0, 0, t);
  return t;
}
