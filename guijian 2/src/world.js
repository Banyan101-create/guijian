// ============================================================================
//  城 THE WORLD BEYOND THE WALL
//
//  The court sits in a place, and the place is built:
//
//  * a hall stands in a palace city -- walled compounds on a grid of lanes,
//    each with its main hall, side halls, gatehouse and trees; a forecourt to
//    the south with the 金水河 under marble bridges and a great gate on a
//    城台; a crenellated outer wall with 角楼 corner towers; the moat; 景山
//    to the north with its pavilion; and hutong neighbourhoods of grey-roofed
//    四合院 going off into the haze
//  * a pagoda stands in a temple town: dense hutong all round, a market street
//    with a 牌楼 running south to the city gate, a canal with stone bridges
//  * in open country (旷野): villages among a patchwork of fields, tree belts
//    along the field roads, a river with a bridge
//
//  Every building out here is a real little building -- a curved, upturned
//  roof with eaves, soffit, ridges and gables over a columned, latticed front
//  on a stone base -- made once per kind and instanced, one draw call per
//  material however many stand. Nothing here casts shadows or is exported.
//
//  The world is cached: it is only rebuilt when the court it surrounds changes
//  size, the scheme's roof or wall colour changes, or the setting does.
// ============================================================================

var WORLD = { key: null, group: null, lampMats: [], gen: 0, timer: 0, first: true };
var worldGroup = new THREE.Group();
worldGroup.name = 'world';
scene.add(worldGroup);

// ---------------------------------------------------------------------------
//  an indexed mesh accumulator, positions and metre UVs; normals at the end
// ---------------------------------------------------------------------------
function MeshAcc() { this.p = []; this.uv = []; this.idx = []; this.n = 0; }
MeshAcc.prototype.v = function (x, y, z, u, w) { this.p.push(x, y, z); this.uv.push(u, w); return this.n++; };
MeshAcc.prototype.face = function (vs, out) {
  // a convex polygon of [x,y,z,u,v], fanned; wound to face `out` if given
  var ids = [], self = this;
  vs.forEach(function (q) { ids.push(self.v(q[0], q[1], q[2], q[3], q[4])); });
  var flip = false;
  if (out) {
    var a = vs[0], b = vs[1], c = vs[2];
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
  }
  for (var i = 1; i < ids.length - 1; i++) {
    if (flip) this.idx.push(ids[0], ids[i + 1], ids[i]); else this.idx.push(ids[0], ids[i], ids[i + 1]);
  }
};
// a (ns+1) x (nt+1) grid from fn(s, t) -> [x,y,z,u,v], wound to face `out`
MeshAcc.prototype.grid = function (ns, nt, fn, out) {
  var base = this.n;
  for (var j = 0; j <= nt; j++) for (var i = 0; i <= ns; i++) {
    var r = fn(i / ns, j / nt);
    this.v(r[0], r[1], r[2], r[3], r[4]);
  }
  var P = this.p, k0 = base * 3, k1 = (base + 1) * 3, k2 = (base + ns + 2) * 3;
  var ux = P[k1] - P[k0], uy = P[k1 + 1] - P[k0 + 1], uz = P[k1 + 2] - P[k0 + 2];
  var vx = P[k2] - P[k0], vy = P[k2 + 1] - P[k0 + 1], vz = P[k2 + 2] - P[k0 + 2];
  var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  var flip = out ? (nx * out[0] + ny * out[1] + nz * out[2] < 0) : false;
  for (var j2 = 0; j2 < nt; j2++) for (var i2 = 0; i2 < ns; i2++) {
    var a = base + j2 * (ns + 1) + i2, b = a + 1, c = a + ns + 2, d = a + ns + 1;
    if (flip) this.idx.push(a, c, b, a, d, c); else this.idx.push(a, b, c, a, c, d);
  }
};
// an axis-aligned box, metre UVs on every face; skip: { bottom: true }
MeshAcc.prototype.box = function (cx, cy, cz, sx, sy, sz, skip) {
  var x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  skip = skip || {};
  this.face([[x0, y0, z1, x0, y0], [x1, y0, z1, x1, y0], [x1, y1, z1, x1, y1], [x0, y1, z1, x0, y1]], [0, 0, 1]);
  this.face([[x1, y0, z0, -x1, y0], [x0, y0, z0, -x0, y0], [x0, y1, z0, -x0, y1], [x1, y1, z0, -x1, y1]], [0, 0, -1]);
  this.face([[x1, y0, z1, -z1, y0], [x1, y0, z0, -z0, y0], [x1, y1, z0, -z0, y1], [x1, y1, z1, -z1, y1]], [1, 0, 0]);
  this.face([[x0, y0, z0, z0, y0], [x0, y0, z1, z1, y0], [x0, y1, z1, z1, y1], [x0, y1, z0, z0, y1]], [-1, 0, 0]);
  this.face([[x0, y1, z1, x0, -z1], [x1, y1, z1, x1, -z1], [x1, y1, z0, x1, -z0], [x0, y1, z0, x0, -z0]], [0, 1, 0]);
  if (!skip.bottom) this.face([[x0, y0, z0, x0, z0], [x1, y0, z0, x1, z0], [x1, y0, z1, x1, z1], [x0, y0, z1, x0, z1]], [0, -1, 0]);
};
// append another accumulator through a matrix
MeshAcc.prototype.append = function (src, m4) {
  var v = new THREE.Vector3(), base = this.n;
  for (var i = 0; i < src.n; i++) {
    v.set(src.p[i * 3], src.p[i * 3 + 1], src.p[i * 3 + 2]).applyMatrix4(m4);
    this.p.push(v.x, v.y, v.z); this.uv.push(src.uv[i * 2], src.uv[i * 2 + 1]);
  }
  for (var k = 0; k < src.idx.length; k++) this.idx.push(src.idx[k] + base);
  this.n += src.n;
};
MeshAcc.prototype.geometry = function () {
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  g.setIndex(this.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.ownUVs = true;
  return g;
};
// a square-section bar along a polyline (ridges)
MeshAcc.prototype.bar = function (pts, w, h) {
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i - 1], b = pts[i];
    var dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1e-6;
    var sx = -dz / L * w / 2, sz = dx / L * w / 2;
    var A0 = [a[0] - sx, a[1], a[2] - sz], A1 = [a[0] + sx, a[1], a[2] + sz];
    var B0 = [b[0] - sx, b[1], b[2] - sz], B1 = [b[0] + sx, b[1], b[2] + sz];
    var len = Math.hypot(dx, b[1] - a[1], dz);
    function up(p) { return [p[0], p[1] + h, p[2]]; }
    this.face([A0.concat([0, 0]), B0.concat([len, 0]), up(B0).concat([len, h]), up(A0).concat([0, h])], [-dz, 0, dx].map(function (q) { return -q; }));
    this.face([A1.concat([0, 0]), B1.concat([len, 0]), up(B1).concat([len, h]), up(A1).concat([0, h])], [-dz, 0, dx]);
    this.face([up(A0).concat([0, 0]), up(B0).concat([len, 0]), up(B1).concat([len, w]), up(A1).concat([0, w])], [0, 1, 0]);
  }
};

// ---------------------------------------------------------------------------
//  textures, painted once and kept
// ---------------------------------------------------------------------------
function cachedTex(c, srgb) {
  var t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData = { cached: true };
  return t;
}
var _bayTex = {};
// One bay of a hall front, columns at its edges: 彩画 beam band, 垫板, a
// 槅扇 lattice door, its 裙板, the sill. The glow map lights only the paper
// between the lattice bars.
function palaceBay(glow) {
  var key = 'p' + (glow ? 'g' : '');
  if (_bayTex[key]) return _bayTex[key];
  var S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  var x = c.getContext('2d');
  if (glow) { x.fillStyle = '#000'; x.fillRect(0, 0, S, S); }
  else {
    x.fillStyle = '#8c2a1e'; x.fillRect(0, 0, S, S);
    // 彩画 band: blue and green with a gilt line, a row of roundels
    x.fillStyle = '#2b4c78'; x.fillRect(0, 0, S, 30);
    x.fillStyle = '#2d6a56'; x.fillRect(0, 30, S, 20);
    x.fillStyle = '#c9a248'; x.fillRect(0, 28, S, 3); x.fillRect(0, 49, S, 3);
    for (var r = 0; r < 4; r++) { x.beginPath(); x.arc(32 + r * 64, 15, 9, 0, 6.28); x.strokeStyle = '#d8c070'; x.lineWidth = 2.5; x.stroke(); }
    x.fillStyle = '#7a2218'; x.fillRect(0, 52, S, 14);
    // columns
    var cg = x.createLinearGradient(0, 0, 22, 0);
    cg.addColorStop(0, '#6e1d14'); cg.addColorStop(0.5, '#b2392a'); cg.addColorStop(1, '#6e1d14');
    x.fillStyle = cg; x.fillRect(0, 52, 22, S - 52);
    var cg2 = x.createLinearGradient(S - 22, 0, S, 0);
    cg2.addColorStop(0, '#6e1d14'); cg2.addColorStop(0.5, '#b2392a'); cg2.addColorStop(1, '#6e1d14');
    x.fillStyle = cg2; x.fillRect(S - 22, 52, 22, S - 52);
    // 裙板 and sill
    x.fillStyle = '#76251b'; x.fillRect(22, 196, S - 44, 46);
    x.strokeStyle = '#c9a248'; x.lineWidth = 2;
    for (var p = 0; p < 4; p++) x.strokeRect(28 + p * 52, 202, 44, 34);
    x.fillStyle = '#b9b3a5'; x.fillRect(0, 242, S, 14);
  }
  // the lattice: dark interior (or lit paper) behind a diamond grid of bars
  var lx = 26, ly = 70, lw = S - 52, lh = 122;
  x.fillStyle = glow ? '#ffb468' : '#2a1a12'; x.fillRect(lx, ly, lw, lh);
  x.strokeStyle = glow ? '#000' : '#b07b3a'; x.lineWidth = 3;
  x.save(); x.beginPath(); x.rect(lx, ly, lw, lh); x.clip();
  for (var d = -lh; d < lw + lh; d += 14) {
    x.beginPath(); x.moveTo(lx + d, ly); x.lineTo(lx + d + lh, ly + lh); x.stroke();
    x.beginPath(); x.moveTo(lx + d + lh, ly); x.lineTo(lx + d, ly + lh); x.stroke();
  }
  x.restore();
  // stiles between the four leaves
  x.fillStyle = glow ? '#000' : '#7e2a1c';
  for (var s = 0; s <= 4; s++) x.fillRect(lx + s * lw / 4 - 3, ly - 4, 6, lh + 8);
  x.fillRect(lx, ly - 4, lw, 6); x.fillRect(lx, ly + lh - 2, lw, 6);
  return (_bayTex[key] = cachedTex(c, true));
}
// a house front: grey brick, a 支摘窗 window of step lattice over paper, a door
function houseBay(glow) {
  var key = 'h' + (glow ? 'g' : '');
  if (_bayTex[key]) return _bayTex[key];
  var S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  var x = c.getContext('2d');
  if (glow) { x.fillStyle = '#000'; x.fillRect(0, 0, S, S); }
  else {
    x.fillStyle = '#8b8a85'; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(60,60,58,0.45)'; x.lineWidth = 1;
    for (var r = 0; r < S; r += 8) {
      x.beginPath(); x.moveTo(0, r); x.lineTo(S, r); x.stroke();
      for (var b = (r / 8) % 2 ? 0 : 12; b < S; b += 24) { x.beginPath(); x.moveTo(b, r); x.lineTo(b, r + 8); x.stroke(); }
    }
    // timber frame: posts, lintel
    x.fillStyle = '#5c2a1d'; x.fillRect(0, 0, 14, S); x.fillRect(S - 14, 0, 14, S); x.fillRect(0, 0, S, 22);
    x.fillStyle = '#3a6a52'; x.fillRect(14, 8, S - 28, 10);
  }
  // window
  var wx = 40, wy = 48, ww = S - 80, wh = 110;
  x.fillStyle = glow ? '#ffb46a' : '#d9c9a5'; x.fillRect(wx, wy, ww, wh);
  x.strokeStyle = glow ? '#000' : '#5a2a1d'; x.lineWidth = 3;
  for (var gx = wx; gx <= wx + ww; gx += ww / 6) { x.beginPath(); x.moveTo(gx, wy); x.lineTo(gx, wy + wh); x.stroke(); }
  for (var gy = wy; gy <= wy + wh; gy += wh / 5) { x.beginPath(); x.moveTo(wx, gy); x.lineTo(wx + ww, gy); x.stroke(); }
  if (!glow) { x.fillStyle = '#5c2a1d'; x.fillRect(wx - 6, wy + wh, ww + 12, 10); }
  return (_bayTex[key] = cachedTex(c, true));
}

// ---------------------------------------------------------------------------
//  materials: made per world (they follow the scheme's roof and wall colour)
// ---------------------------------------------------------------------------
function worldMaterials(cRoof, cWall, lite) {
  function std(hex, o) {
    var m = new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.85, metalness: 0 });
    if (o) Object.keys(o).forEach(function (k) { m[k] = o[k]; });
    return m;
  }
  function tiles(hex, pitch) {
    var set = TEXGEN.sets.tile, r = 1 / (4 * pitch);
    var m = std(hex);
    m.map = texRepeat(set.map, r, r / 0.92); m.normalMap = texRepeat(set.normal, r, r / 0.92);
    m.roughnessMap = texRepeat(set.rough, r, r / 0.92); m.roughness = 1;
    return m;
  }
  function darker(hex, k) { return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString(); }
  var lamps = [];
  function lit(m, base) { m.emissive = new THREE.Color(1.0, 0.62, 0.30); m.emissiveIntensity = 0; lamps.push({ m: m, base: base }); return m; }
  var mats = {
    roof: tiles(cRoof, 0.40), roofGreen: tiles('#4d7d5a', 0.36), roofGrey: tiles('#73746f', 0.27),
    ridge: std(darker(cRoof, 0.85), { roughness: 0.5 }), ridgeGrey: std('#5d5e5b'),
    soffit: std('#4a2f24'), soffitGrey: std('#3b3631'),
    fascia: std('#7a2418'), fasciaGrey: std('#4a3b30'),
    gable: std(darker(cWall, 0.95)),
    facade: lit(new THREE.MeshStandardMaterial({ map: palaceBay(false), emissiveMap: palaceBay(true), roughness: 0.8 }), 0.85),
    houseFacade: lit(new THREE.MeshStandardMaterial({ map: houseBay(false), emissiveMap: houseBay(true), roughness: 0.9 }), 0.75),
    houseFacadeDark: new THREE.MeshStandardMaterial({ map: houseBay(false), roughness: 0.9 }),
    wall: dress(std(cWall), 'plaster', 1, { normal: 0.7 }),
    brick: dress(std('#8e8d88'), 'wallBrick', 1, { normal: 0.8 }),
    stone: dress(std('#c3beb1'), 'ashlar', 1, { normal: 0.8 }),
    stoneGrey: dress(std('#8f8b84'), 'stone', 1, { normal: 0.6 }),
    cap: tiles(cRoof, 0.32), capGrey: tiles('#6c6d69', 0.26),
    lane: dress(std('#a19c92'), 'slab', 1, { normal: 0.7 }),
    paving: dress(std('#8f8a82'), 'brick', 1, { normal: 0.5 }),
    water: dress(std('#1d2a2c', { metalness: 0, envMapIntensity: 0.85 }), 'water', 1, { normal: 0.35, roughMul: 1.6 }),
    grass: dress(std('#56663c'), 'grass', 1, { normal: 0.8 }),
    earth: dress(std('#9a8a6c'), 'earth', 1, { size: 6, normal: 0.6 }),
    field: dress(std('#ffffff', { vertexColors: true }), 'field', 1, { normal: 0.7 }),
    bark: dress(std('#6e5e50'), 'bark', 1, { normal: 1.0 }),
    leaf: dress(std('#3f5236', { vertexColors: true }), 'foliage', 1, { normal: 1.0 }),
    arch: std('#151110', { roughness: 1 }),
    beam: std('#2d5068', { roughness: 0.7 }),
    gold: std('#c9a548', { metalness: 0.9, roughness: 0.35 })
  };
  mats.water.color = C('#203133');
  mats.lamps = lamps;
  return mats;
}

// ---------------------------------------------------------------------------
//  ONE BUILDING, in metres, front to +z: base, columned front, side walls,
//  and a roof with real eaves. roof: 'wudian' | 'xieshan' | 'pyramid' | 'yingshan'
// ---------------------------------------------------------------------------
var _tplCache = {};
function roofProfile(H) { return function (t) { return H * (0.16 * t + 0.84 * Math.pow(t, 1.8)); }; }

function buildingParts(o) {
  var P = { roof: new MeshAcc(), under: new MeshAcc(), fascia: new MeshAcc(), ridge: new MeshAcc(),
            gable: new MeshAcc(), facade: new MeshAcc(), wall: new MeshAcc(), base: new MeshAcc() };
  var L = o.L, D = o.D, Hb = o.Hb, He = o.He, ov = o.ov;
  var A = L / 2 + ov, B = D / 2 + ov;
  var H = o.rise * (o.roof === 'yingshan' ? D : D * 1.05);
  var y = roofProfile(H), U = o.U === undefined ? H * 0.16 : o.U, th = o.th || 0.32;
  var y0 = Hb + He;                                   // eave line
  var tg = 0.48, xg = A - B * tg;
  var ns = o.ns || 8, nt = o.nt || 6;
  var slope = Math.hypot(B, H);
  var type = o.roof;

  // ---- base and steps
  var m = o.margin === undefined ? 1.2 : o.margin;
  if (Hb > 0) {
    P.base.box(0, Hb / 2, 0, L + 2 * m, Hb, D + 2 * m, { bottom: true });
    if (o.steps !== false) {
      var sw = Math.min(L * 0.35, 9), run = Hb * 2;
      P.base.box(0, Hb * 0.5, D / 2 + m + run / 2, sw, Hb, run, { bottom: true });
    }
  }
  // ---- walls: up to the roof's underside where it crosses the wall line
  var tw = ov / B, wallTop = y0 + y(tw) - th;
  var bays = Math.max(1, Math.round(L / (o.bay || 4)));
  var fm = o.house ? 'facade' : 'facade';
  [1, -1].forEach(function (f) {
    var z = f * D / 2;
    P[fm].face([[-L / 2, Hb, z, 0, 0], [L / 2, Hb, z, bays, 0], [L / 2, wallTop, z, bays, 1], [-L / 2, wallTop, z, 0, 1]], [0, 0, f]);
  });
  [1, -1].forEach(function (f) {
    var x = f * L / 2;
    P.wall.face([[x, Hb, -D / 2, -D / 2, Hb], [x, Hb, D / 2, D / 2, Hb], [x, wallTop, D / 2, D / 2, wallTop], [x, wallTop, -D / 2, -D / 2, wallTop]], [f, 0, 0]);
    if (type === 'yingshan') {
      // 硬山: the gable wall carries on up to the ridge
      var gp = [[x, wallTop, -D / 2, -D / 2, wallTop], [x, wallTop, D / 2, D / 2, wallTop]];
      var steps = o.house ? 3 : 6;
      for (var k = steps; k >= 0; k--) {
        var t = k / steps, z2 = (D / 2) * (1 - t);
        gp.push([x, y0 + y(t) - th * 0.2, z2, z2, y0 + y(t)]);
      }
      for (var k2 = 1; k2 <= steps; k2++) {
        var t2 = k2 / steps, z3 = -(D / 2) * (1 - t2);
        gp.push([x, y0 + y(t2) - th * 0.2, z3, z3, y0 + y(t2)]);
      }
      // fan from the wall-top midline
      var cx = [x, (wallTop + y0 + H) / 2, 0, 0, (wallTop + y0 + H) / 2];
      for (var g = 0; g < gp.length; g++) {
        var a = gp[g], b = gp[(g + 1) % gp.length];
        P.wall.face([cx, a, b], [f, 0, 0]);
      }
    }
  });

  // ---- the roof faces
  function lift(c, t) { return U * Math.pow(c, 4) * Math.pow(1 - t, 3); }
  function front(f) {
    return function (s01, t) {
      var s = s01 * 2 - 1, hx;
      if (type === 'yingshan') hx = A;
      else if (type === 'xieshan') hx = Math.max(A - B * t, xg);
      else hx = A - B * t;
      var x = s * hx, z = f * B * (1 - t);
      var c = type === 'yingshan' ? 0 : Math.abs(s);
      return [x, y0 + y(t) + lift(c, t), z, x, t * slope];
    };
  }
  function end(f, tmax) {
    return function (s01, t01) {
      var s = s01 * 2 - 1, t = t01 * tmax;
      var x = f * (A - B * t), z = s * B * (1 - t);
      return [x, y0 + y(t) + lift(Math.abs(s), t), z, z, t * slope];
    };
  }
  var faces = [];
  [1, -1].forEach(function (f) { faces.push({ fn: front(f), out: [0, 1, f], ns: ns, nt: nt }); });
  if (type !== 'yingshan') {
    var tmax = type === 'xieshan' ? tg : 1;
    [1, -1].forEach(function (f) { faces.push({ fn: end(f, tmax), out: [f, 1, 0], ns: Math.max(4, Math.round(ns * B / A)), nt: Math.max(2, Math.round(nt * tmax)) }); });
  }
  faces.forEach(function (F) {
    P.roof.grid(F.ns, F.nt, F.fn, F.out);
    if (!o.noUnder) P.under.grid(F.ns, F.nt, function (s, t) { var r = F.fn(s, t); r[1] -= th; return r; }, [-F.out[0], -1, -F.out[2]]);
    // the fascia board along the eave
    P.fascia.grid(F.ns, 1, function (s, k) {
      var r = F.fn(s, 0); r[1] -= k * th; r[4] = k * th; return r;
    }, [F.out[0], 0, F.out[2]]);
  });
  // 歇山 gables: a vertical triangle at each end above the skirt
  if (type === 'xieshan') {
    [1, -1].forEach(function (f) {
      var fr = front(1), bk = front(-1), sk = end(f, tg);
      var pts = [];
      for (var i = 0; i <= 6; i++) { var r = sk(i / 6, 1); pts.push([f * xg, r[1] - th * 0.2, r[2], r[2], r[1]]); }
      for (var j = 1; j <= 6; j++) {
        var t = tg + (1 - tg) * j / 6;
        var q = fr((f > 0 ? 1 : 0), t); pts.push([f * xg, q[1] - th * 0.2, q[2], q[2], q[1]]);
      }
      for (var k = 5; k >= 1; k--) {
        var t2 = tg + (1 - tg) * k / 6;
        var q2 = bk((f > 0 ? 1 : 0), t2); pts.push([f * xg, q2[1] - th * 0.2, q2[2], q2[2], q2[1]]);
      }
      // reorder: skirt top runs back->front, then up the front edge, down the back
      var c0 = [f * xg, y0 + y(0.75), 0, 0, y0 + y(0.75)];
      for (var g = 0; g < pts.length; g++) P.gable.face([c0, pts[g], pts[(g + 1) % pts.length]], [f, 0, 0]);
    });
  }
  // ---- ridges
  var rw = o.ridgeW || 0.42, rh = o.ridgeH || 0.6;
  var xr = type === 'yingshan' ? A : type === 'xieshan' ? xg : Math.max(0, A - B);
  if (xr > 0.05) P.ridge.bar([[-xr, y0 + H - rh * 0.2, 0], [xr, y0 + H - rh * 0.2, 0]], rw, rh);
  if (o.wen && xr > 0.05) {
    [-1, 1].forEach(function (e) { P.ridge.box(e * xr, y0 + H + rh * 0.9, 0, rw * 1.1, rh * 2.2, rw * 2.2, { bottom: true }); });
  }
  if (type === 'wudian' || type === 'pyramid' || type === 'xieshan') {
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
      var fn = front(q[1]), pts = [];
      var t1 = type === 'xieshan' ? tg : 1;
      for (var i = 0; i <= 5; i++) { var r = fn(q[0] > 0 ? 1 : 0, t1 * i / 5); pts.push([r[0], r[1] - rh * 0.25, r[2]]); }
      P.ridge.bar(pts, rw * 0.8, rh * 0.75);
      if (type === 'xieshan') {
        var p2 = [];
        for (var k = 0; k <= 4; k++) { var r2 = fn(q[0] > 0 ? 1 : 0, tg + (1 - tg) * k / 4); p2.push([r2[0], r2[1] - rh * 0.25, r2[2]]); }
        P.ridge.bar(p2, rw * 0.7, rh * 0.7);
      }
    });
  }
  if (type === 'pyramid') {
    P.ridge.box(0, y0 + H + 0.4, 0, 0.7, 0.9, 0.7, { bottom: true });
    P.ridge.box(0, y0 + H + 1.1, 0, 0.4, 0.6, 0.4, { bottom: true });
  }
  return P;
}

// cache of finished building templates: geometries per material slot
function buildingTpl(spec) {
  var key = JSON.stringify(spec);
  if (_tplCache[key]) return _tplCache[key];
  var P = buildingParts(spec), out = {};
  Object.keys(P).forEach(function (k) { if (P[k].n) out[k] = P[k].geometry(); });
  return (_tplCache[key] = { parts: out, spec: spec });
}

// a 四合院: four houses round a court, a wall, the gate in the south-east corner
var _syhCache = {};
function siheyuanTpl(v) {
  if (_syhCache[v]) return _syhCache[v];
  var W = [22, 26, 30][v], Dd = [24, 30, 36][v];
  var main = buildingParts({ L: 11 + v * 2, D: 6.4, Hb: 0.5, He: 3.0, ov: 0.9, rise: 0.30, roof: 'yingshan', bay: 3.4, house: true, ns: 3, nt: 2, ridgeW: 0.32, ridgeH: 0.42, steps: false, margin: 0.4, noUnder: true });
  var side = buildingParts({ L: 8.4 + v, D: 5.2, Hb: 0.35, He: 2.7, ov: 0.8, rise: 0.30, roof: 'yingshan', bay: 3.2, house: true, ns: 3, nt: 2, ridgeW: 0.3, ridgeH: 0.4, steps: false, margin: 0.3, noUnder: true });
  var out = {};
  function put(src, x, z, rot) {
    var m4 = new THREE.Matrix4().makeRotationY(rot); m4.setPosition(x, 0, z);
    Object.keys(src).forEach(function (k) { if (!src[k].n) return; (out[k] = out[k] || new MeshAcc()).append(src[k], m4); });
  }
  put(main, 0, -Dd / 2 + 4.2, 0);                              // 正房 facing south
  put(side, -W / 2 + 3.4, 0.5, Math.PI / 2);                    // 厢房 facing in
  put(side, W / 2 - 3.4, 0.5, -Math.PI / 2);
  put(main, 0, Dd / 2 - 3.6, Math.PI);                          // 倒座房 facing north
  // the outer wall, grey brick with a tiled coping, gate gap at the south-east
  var wall = out.wall2 = new MeshAcc(), cap = out.cap = new MeshAcc();
  function seg(x0, z0, x1, z1) {
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = Math.abs(x1 - x0) || 0.5, lz = Math.abs(z1 - z0) || 0.5;
    wall.box(cx, 1.6, cz, lx, 3.2, lz, { bottom: true });
    cap.box(cx, 3.35, cz, lx + 0.3, 0.3, lz + 0.3, { bottom: true });
  }
  seg(-W / 2, -Dd / 2, W / 2, -Dd / 2);
  seg(-W / 2, -Dd / 2, -W / 2, Dd / 2);
  seg(W / 2, -Dd / 2, W / 2, Dd / 2 - 3.5);
  // the 宅门 in the south-east corner, a little roofed gatehouse
  var gate = buildingParts({ L: 3.6, D: 3.0, Hb: 0.4, He: 2.6, ov: 0.6, rise: 0.32, roof: 'yingshan', bay: 3.6, house: true, ns: 2, nt: 2, ridgeW: 0.25, ridgeH: 0.35, steps: false, margin: 0.2, noUnder: true });
  put(gate, W / 2 - 1.8, Dd / 2 - 1.5, 0);
  // the court: brick paving with a small planted square
  var court = out.court = new MeshAcc();
  court.face([[-W / 2 + 6.5, 0.04, -Dd / 2 + 7.8, 0, 0], [W / 2 - 6.5, 0.04, -Dd / 2 + 7.8, W, 0],
              [W / 2 - 6.5, 0.04, Dd / 2 - 7.2, W, Dd], [-W / 2 + 6.5, 0.04, Dd / 2 - 7.2, 0, Dd]], [0, 1, 0]);
  var geos = {};
  Object.keys(out).forEach(function (k) { if (out[k].n) geos[k] = out[k].geometry(); });
  return (_syhCache[v] = { parts: geos, W: W, D: Dd });
}

// the same courtyard house for the far city: two roof planes a house, no
// soffits, the fronts still windowed so the city glows at night
var _syhFar = {};
function siheyuanFarTpl(v) {
  if (_syhFar[v]) return _syhFar[v];
  var W = [22, 26, 30][v], Dd = [24, 30, 36][v];
  var o = { Hb: 0.3, He: 2.9, ov: 0.8, rise: 0.30, roof: 'yingshan', bay: 3.4, house: true, ns: 1, nt: 1, ridgeW: 0.3, ridgeH: 0.4, steps: false, margin: 0.2, noUnder: true };
  var main = buildingParts(Object.assign({ L: 11 + v * 2, D: 6.4 }, o));
  var side = buildingParts(Object.assign({ L: 8.4 + v, D: 5.2 }, o));
  var out = {};
  function put(src, x, z, rot) {
    var m4 = new THREE.Matrix4().makeRotationY(rot); m4.setPosition(x, 0, z);
    Object.keys(src).forEach(function (k) { if (!src[k].n || k === 'base' || k === 'fascia') return; (out[k] = out[k] || new MeshAcc()).append(src[k], m4); });
  }
  put(main, 0, -Dd / 2 + 4.2, 0);
  put(side, -W / 2 + 3.4, 0.5, Math.PI / 2);
  put(side, W / 2 - 3.4, 0.5, -Math.PI / 2);
  put(main, 0, Dd / 2 - 3.6, Math.PI);
  var wall = out.wall2 = new MeshAcc();
  wall.box(0, 1.5, -Dd / 2, W, 3.0, 0.6, { bottom: true });
  wall.box(-W / 2, 1.5, 0, 0.6, 3.0, Dd, { bottom: true });
  wall.box(W / 2, 1.5, 0, 0.6, 3.0, Dd, { bottom: true });
  wall.box(-2, 1.5, Dd / 2, W - 4, 3.0, 0.6, { bottom: true });
  var geos = {};
  Object.keys(out).forEach(function (k) { if (out[k].n) geos[k] = out[k].geometry(); });
  return (_syhFar[v] = { parts: geos, W: W, D: Dd });
}

// light trees for the distance: a trunk and a handful of displaced clumps
var _lodTrees = null;
function lodTrees() {
  if (_lodTrees) return _lodTrees;
  _lodTrees = [];
  for (var v = 0; v < 4; v++) {
    var rnd = TEXGEN.rng(900 + v * 17), bark = new GeoAcc(), leaf = new GeoAcc();
    var H = 7 + rnd() * 5, lean = new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3);
    var trunk = [new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(lean.x * H * 0.3, H * 0.45, lean.z * H * 0.3)];
    addLimb(bark, trunk, 0.32, 0.2, new THREE.Color(1, 1, 1));
    var top = trunk[1], nc = 3 + Math.floor(rnd() * 3), pine = v === 3;
    for (var c = 0; c < nc; c++) {
      var a = rnd() * 6.28, d = 0.6 + rnd() * 1.6;
      var p = top.clone().add(new THREE.Vector3(Math.cos(a) * d, (pine ? 0.4 : 1.0) * (rnd() * H * 0.45), Math.sin(a) * d));
      var r = (1.7 + rnd() * 1.1) * (pine ? 1.15 : 1);
      addClump(leaf, p, r, pine ? 1.3 : 1.0, pine ? 0.5 : 0.95, pine ? 1.3 : 1.0, 7000 + v * 31 + c, 0.85 + rnd() * 0.25);
    }
    _lodTrees.push({ bark: bark.geometry(), leaf: leaf.geometry() });
  }
  return _lodTrees;
}

// ---------------------------------------------------------------------------
//  instancing: collect placements per template, then one InstancedMesh per
//  template part
// ---------------------------------------------------------------------------
function Placer(M) { this.M = M; this.lists = {}; this.tpls = {}; }
Placer.prototype.put = function (name, tpl, x, z, rot, s, y) {
  this.tpls[name] = tpl;
  (this.lists[name] = this.lists[name] || []).push([x, y || 0, z, rot || 0, (s || 1) * this.M]);
};
Placer.prototype.build = function (group, slotMats, tint) {
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  var col = new THREE.Color(), self = this, count = 0;
  Object.keys(this.lists).forEach(function (name) {
    var list = self.lists[name], tpl = self.tpls[name];
    Object.keys(tpl.parts).forEach(function (slot) {
      var mat = slotMats(name, slot);
      if (!mat) return;
      var im = new THREE.InstancedMesh(tpl.parts[slot], mat, list.length);
      list.forEach(function (it, i) {
        q.setFromAxisAngle(Y, it[3]);
        m4.compose(ps.set(it[0], it[1], it[2]), q, sc.set(it[4], it[4], it[4]));
        im.setMatrixAt(i, m4);
        if (tint && tint[name]) { tint[name](i, col); im.setColorAt(i, col); }
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      im.castShadow = false; im.receiveShadow = true;
      group.add(im);
      count += list.length;
    });
  });
  return count;
};

// ============================================================================
//  LAYOUT
// ============================================================================
function worldKey(info, court) {
  var M = info.M, q = 10 * M;
  return [SITE.mode, info.type, Math.ceil(court.hx / q), Math.ceil(court.zf / q), Math.floor(court.zb / q),
          M.toFixed(4), info.colors.roof, info.colors.wall, IS_TOUCH ? 1 : 0].join('|');
}

function buildWorld(info, court) {
  var g = new THREE.Group();
  var M = info.M, lite = IS_TOUCH;
  var W = worldMaterials(info.colors.roof, info.colors.wall, lite);
  var P = new Placer(M);
  var acc = { wall: new MeshAcc(), cap: new MeshAcc(), lane: new MeshAcc(), paving: new MeshAcc(), water: new MeshAcc(),
              stone: new MeshAcc(), brick: new MeshAcc(), capGrey: new MeshAcc(), grass: new MeshAcc(), arch: new MeshAcc(),
              earth: new MeshAcc(), beam: new MeshAcc() };
  var fieldAcc = new GeoAcc();
  var trees = [];                     // [x, z, scale, variant]
  var rnd = TEXGEN.rng(20261025);
  var ctx = { info: info, court: court, M: M, lite: lite, P: P, acc: acc, trees: trees, rnd: rnd, W: W, fieldAcc: fieldAcc, extra: [], glows: [] };

  if (SITE.mode !== 'court') buildCountry(ctx);
  else if (info.type === 'pagoda') buildTempleTown(ctx);
  else buildPalaceCity(ctx);

  // trees
  var T = lodTrees(), byV = [[], [], [], []];
  trees.forEach(function (t) { byV[t[3] % 4].push(t); });
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  var tcol = new THREE.Color();
  byV.forEach(function (list, v) {
    if (!list.length) return;
    var bark = new THREE.InstancedMesh(T[v].bark, W.bark, list.length);
    var leaf = new THREE.InstancedMesh(T[v].leaf, W.leaf, list.length);
    list.forEach(function (t, i) {
      q.setFromAxisAngle(Y, (t[0] * 13.1 + t[1] * 7.7) % 6.28);
      m4.compose(ps.set(t[0], t[4] || 0, t[1]), q, sc.set(t[2] * M, t[2] * M, t[2] * M));
      bark.setMatrixAt(i, m4); leaf.setMatrixAt(i, m4);
      var k = 0.8 + 0.4 * ((Math.sin(t[0] * 0.37 + t[1] * 0.91) + 1) / 2);
      leaf.setColorAt(i, tcol.setRGB(k * (0.92 + 0.1 * Math.sin(t[1])), k, k * 0.9));
    });
    [bark, leaf].forEach(function (im) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true;
      g.add(im);
    });
  });

  // buildings
  var slot = {
    roof: 'roof', under: 'soffit', fascia: 'fascia', ridge: 'ridge', gable: 'gable', facade: 'facade',
    wall: 'wall', base: 'stone', wall2: 'brick', cap: 'capGrey', court: 'paving'
  };
  P.build(g, function (name, s) {
    var house = /^syh|^house|^shop/.test(name);
    // a 牌楼 is posts and a roof, no walls
    if (name === 'paifang' && (s === 'facade' || s === 'wall' || s === 'base')) return null;
    var green = /green/.test(name);
    if (house) {
      var dark = /d$/.test(name);
      return { roof: W.roofGrey, under: W.soffitGrey, fascia: W.fasciaGrey, ridge: W.ridgeGrey, gable: W.brick,
               facade: name === 'shop' ? W.facade : dark ? W.houseFacadeDark : W.houseFacade, wall: W.brick, base: W.stoneGrey,
               wall2: W.brick, cap: W.capGrey, court: W.paving }[s];
    }
    var m = W[slot[s]];
    if (s === 'roof' && green) m = W.roofGreen;
    return m;
  });

  // merged statics
  var accMat = { wall: W.wall, cap: W.cap, lane: W.lane, paving: W.paving, water: W.water, stone: W.stone,
                 brick: W.brick, capGrey: W.capGrey, grass: W.grass, arch: W.arch, earth: W.earth, beam: W.beam };
  Object.keys(acc).forEach(function (k) {
    if (!acc[k].n) return;
    var mesh = new THREE.Mesh(acc[k].geometry(), accMat[k]);
    mesh.receiveShadow = true; mesh.castShadow = false;
    g.add(mesh);
  });
  if (fieldAcc.p.length) {
    var fm = new THREE.Mesh(fieldAcc.geometry(), W.field);
    fm.receiveShadow = true;
    g.add(fm);
  }
  ctx.extra.forEach(function (o) { g.add(o); });
  // lanterns at the gates: glows only, the lamps themselves too small to see
  if (ctx.glows.length) {
    var gm = glowMaterial(HALO_VS, HALO_FS, 1.0, null, 0.3);
    var gi = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), gm, ctx.glows.length);
    ctx.glows.forEach(function (p, i) { m4.makeScale(p[3], p[3], p[3]); m4.setPosition(p[0], p[1], p[2]); gi.setMatrixAt(i, m4); });
    gi.instanceMatrix.needsUpdate = true;
    gi.frustumCulled = false; gi.renderOrder = 2;
    g.add(gi);
    g.userData.glowUniform = gm.uniforms.uK;
    g.userData.glowMesh = gi;
  }
  g.userData.lampMats = W.lamps;
  return g;
}

// ---------------------------------------------------------------------------
//  pieces used by every layout (scene units: M is metres -> units)
// ---------------------------------------------------------------------------
// a wall from (x0,z0) to (x1,z1), axis-aligned, with a tiled coping
function wallRun(ctx, x0, z0, x1, z1, h, t, matKey, capKey) {
  var M = ctx.M, A = ctx.acc;
  var alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  var L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (L < 0.5 * M) return;
  var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  A[matKey || 'wall'].box(cx, h / 2, cz, alongX ? L : t, h, alongX ? t : L, { bottom: true });
  // a grey brick 下碱 at the foot of a plastered wall
  if (!matKey || matKey === 'wall') {
    var dh = Math.min(h * 0.22, 1.3 * M);
    A.brick.box(cx, dh / 2, cz, alongX ? L : t + 0.12 * M, dh, alongX ? t + 0.12 * M : L, { bottom: true });
  }
  var ct = t + 0.7 * M;
  A[capKey || 'cap'].box(cx, h + 0.2 * M, cz, alongX ? L + 0.4 * M : ct, 0.4 * M, alongX ? ct : L + 0.4 * M, { bottom: true });
  A[capKey || 'cap'].box(cx, h + 0.55 * M, cz, alongX ? L + 0.2 * M : t * 0.5, 0.3 * M, alongX ? t * 0.5 : L + 0.2 * M, { bottom: true });
}
// a box laid from (x0,z0) to (x1,z1), turned to follow the line: banks,
// railings, anything that runs along a curve
function lineBox(acc, x0, z0, x1, z1, y, h, w) {
  var len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 1e-6) return;
  var b = new MeshAcc();
  b.box(0, y + h / 2, 0, len, h, w, { bottom: true });
  var m4 = new THREE.Matrix4().makeRotationY(-Math.atan2(z1 - z0, x1 - x0));
  m4.setPosition((x0 + x1) / 2, 0, (z0 + z1) / 2);
  acc.append(b, m4);
}
// a box from p0 to p1 in 3-D (a sloping rail), w wide and h deep
var _sbX = new THREE.Vector3(1, 0, 0);
function segBox(acc, p0, p1, w, h) {
  var d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  var L = d.length();
  if (L < 1e-6) return;
  var b = new MeshAcc();
  b.box(0, 0, 0, L, h, w);
  var m4 = new THREE.Matrix4().compose(new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2),
    new THREE.Quaternion().setFromUnitVectors(_sbX, d.normalize()), new THREE.Vector3(1, 1, 1));
  acc.append(b, m4);
}
// 拱桥: a stone arch bridge -- a smooth hump of a deck, solid spandrel walls
// with the dark of the arch below, a railing of posts and rails following the
// curve. alongZ: the bridge runs north-south.
function archBridge(ctx, cx, cz, alongZ, len, width, rise, base) {
  var M = ctx.M, A = ctx.acc;
  base = base === undefined ? 0.4 * M : base;
  function P(t, v, dy) {
    var u = (t - 0.5) * len, y = base + rise * Math.sin(Math.PI * t) + (dy || 0);
    return alongZ ? [cx + v, y, cz + u] : [cx + u, y, cz + v];
  }
  var hw = width / 2, n = 16;
  A.stone.grid(2, n, function (a, t) { var p = P(t, (a - 0.5) * width); return [p[0], p[1], p[2], (a - 0.5) * width, t * len]; }, [0, 1, 0]);
  [-1, 1].forEach(function (sd) {
    var out = alongZ ? [sd, 0, 0] : [0, 0, sd];
    A.stone.grid(n, 1, function (t, k) {
      var p = P(t, sd * hw); if (k === 0) p[1] = 0;
      return [p[0], p[1], p[2], t * len, p[1]];
    }, out);
    // the arch: a dark half-ellipse on the spandrel, just proud of it
    var arch = [], ac = P(0.5, sd * (hw + 0.03 * M)); ac[1] = 0;
    for (var i = 0; i <= 10; i++) {
      var a = i / 10 * Math.PI, ax = Math.cos(a) * len * 0.26, ay = Math.sin(a) * (base + rise) * 0.72;
      arch.push(alongZ ? [ac[0], ay, ac[2] + ax, 0, 0] : [ac[0] + ax, ay, ac[2], 0, 0]);
    }
    A.arch.face([[ac[0], 0, ac[2], 0, 0]].concat(arch), out);
    // the railing: posts with lotus heads, a rail along the curve between
    var posts = Math.max(4, Math.round(len / (1.7 * M)));
    var prev = null;
    for (var j = 0; j <= posts; j++) {
      var t = j / posts, p = P(t, sd * (hw - 0.15 * M));
      A.stone.box(p[0], p[1] + 0.5 * M, p[2], 0.22 * M, 1.0 * M, 0.22 * M, { bottom: true });
      var rail = [p[0], p[1] + 0.85 * M, p[2]], low = [p[0], p[1] + 0.3 * M, p[2]];
      if (prev) { segBox(A.stone, prev[0], rail, 0.12 * M, 0.1 * M); segBox(A.stone, prev[1], low, 0.1 * M, 0.3 * M); }
      prev = [rail, low];
    }
  });
  // the ends of the deck
  [0, 1].forEach(function (t) {
    var a = P(t, -hw), b = P(t, hw);
    var out = alongZ ? [0, 0, t ? 1 : -1] : [t ? 1 : -1, 0, 0];
    A.stone.face([[a[0], 0, a[2], 0, 0], [b[0], 0, b[2], width, 0], [b[0], b[1], b[2], width, b[1]], [a[0], a[1], a[2], 0, a[1]]], out);
  });
}
function strip(ctx, key, x0, z0, x1, z1, y) {
  var a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(z0, z1), d = Math.max(z0, z1);
  if (b - a < 1e-3 || d - c < 1e-3) return;
  var yy = y === undefined ? 0.02 * ctx.M : y;
  ctx.acc[key].face([[a, yy, d, a, d], [b, yy, d, b, d], [b, yy, c, b, c], [a, yy, c, a, c]], [0, 1, 0]);
}
// a hall on a high brick-and-plaster 城台 pierced by arched gates
function gateTower(ctx, x, z, rot, wide, deep, podH, tplName, tpl, arches) {
  var M = ctx.M, A = ctx.acc;
  var alongX = Math.abs(Math.cos(rot)) > 0.5;
  var sx = alongX ? wide : deep, sz = alongX ? deep : wide;
  A.wall.box(x, podH / 2, z, sx, podH, sz, { bottom: true });
  A.stone.box(x, podH + 0.2 * M, z, sx + 0.6 * M, 0.4 * M, sz + 0.6 * M, { bottom: true });
  A.stone.box(x, 0.6 * M, z, sx + 0.4 * M, 1.2 * M, sz + 0.4 * M, { bottom: true });
  var n = arches || 3, aw = 4.6 * M, ah = podH * 0.55;
  for (var i = 0; i < n; i++) {
    var off = (i - (n - 1) / 2) * (wide / (n + 1));
    var ax = alongX ? x + off : x, az = alongX ? z : z + off;
    // the dark of the arched way through, its head stepped round to an arch
    A.arch.box(ax, ah / 2, az, alongX ? aw : sx + 0.1 * M, ah, alongX ? sz + 0.1 * M : aw, { bottom: true });
    for (var k = 1; k <= 4; k++) {
      var ang = k / 5 * Math.PI / 2, kw = aw * Math.cos(ang), kh = (aw / 2) * Math.sin(ang);
      var kh0 = (aw / 2) * Math.sin((k - 1) / 5 * Math.PI / 2);
      A.arch.box(ax, ah + (kh0 + kh) / 2, az, alongX ? kw : sx + 0.1 * M, kh - kh0 + 0.02 * M, alongX ? sz + 0.1 * M : kw, { bottom: true });
    }
  }
  ctx.P.put(tplName, tpl, x, z, rot, 1, podH + 0.4 * M);
  // lanterns either side of the middle arch
  var fx = Math.sin(rot), fz = Math.cos(rot);
  [-1, 1].forEach(function (sd) {
    var lx = x + (alongX ? sd * 4.5 * M : 0) + fx * (sx / 2 + 1.5 * M) * (alongX ? 0 : 1);
    var lz = z + (alongX ? 0 : sd * 4.5 * M) + fz * (sz / 2 + 1.5 * M) * (alongX ? 1 : 0);
    ctx.glows.push([lx, podH * 0.62, lz, 3.0 * M]);
  });
}

// ---------------------------------------------------------------------------
//  宫城 THE PALACE CITY (a hall, in its court)
// ---------------------------------------------------------------------------
function buildPalaceCity(ctx) {
  var M = ctx.M, court = ctx.court, P = ctx.P, A = ctx.acc, rnd = ctx.rnd, lite = ctx.lite;
  var wt = 1.6 * M;
  var Hx = court.hx + wt, Zf = court.zf + wt, Zb = court.zb - wt;
  // templates (metres)
  var T = {
    main5x: buildingTpl({ L: 27, D: 14, Hb: 1.5, He: 5.2, ov: 2.2, rise: 0.40, roof: 'xieshan', bay: 5.2, wen: true }),
    main5w: buildingTpl({ L: 27, D: 14, Hb: 1.5, He: 5.2, ov: 2.2, rise: 0.42, roof: 'wudian', bay: 5.2, wen: true }),
    main7x: buildingTpl({ L: 36, D: 16, Hb: 2.0, He: 6.0, ov: 2.4, rise: 0.40, roof: 'xieshan', bay: 5.0, wen: true }),
    side3: buildingTpl({ L: 15, D: 8, Hb: 0.9, He: 4.2, ov: 1.6, rise: 0.38, roof: 'xieshan', bay: 5.0 }),
    side5: buildingTpl({ L: 22, D: 8.5, Hb: 0.9, He: 4.2, ov: 1.6, rise: 0.36, roof: 'yingshan', bay: 4.4 }),
    gate3: buildingTpl({ L: 10, D: 6.5, Hb: 0.8, He: 3.8, ov: 1.4, rise: 0.40, roof: 'wudian', bay: 3.4 }),
    pav: buildingTpl({ L: 7, D: 7, Hb: 0.9, He: 3.4, ov: 1.6, rise: 0.55, roof: 'pyramid', bay: 3.5 }),
    bigGate: buildingTpl({ L: 54, D: 22, Hb: 0.5, He: 7.5, ov: 2.8, rise: 0.40, roof: 'wudian', bay: 6.0, wen: true, steps: false }),
    gate5: buildingTpl({ L: 30, D: 14, Hb: 0.5, He: 5.6, ov: 2.2, rise: 0.40, roof: 'xieshan', bay: 6.0, wen: true, steps: false }),
    tower: buildingTpl({ L: 13, D: 13, Hb: 0.4, He: 5.0, ov: 1.8, rise: 0.48, roof: 'xieshan', bay: 4.3, steps: false }),
    towerX: buildingTpl({ L: 13, D: 9, Hb: 0.4, He: 6.2, ov: 1.6, rise: 0.50, roof: 'xieshan', bay: 4.3, steps: false, margin: 0 }),
    jpav: buildingTpl({ L: 12, D: 12, Hb: 1.6, He: 5.0, ov: 2.0, rise: 0.60, roof: 'pyramid', bay: 4.0 })
  };
  var lane = 14 * M, gap = 20 * M;
  var cw = 66 * M, cd = 74 * M;
  var nE = lite ? 2 : 3;
  var F = 96 * M;                                     // forecourt depth
  var x0 = Hx + gap;
  var PX = x0 + nE * cw + (nE - 1) * lane + 16 * M;
  var nN = lite ? 2 : 3;
  var PZb = Zb - gap - nN * cd - (nN - 1) * lane - 16 * M;
  var PZf = Zf + F;
  var occupied = [];

  // ---- the compounds, east and west, and north of the court
  function compound(cx, cz, w, d, k) {
    var hw = w / 2, hd = d / 2, gw = 4.2 * M;
    var h = 5.0 * M, t = 1.1 * M;
    wallRun(ctx, cx - hw, cz - hd, cx + hw, cz - hd, h, t);
    wallRun(ctx, cx - hw, cz - hd, cx - hw, cz + hd, h, t);
    wallRun(ctx, cx + hw, cz - hd, cx + hw, cz + hd, h, t);
    wallRun(ctx, cx - hw, cz + hd, cx - gw, cz + hd, h, t);
    wallRun(ctx, cx + gw, cz + hd, cx + hw, cz + hd, h, t);
    P.put('gate3', T.gate3, cx, cz + hd - 0.4 * M, 0);
    ctx.glows.push([cx - 3.4 * M, 3.4 * M, cz + hd + 3.0 * M, 2.4 * M], [cx + 3.4 * M, 3.4 * M, cz + hd + 3.0 * M, 2.4 * M]);
    strip(ctx, 'paving', cx - hw + t, cz - hd + t, cx + hw - t, cz + hd - t, 0.025 * M);
    var garden = k % 7 === 3;
    if (garden) {
      // a garden court: a pond, a pavilion beside it, trees all round
      var pr = Math.min(w, d) * 0.22;
      var ring = [];
      for (var i = 0; i < 14; i++) {
        var a = i / 14 * Math.PI * 2, rr = pr * (0.82 + 0.3 * Math.sin(a * 3 + k));
        ring.push([cx + Math.cos(a) * rr * 1.3, 0.05 * M, cz + Math.sin(a) * rr, Math.cos(a) * rr * 1.3, Math.sin(a) * rr]);
      }
      A.water.face([[cx, 0.05 * M, cz, 0, 0]].concat(ring).concat([ring[0]]), [0, 1, 0]);
      for (var e = 0; e < ring.length; e++) {
        var p0 = ring[e], p1 = ring[(e + 1) % ring.length];
        A.stone.box((p0[0] + p1[0]) / 2, 0.15 * M, (p0[2] + p1[2]) / 2, Math.abs(p1[0] - p0[0]) + 0.6 * M, 0.3 * M, Math.abs(p1[2] - p0[2]) + 0.6 * M, { bottom: true });
      }
      P.put(k % 2 ? 'pav' : 'pavgreen', T.pav, cx + pr * 1.7, cz - pr * 0.6, 0);
      for (var tt = 0; tt < 7; tt++) {
        var ta = rnd() * 6.28, td = pr * (1.8 + rnd() * 0.6);
        ctx.trees.push([cx + Math.cos(ta) * td * 1.1, cz + Math.sin(ta) * td * 0.9, 0.8 + rnd() * 0.4, Math.floor(rnd() * 4)]);
      }
      P.put('side3', T.side3, cx, cz - hd + 7 * M, 0);
      return;
    }
    var mainName = k % 5 === 0 ? 'main7x' : k % 2 ? 'main5x' : 'main5w';
    if (mainName === 'main7x' && w < 60 * M) mainName = 'main5x';
    P.put(mainName, T[mainName], cx, cz - d * 0.17, 0);
    P.put('side3', T.side3, cx - w * 0.31, cz + d * 0.14, Math.PI / 2);
    P.put('side3', T.side3, cx + w * 0.31, cz + d * 0.14, -Math.PI / 2);
    // a path from the gate to the main hall's steps
    strip(ctx, 'lane', cx - 2.2 * M, cz - d * 0.17 + 10 * M, cx + 2.2 * M, cz + hd - t, 0.04 * M);
    ctx.trees.push([cx - w * 0.14, cz + d * 0.26, 0.9 + rnd() * 0.3, 0]);
    ctx.trees.push([cx + w * 0.14, cz + d * 0.26, 0.9 + rnd() * 0.3, 1]);
    if (k % 3 === 0) {
      ctx.trees.push([cx - w * 0.36, cz - d * 0.36, 1.0, 2], [cx + w * 0.36, cz - d * 0.36, 1.0, 3]);
    }
  }
  var k = 0;
  // east and west columns, from the north edge of the palace to the gate row
  for (var col = 0; col < nE; col++) {
    var cx = x0 + col * (cw + lane) + cw / 2;
    for (var z = PZb + 16 * M + cd / 2; z + cd / 2 < PZf - 18 * M; z += cd + lane) {
      [-1, 1].forEach(function (sd) { compound(sd * cx, z, cw, cd, k++); });
    }
  }
  // north of the court, either side of the axis
  for (var r = 0; r < nN; r++) {
    var zN = Zb - gap - cd / 2 - r * (cd + lane);
    var halfW = Hx - lane / 2;
    [-1, 1].forEach(function (sd) { compound(sd * (lane / 2 + halfW / 2), zN, halfW, cd, k++); });
  }

  // ---- lanes: the long ways north-south, and between the rows
  for (var c2 = 0; c2 <= nE; c2++) {
    var lx = c2 === 0 ? Hx + gap / 2 : x0 + c2 * (cw + lane) - lane / 2;
    var lw = c2 === 0 ? gap * 0.6 : lane * 0.7;
    [-1, 1].forEach(function (sd) { strip(ctx, 'lane', sd * lx - lw / 2, PZb + 10 * M, sd * lx + lw / 2, PZf - 10 * M); });
  }
  strip(ctx, 'lane', -lane * 0.35, PZb + 10 * M, lane * 0.35, Zb - 2 * M);            // the axis, north

  // ---- forecourt: walls continuing the court's, the 金水河, the great gate
  var fh = 6.5 * M;
  wallRun(ctx, -Hx, Zf, -Hx, PZf - 12 * M, fh, 1.6 * M);
  wallRun(ctx, Hx, Zf, Hx, PZf - 12 * M, fh, 1.6 * M);
  strip(ctx, 'paving', -Hx + wt, Zf, Hx - wt, PZf - 12 * M, 0.02 * M);
  strip(ctx, 'lane', -4.5 * M, Zf, 4.5 * M, PZf - 12 * M, 0.04 * M);                   // 御路
  // side halls along the forecourt, facing in
  for (var zz = Zf + 16 * M; zz < PZf - 24 * M; zz += 26 * M) {
    P.put('side5', T.side5, -Hx + 9 * M, zz, Math.PI / 2);
    P.put('side5', T.side5, Hx - 9 * M, zz, -Math.PI / 2);
  }
  // 金水河: a bow of water across the court, marble banks, five bridges
  var rz = Zf + F * 0.42, bow = 12 * M, rw = 9 * M, N = 40;
  var pts = [];
  for (var i = 0; i <= N; i++) {
    var u = i / N, x = -Hx + 14 * M + u * (2 * Hx - 28 * M);
    var zc = rz + bow * (1 - Math.pow((x / (Hx - 14 * M)), 2));
    pts.push([x, zc]);
  }
  for (var i2 = 0; i2 < N; i2++) {
    var a0 = pts[i2], a1 = pts[i2 + 1];
    A.water.face([[a0[0], 0.06 * M, a0[1] - rw / 2, a0[0], a0[1]], [a1[0], 0.06 * M, a1[1] - rw / 2, a1[0], a1[1]],
                  [a1[0], 0.06 * M, a1[1] + rw / 2, a1[0], a1[1] + rw], [a0[0], 0.06 * M, a0[1] + rw / 2, a0[0], a0[1] + rw]], [0, 1, 0]);
    [-1, 1].forEach(function (sd) {
      var off = sd * (rw / 2 + 0.3 * M);
      // the bank's coping, then a white marble balustrade along it: posts with
      // a rail and a 华板 panel between
      lineBox(A.stone, a0[0], a0[1] + off, a1[0], a1[1] + off, 0, 0.35 * M, 0.7 * M);
      lineBox(A.stone, a0[0], a0[1] + off, a1[0], a1[1] + off, 0.35 * M, 0.12 * M, 0.34 * M);
      lineBox(A.stone, a0[0], a0[1] + off, a1[0], a1[1] + off, 0.47 * M, 0.42 * M, 0.12 * M);
      lineBox(A.stone, a0[0], a0[1] + off, a1[0], a1[1] + off, 1.02 * M, 0.1 * M, 0.16 * M);
      A.stone.box(a0[0], 0.35 * M + 0.5 * M, a0[1] + off, 0.24 * M, 1.0 * M, 0.24 * M, { bottom: true });
      A.stone.box(a0[0], 1.42 * M, a0[1] + off, 0.18 * M, 0.2 * M, 0.18 * M, { bottom: true });
    });
  }
  [-2, -1, 0, 1, 2].forEach(function (b) {
    var bx = b * 11 * M, bz = rz + bow * (1 - Math.pow(bx / (Hx - 14 * M), 2));
    var bw = (b === 0 ? 7 : 5) * M, bl = rw + 5 * M;
    archBridge(ctx, bx, bz, true, bl, bw, 1.2 * M, 0.35 * M);
  });
  // the great gate: 午门, on the line of the outer wall
  gateTower(ctx, 0, PZf + 4 * M, 0, 76 * M, 30 * M, 12 * M, 'bigGate', T.bigGate, 3);
  occupied.push([-40 * M, 40 * M, PZf - 12 * M, PZf + 22 * M]);

  // ---- 紫禁城 the outer wall, crenellated, with its corner towers
  var OW = 9.0 * M, OH = 10 * M, gateHalf = 39 * M;
  function outerRun(xa, za, xb, zb2) { wallRun(ctx, xa, za, xb, zb2, OH, OW); }
  outerRun(-PX, PZb, PX, PZb);
  outerRun(-PX, PZb, -PX, PZf);
  outerRun(PX, PZb, PX, PZf);
  outerRun(-PX, PZf, -gateHalf, PZf);
  outerRun(gateHalf, PZf, PX, PZf);
  // 垛口: merlons along the outer edge of the walk
  function merlons(xa, za, xb, zb2, nx, nz) {
    var L = Math.hypot(xb - xa, zb2 - za), n = Math.floor(L / (3.2 * M));
    for (var i = 0; i < n; i++) {
      var f = (i + 0.5) / n, x = xa + (xb - xa) * f + nx * (OW / 2 - 0.3 * M), z = za + (zb2 - za) * f + nz * (OW / 2 - 0.3 * M);
      A.wall.box(x, OH + 1.0 * M, z, nx ? 0.6 * M : 1.7 * M, 1.6 * M, nz ? 0.6 * M : 1.7 * M, { bottom: true });
    }
  }
  merlons(-PX, PZb, PX, PZb, 0, -1);
  merlons(-PX, PZb, -PX, PZf, -1, 0);
  merlons(PX, PZb, PX, PZf, 1, 0);
  merlons(-PX, PZf, -gateHalf, PZf, 0, 1);
  merlons(gateHalf, PZf, PX, PZf, 0, 1);
  // 角楼: a cross of two 歇山 roofs over a square, at every corner
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
    var x = c[0] * PX, z = c[1] === -1 ? PZb : PZf;
    A.stone.box(x, OH + 0.3 * M, z, 20 * M, 0.6 * M, 20 * M, { bottom: true });
    P.put('tower', T.tower, x, z, 0, 1, OH + 0.6 * M);
    P.put('towerX', T.towerX, x, z, 0, 1, OH + 0.6 * M);
    P.put('towerX', T.towerX, x, z, Math.PI / 2, 1, OH + 0.6 * M);
  });
  // the other three gates
  gateTower(ctx, 0, PZb, 0, 40 * M, 22 * M, 11 * M, 'gate5', T.gate5, 3);
  gateTower(ctx, -PX, (PZb + PZf) / 2, Math.PI / 2, 36 * M, 22 * M, 11 * M, 'gate5', T.gate5, 3);
  gateTower(ctx, PX, (PZb + PZf) / 2, -Math.PI / 2, 36 * M, 22 * M, 11 * M, 'gate5', T.gate5, 3);

  // ---- 筒子河 the moat, stone-banked, with a bridge at each gate
  var m0 = 10 * M, mw = 52 * M;
  var ex0 = PX + OW / 2 + m0, ez0 = PZb - OW / 2 - m0, sz0 = PZf + OW / 2 + m0;
  function water(xa, za, xb, zb2) { strip(ctx, 'water', xa, za, xb, zb2, 0.04 * M); }
  water(-ex0 - mw, ez0 - mw, ex0 + mw, ez0);                 // north
  water(-ex0 - mw, sz0, ex0 + mw, sz0 + mw);                  // south
  water(-ex0 - mw, ez0, -ex0, sz0);                           // west
  water(ex0, ez0, ex0 + mw, sz0);                             // east
  // banks: a stone kerb on both edges, all the way round
  [[ex0, ez0, sz0], [ex0 + mw, ez0 - mw, sz0 + mw]].forEach(function (b) {
    var xe = b[0], za = b[1], zb3 = b[2];
    A.stone.box(0, -0.1 * M, za, 2 * xe + 1 * M, 1.4 * M, 1 * M, { bottom: true });
    A.stone.box(0, -0.1 * M, zb3, 2 * xe + 1 * M, 1.4 * M, 1 * M, { bottom: true });
    A.stone.box(-xe, -0.1 * M, (za + zb3) / 2, 1 * M, 1.4 * M, zb3 - za, { bottom: true });
    A.stone.box(xe, -0.1 * M, (za + zb3) / 2, 1 * M, 1.4 * M, zb3 - za, { bottom: true });
  });
  // a row of willows along the moat's outer bank
  for (var wx = -ex0 - mw; wx <= ex0 + mw; wx += 15 * M) {
    if (Math.abs(wx) > 10 * M) ctx.trees.push([wx, ez0 - mw - 6 * M, 0.9 + rnd() * 0.25, 1 + Math.floor(rnd() * 2)], [wx, sz0 + mw + 6 * M, 0.9 + rnd() * 0.25, 1 + Math.floor(rnd() * 2)]);
  }
  for (var wz = ez0 - mw; wz <= sz0 + mw; wz += 15 * M) {
    if (Math.abs(wz - (PZb + PZf) / 2) > 10 * M) ctx.trees.push([-ex0 - mw - 6 * M, wz, 0.9 + rnd() * 0.25, 1 + Math.floor(rnd() * 2)], [ex0 + mw + 6 * M, wz, 0.9 + rnd() * 0.25, 1 + Math.floor(rnd() * 2)]);
  }
  // a broad stone bridge over the moat at each gate
  [[0, ez0 - mw / 2, 'x'], [0, sz0 + mw / 2, 'x'], [-ex0 - mw / 2, (ez0 + sz0) / 2, 'z'], [ex0 + mw / 2, (ez0 + sz0) / 2, 'z']].forEach(function (b) {
    var bw = 14 * M;
    if (b[2] === 'x') A.stone.box(b[0], 0.35 * M, b[1], bw, 0.7 * M, mw + 2 * M, { bottom: true });
    else A.stone.box(b[0], 0.35 * M, b[1], mw + 2 * M, 0.7 * M, bw, { bottom: true });
  });

  // ---- 景山 to the north, its pavilion on top, wooded
  var JZ = ez0 - mw - 40 * M - 150 * M, JR = 150 * M, JH = 44 * M;
  var hill = new MeshAcc(), segs = 36, rings = 10;
  hill.grid(segs, rings, function (s, t) {
    var a = s * Math.PI * 2, r = JR * (1 - t * 0.98);
    var wob = 1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7);
    var h = JH * (0.5 - 0.5 * Math.cos(Math.PI * Math.pow(t, 0.8)));
    return [Math.cos(a) * r * wob, h, JZ + Math.sin(a) * r * wob * 0.8, Math.cos(a) * r, Math.sin(a) * r];
  }, [0, 1, 0]);
  A.grass.append(hill, new THREE.Matrix4());
  P.put('jpav', T.jpav, 0, JZ, 0, 1, JH - 0.5 * M);
  [[-1, 0.5], [1, 0.5]].forEach(function (p) {
    var px = p[0] * JR * 0.5, h = JH * (0.5 - 0.5 * Math.cos(Math.PI * Math.pow(0.5, 0.8)));
    P.put('pavgreen', T.pav, px, JZ, 0, 1.2, h - 0.5 * M);
  });
  for (var jt = 0; jt < (lite ? 50 : 110); jt++) {
    var ja = rnd() * 6.28, jd = Math.sqrt(rnd()) * JR * 0.92;
    if (jd < 18 * M) continue;
    var tH = JH * (0.5 - 0.5 * Math.cos(Math.PI * Math.pow(1 - jd / JR, 0.8)));
    ctx.trees.push([Math.cos(ja) * jd, JZ + Math.sin(ja) * jd * 0.8, 1.0 + rnd() * 0.4, Math.floor(rnd() * 4), tH]);
  }

  // ---- 北海 the lake to the west, its island and the White Dagoba
  var lake = lakeWithDagoba(ctx, -ex0 - mw - 40 * M - 230 * M, (PZb + PZf) / 2 - 120 * M, 190 * M, 320 * M);

  // ---- 胡同 the city round it all
  hutongRing(ctx, -ex0 - mw - 28 * M, ez0 - mw - 28 * M, ex0 + mw + 28 * M, sz0 + mw + 28 * M,
             lite ? 300 * M : 820 * M, function (x, z) {
               if (Math.hypot(x / 1.0, (z - JZ) / 0.8) < JR + 30 * M) return true;
               return lake && lake.inside(x, z, 14 * M);
             });
}

// a lake with a stone shore, an island hill and a white 喇嘛塔 on its top, a
// temple hall before it, and trees round the water; returns its outline
function lakeWithDagoba(ctx, cx, cz, rx, rz) {
  var M = ctx.M, A = ctx.acc, P = ctx.P, rnd = ctx.rnd;
  var N = 48, ring = [];
  for (var i = 0; i < N; i++) {
    var a = i / N * Math.PI * 2;
    var k = 1 + 0.10 * Math.sin(a * 3 + 0.7) + 0.06 * Math.sin(a * 5 + 2.1) - (a > 2.6 && a < 3.6 ? 0.18 : 0);
    ring.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
  }
  // a park round the water: lawn out to the paths, then the city
  var outer = function (q) { return [cx + (q[0] - cx) * 1.13, 0.03 * M, cz + (q[1] - cz) * 1.13]; };
  for (var pk = 0; pk < N; pk++) {
    var q0 = ring[pk], q1 = ring[(pk + 1) % N];
    var o0 = outer(q0), o1 = outer(q1);
    A.grass.face([[q0[0], 0.03 * M, q0[1], q0[0], q0[1]], [q1[0], 0.03 * M, q1[1], q1[0], q1[1]],
                  [o1[0], o1[1], o1[2], o1[0], o1[2]], [o0[0], o0[1], o0[2], o0[0], o0[2]]], [0, 1, 0]);
  }
  var poly = [[cx, 0.04 * M, cz, cx, cz]];
  ring.forEach(function (p) { poly.push([p[0], 0.04 * M, p[1], p[0], p[1]]); });
  poly.push(poly[1]);
  A.water.face(poly, [0, 1, 0]);
  // the shore: a stone kerb, willows every so often
  for (var e = 0; e < N; e++) {
    var p0 = ring[e], p1 = ring[(e + 1) % N];
    var len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    var seg = new MeshAcc();
    seg.box(0, 0.1 * M, 0, len + 0.8 * M, 1.0 * M, 1.4 * M, { bottom: true });
    var m4 = new THREE.Matrix4().makeRotationY(-ang); m4.setPosition((p0[0] + p1[0]) / 2, 0, (p0[1] + p1[1]) / 2);
    A.stone.append(seg, m4);
    // willows along the shore, and more trees out in the park
    var nx = (p0[0] - cx), nz = (p0[1] - cz), nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    ctx.trees.push([p0[0] + nx * 6 * M, p0[1] + nz * 6 * M, 0.9 + rnd() * 0.3, 1 + (e % 3)]);
    if (e % 2 === 0) ctx.trees.push([p0[0] + nx * (16 + rnd() * 14) * M, p0[1] + nz * (16 + rnd() * 14) * M, 1.0 + rnd() * 0.3, Math.floor(rnd() * 4)]);
  }
  // 琼华岛: the island near the north end, wooded, the dagoba on its crown
  var ix = cx + rx * 0.05, iz = cz - rz * 0.45, ir = Math.min(rx, rz) * 0.42, ih = 32 * M;
  var hill = new MeshAcc();
  hill.grid(32, 8, function (s, t) {
    var a = s * Math.PI * 2, r = ir * (1 - t * 0.97) * (1 + 0.08 * Math.sin(a * 4));
    var h = ih * (0.5 - 0.5 * Math.cos(Math.PI * Math.pow(t, 0.75)));
    return [ix + Math.cos(a) * r, h - 0.3 * M, iz + Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r];
  }, [0, 1, 0]);
  A.grass.append(hill, new THREE.Matrix4());
  for (var t = 0; t < 40; t++) {
    var ta = rnd() * 6.28, td = (0.3 + 0.62 * Math.sqrt(rnd())) * ir;
    var th = ih * (0.5 - 0.5 * Math.cos(Math.PI * Math.pow(1 - td / ir, 0.75)));
    ctx.trees.push([ix + Math.cos(ta) * td, iz + Math.sin(ta) * td, 0.9 + rnd() * 0.3, Math.floor(rnd() * 4), th - 0.3 * M]);
  }
  // the White Dagoba: a stepped square base, the bulb, the spire of rings,
  // the gilt canopy
  var w = new THREE.Group();
  var white = new THREE.MeshStandardMaterial({ color: C('#efece4'), roughness: 0.7 });
  var gold = ctx.W.gold;
  [[18, 3.2], [15, 2.4], [12.5, 2.0]].reduce(function (y, b) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(b[0], b[1], b[0]), white);
    m.position.y = y + b[1] / 2; w.add(m); return y + b[1];
  }, 0);
  var body = new THREE.Mesh(new THREE.LatheGeometry([[0.01, 0], [6.0, 0], [6.6, 1.2], [7.4, 4], [7.6, 7.4], [6.8, 10.5], [4.4, 12.6], [2.6, 13.2], [2.4, 14]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 28), white);
  body.position.y = 7.6; w.add(body);
  var spire = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 9, 16), white);
  spire.position.y = 7.6 + 14 + 4.5; w.add(spire);
  for (var r = 0; r < 7; r++) {
    var ringM = new THREE.Mesh(new THREE.TorusGeometry(2.1 - r * 0.17, 0.22, 6, 18), white);
    ringM.rotation.x = Math.PI / 2; ringM.position.y = 7.6 + 14.5 + r * 1.2; w.add(ringM);
  }
  var canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.0, 1.0, 16), gold);
  canopy.position.y = 7.6 + 14 + 9.2; w.add(canopy);
  var top = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), gold);
  top.position.y = 7.6 + 14 + 10.6; w.add(top);
  w.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  w.scale.setScalar(M);
  w.position.set(ix, ih - 1.2 * M, iz);
  ctx.extra.push(w);
  P.put('main5x', buildingTpl({ L: 27, D: 14, Hb: 1.5, He: 5.2, ov: 2.2, rise: 0.40, roof: 'xieshan', bay: 5.2, wen: true }), ix, iz + ir * 0.62, 0, 0.8, ih * 0.3);
  // a long bridge from the island to the south shore
  archBridge(ctx, ix, iz + ir * 0.9 + 30 * M, true, 64 * M, 7 * M, 2.2 * M, 0.5 * M);
  return {
    inside: function (x, z, pad) {
      var dx = (x - cx) / (rx * 1.12 + (pad || 0)), dz = (z - cz) / (rz * 1.12 + (pad || 0));
      return dx * dx + dz * dz < 1;
    }
  };
}

// rows of 四合院 on a grid round a rectangle, out to `reach` beyond it;
// skip(x, z) leaves a hole (a hill, a lake)
function hutongRing(ctx, X0, Z0, X1, Z1, reach, skip) {
  var M = ctx.M, P = ctx.P, rnd = ctx.rnd;
  var sw = 30 * M, sd = 38 * M, hut = 7 * M, ave = 24 * M;
  var nx0 = Math.floor((X0 - reach) / (sw + hut)), nx1 = Math.ceil((X1 + reach) / (sw + hut));
  var nz0 = Math.floor((Z0 - reach) / (sd + hut)), nz1 = Math.ceil((Z1 + reach) / (sd + hut));
  for (var ix = nx0; ix <= nx1; ix++) {
    if (ix % 7 === 0) {
      // an avenue, tree-lined
      var axx = ix * (sw + hut);
      for (var tz = (Z0 - reach); tz < Z1 + reach; tz += 22 * M) {
        if (tz > Z0 - 6 * M && tz < Z1 + 6 * M && axx > X0 - 6 * M && axx < X1 + 6 * M) continue;
        if (skip && skip(axx, tz)) continue;
        var tdx = Math.max(X0 - axx, 0, axx - X1), tdz = Math.max(Z0 - tz, 0, tz - Z1);
        if (Math.hypot(tdx, tdz) > reach * 0.6) continue;
        if (rnd() < 0.8) ctx.trees.push([axx - 6 * M, tz, 0.9 + rnd() * 0.3, Math.floor(rnd() * 3)], [axx + 6 * M, tz + 8 * M, 0.9 + rnd() * 0.3, Math.floor(rnd() * 3)]);
      }
      for (var sz0 = Z0 - reach; sz0 < Z1 + reach; sz0 += 30 * M) {
        var smid = sz0 + 15 * M;
        if (skip && skip(axx, smid)) continue;
        if (smid > Z0 && smid < Z1 && axx > X0 && axx < X1) continue;
        strip(ctx, 'lane', axx - ave / 2, sz0, axx + ave / 2, sz0 + 30 * M, 0.015 * M);
      }
      continue;
    }
    for (var iz = nz0; iz <= nz1; iz++) {
      var x = ix * (sw + hut), z = iz * (sd + hut);
      // inside the ring only
      if (x > X0 - sw / 2 && x < X1 + sw / 2 && z > Z0 - sd / 2 && z < Z1 + sd / 2) continue;
      var dx = Math.max(X0 - x, 0, x - X1), dz = Math.max(Z0 - z, 0, z - Z1);
      var dist = Math.hypot(dx, dz);
      if (dist > reach) continue;
      if (skip && skip(x, z)) continue;
      // thinning toward the edge, so the city frays into the haze
      if (dist > reach * 0.7 && rnd() < (dist - reach * 0.7) / (reach * 0.3) * 0.7) continue;
      var v = Math.floor(rnd() * 3);
      var far = dist > reach * 0.42;
      var tpl = far ? siheyuanFarTpl(v) : siheyuanTpl(v);
      var rot = rnd() < 0.15 ? Math.PI : 0;
      // most houses are lit at night, some are not
      P.put((far ? 'syhF' : 'syh') + v + (rnd() < 0.3 ? 'd' : ''), tpl, x + (rnd() - 0.5) * 2 * M, z, rot, 1);
      if (rnd() < (far ? 0.25 : 0.42)) ctx.trees.push([x + (rnd() - 0.5) * 6 * M, z + (rnd() - 0.5) * 6 * M, 0.75 + rnd() * 0.35, Math.floor(rnd() * 4)]);
    }
  }
}

// ---------------------------------------------------------------------------
//  寺城 THE TEMPLE TOWN (a pagoda, in its court)
// ---------------------------------------------------------------------------
function buildTempleTown(ctx) {
  var M = ctx.M, court = ctx.court, P = ctx.P, A = ctx.acc, rnd = ctx.rnd, lite = ctx.lite;
  var wt = 1.6 * M;
  var Hx = court.hx + wt, Zf = court.zf + wt, Zb = court.zb - wt;
  var T = {
    shop: buildingTpl({ L: 12, D: 7, Hb: 0.4, He: 3.4, ov: 1.2, rise: 0.32, roof: 'yingshan', bay: 3.0, ns: 3, nt: 3, steps: false, margin: 0.3 }),
    paifang: buildingTpl({ L: 16, D: 2.2, Hb: 0, He: 6.5, ov: 1.2, rise: 0.5, roof: 'wudian', bay: 5.3, steps: false, margin: 0, wen: true }),
    cityGate: buildingTpl({ L: 40, D: 18, Hb: 0.5, He: 7.0, ov: 2.4, rise: 0.42, roof: 'xieshan', bay: 5.0, wen: true, steps: false }),
    bridgePav: buildingTpl({ L: 6, D: 6, Hb: 0.6, He: 3.0, ov: 1.4, rise: 0.55, roof: 'pyramid', bay: 3.0 })
  };
  // a ring street round the temple wall
  var ring = 16 * M;
  strip(ctx, 'lane', -Hx - ring, Zb - ring, Hx + ring, Zb, 0.02 * M);
  strip(ctx, 'lane', -Hx - ring, Zf, Hx + ring, Zf + ring, 0.02 * M);
  strip(ctx, 'lane', -Hx - ring, Zb, -Hx, Zf, 0.02 * M);
  strip(ctx, 'lane', Hx, Zb, Hx + ring, Zf, 0.02 * M);
  // the market street, south from the temple gate to the city gate
  var streetW = 20 * M, gateZ = Zf + (lite ? 260 : 420) * M;
  strip(ctx, 'lane', -streetW / 2, Zf + ring, streetW / 2, gateZ, 0.02 * M);
  for (var z = Zf + ring + 10 * M; z < gateZ - 30 * M; z += 13.5 * M) {
    [-1, 1].forEach(function (sd) {
      P.put('shop', T.shop, sd * (streetW / 2 + 5 * M), z, sd > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (rnd() < 0.3) ctx.trees.push([sd * (streetW / 2 + 1.2 * M), z + 6 * M, 0.7, 2]);
    });
  }
  // a 牌楼 across the street near the temple, another near the gate
  [Zf + ring + 4 * M, gateZ - 40 * M].forEach(function (pz) {
    P.put('paifang', T.paifang, 0, pz, 0);
    [-1, 0.33, -0.33, 1].forEach(function (f) {
      A.stone.box(f * 7.6 * M, 0.6 * M, pz, 1.4 * M, 1.2 * M, 2.4 * M, { bottom: true });     // 夹杆石
      A.wall.box(f * 7.6 * M, 3.6 * M, pz, 0.75 * M, 7.2 * M, 0.75 * M, { bottom: true });   // 柱
    });
    A.beam.box(0, 6.2 * M, pz, 16.4 * M, 0.7 * M, 0.6 * M, { bottom: true });                 // 额枋
    A.beam.box(0, 4.6 * M, pz, 16.4 * M, 0.45 * M, 0.5 * M, { bottom: true });
  });
  // the city wall, grey brick, crenellated, and its gate tower
  var CW = 1200 * M, OH = 11 * M, OW = 12 * M;
  wallRun(ctx, -CW, gateZ, -26 * M, gateZ, OH, OW, 'brick', 'capGrey');
  wallRun(ctx, 26 * M, gateZ, CW, gateZ, OH, OW, 'brick', 'capGrey');
  for (var mx = -CW; mx < CW; mx += 3.4 * M) {
    if (Math.abs(mx) < 28 * M) continue;
    A.brick.box(mx, OH + 1.0 * M, gateZ + OW / 2 - 0.3 * M, 1.7 * M, 1.6 * M, 0.6 * M, { bottom: true });
  }
  A.brick.box(0, 7 * M, gateZ, 56 * M, 14 * M, 26 * M, { bottom: true });
  A.arch.box(0, 3.4 * M, gateZ, 6 * M, 6.8 * M, 26.2 * M, { bottom: true });
  A.stone.box(0, 14.2 * M, gateZ, 57 * M, 0.4 * M, 27 * M, { bottom: true });
  P.put('cityGate', T.cityGate, 0, gateZ, Math.PI, 1, 14.4 * M);
  // a canal to the east, stone banks, bridges where the streets cross
  var cx = Hx + ring + 70 * M, cwid = 18 * M;
  strip(ctx, 'water', cx - cwid / 2, Zb - 500 * M, cx + cwid / 2, gateZ - OW, 0.04 * M);
  [-1, 1].forEach(function (sd) { A.stone.box(cx + sd * (cwid / 2 + 0.6 * M), 0.1 * M, (Zb - 500 * M + gateZ - OW) / 2, 1.2 * M, 1.2 * M, gateZ - OW - Zb + 500 * M, { bottom: true }); });
  for (var bz = Zb - 420 * M; bz < gateZ - 40 * M; bz += 120 * M) {
    archBridge(ctx, cx, bz, false, cwid + 10 * M, 6 * M, 2.6 * M, 0.5 * M);
    for (var w = 0; w < 4; w++) ctx.trees.push([cx + (w < 2 ? -1 : 1) * (cwid / 2 + 3 * M), bz + (w % 2 ? 9 : -9) * M, 0.95, 1]);
  }
  P.put('bridgePav', T.bridgePav, cx + cwid / 2 + 10 * M, Zb - 60 * M, 0);
  // the town: hutong all round, kept off the street, the canal and the gate
  hutongRing(ctx, -Hx - ring, Zb - ring, Hx + ring, Zf + ring, lite ? 300 * M : 760 * M, function (x, z) {
    if (Math.abs(x) < streetW / 2 + 12 * M && z > Zf) return true;            // the market street
    if (Math.abs(x - cx) < cwid / 2 + 16 * M) return true;                     // the canal
    if (z > gateZ - OW - 20 * M) return true;                                  // beyond the wall
    return false;
  });
}

// ---------------------------------------------------------------------------
//  野 OPEN COUNTRY: fields, villages, tree belts, a river
// ---------------------------------------------------------------------------
function buildCountry(ctx) {
  var M = ctx.M, P = ctx.P, A = ctx.acc, rnd = ctx.rnd, lite = ctx.lite, info = ctx.info;
  var clear = Math.max(info.width, info.depth || info.width) * 1.7 + 40 * M;
  var R = (lite ? 600 : 1100) * M;
  // the year's crops side by side: wheat ripening, young millet, sorghum,
  // fresh-ploughed earth, a field gone to rape flower, a vegetable plot
  // (linear multipliers on the field texture: wheat, young millet, sorghum,
  // ploughed earth, rape in flower, vegetables, fallow)
  var crops = [[0.66, 0.48, 0.17], [0.22, 0.38, 0.11], [0.14, 0.26, 0.08], [0.33, 0.22, 0.13],
               [0.74, 0.62, 0.10], [0.24, 0.36, 0.15], [0.45, 0.38, 0.23]];
  var col = new THREE.Color();
  var fw = 56 * M, fd = 84 * M, path = 6 * M;
  var river = function (z) { return 300 * M + 70 * M * Math.sin(z / (200 * M)) + 30 * M * Math.sin(z / (73 * M)); };
  var villages = [[-330, -220], [200, -420], [-470, 260], [460, 160], [-140, 470], [80, 560], [-620, -40], [640, -300]];
  var nv = lite ? 4 : villages.length;
  function nearVillage(x, z) {
    for (var v = 0; v < nv; v++) if (Math.hypot(x - villages[v][0] * M, z - villages[v][1] * M) < 95 * M) return true;
    return false;
  }
  for (var ix = -Math.ceil(R / fw); ix <= Math.ceil(R / fw); ix++) {
    for (var iz = -Math.ceil(R / fd); iz <= Math.ceil(R / fd); iz++) {
      var x = ix * fw, z = iz * fd;
      var rr = Math.hypot(x, z);
      if (rr > R) continue;
      if (Math.abs(x) < clear && Math.abs(z) < clear) continue;
      if (Math.abs(x - river(z)) < 34 * M) continue;
      if (nearVillage(x, z)) continue;
      // a field, sometimes split in two strips of different crops
      var split = rnd() < 0.35;
      for (var h = 0; h < (split ? 2 : 1); h++) {
        var c = crops[Math.floor(rnd() * crops.length)];
        var k = 0.85 + 0.25 * rnd();
        col.setRGB(c[0] * k, c[1] * k, c[2] * k);
        var w = fw - path, d = split ? (fd - path) / 2 - 1 * M : fd - path;
        var zc = split ? z - (fd - path) / 4 + h * (fd - path) / 2 : z;
        var g = new THREE.PlaneGeometry(w, d, 1, 1);
        g.rotateX(-Math.PI / 2);
        if (rnd() < 0.5) g.rotateY(Math.PI / 2);
        g.translate(x, 0.03 * M, zc);
        var uv = g.attributes.uv;
        for (var q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * w / M, uv.getY(q) * d / M);
        ctx.fieldAcc.add(g, new THREE.Matrix4(), col);
        g.dispose();
      }
      // a windbreak of poplars along every third field road
      if (iz % 3 === 0 && (ix & 1) === 0 && rr < R * 0.75) {
        for (var t = 0; t < 5; t++) ctx.trees.push([x - fw / 2 + t * fw / 5, z - fd / 2, 0.85 + rnd() * 0.25, 1 + (t % 2)]);
      }
      if (rnd() < 0.08) ctx.trees.push([x + (rnd() - 0.5) * fw * 0.6, z + fd / 2 - 2 * M, 1.1 + rnd() * 0.3, 0]);
    }
  }
  // a meadow round the site itself, kept clear of the court's own paving
  var ct = ctx.court, gx0 = -ct.hx - 2 * M, gx1 = ct.hx + 2 * M, gz0 = ct.zb - 2 * M, gz1 = ct.zf + 2 * M;
  strip(ctx, 'grass', -clear, -clear, clear, gz0, 0.025 * M);
  strip(ctx, 'grass', -clear, gz1, clear, clear, 0.025 * M);
  strip(ctx, 'grass', -clear, gz0, gx0, gz1, 0.025 * M);
  strip(ctx, 'grass', gx1, gz0, clear, gz1, 0.025 * M);
  strip(ctx, 'earth', -4 * M, gz1, 4 * M, clear, 0.035 * M);
  for (var mt = 0; mt < 14; mt++) {
    var ma = rnd() * 6.28, md = clear * (0.55 + 0.4 * rnd());
    var mx = Math.cos(ma) * md, mz = Math.sin(ma) * md;
    if (Math.abs(mx) < 6 * M && mz > 0) continue;
    ctx.trees.push([mx, mz, 1.0 + rnd() * 0.4, Math.floor(rnd() * 4)]);
  }
  // field roads: earth tracks along the grid
  for (var rz = -Math.ceil(R / fd); rz <= Math.ceil(R / fd); rz += 3) {
    var zz = rz * fd - fd / 2;
    [[-R, -clear], [clear, R]].forEach(function (span) { strip(ctx, 'earth', span[0], zz - 2 * M, span[1], zz + 2 * M, 0.035 * M); });
  }
  strip(ctx, 'earth', -4 * M, clear, 4 * M, R, 0.04 * M);
  strip(ctx, 'earth', -R, -4 * M, -clear, 4 * M, 0.04 * M);
  // the river: water, a reed-and-willow bank, a stone arch bridge
  var N = 90, z0r = -R, z1r = R;
  for (var i = 0; i < N; i++) {
    var za = z0r + (z1r - z0r) * i / N, zb = z0r + (z1r - z0r) * (i + 1) / N;
    var xa = river(za), xb = river(zb), rw = 26 * M;
    A.water.face([[xa - rw / 2, 0.04 * M, za, xa, za], [xa + rw / 2, 0.04 * M, za, xa + rw, za], [xb + rw / 2, 0.04 * M, zb, xb + rw, zb], [xb - rw / 2, 0.04 * M, zb, xb, zb]], [0, 1, 0]);
    // grass banks either side
    [-1, 1].forEach(function (sd) {
      A.grass.face([[xa + sd * rw / 2, 0.05 * M, za, xa, za], [xa + sd * (rw / 2 + 9 * M), 0.05 * M, za, xa + 9, za],
                    [xb + sd * (rw / 2 + 9 * M), 0.05 * M, zb, xb + 9, zb], [xb + sd * rw / 2, 0.05 * M, zb, xb, zb]], [0, 1, 0]);
    });
    if (i % 2 === 0) ctx.trees.push([xa - rw / 2 - 5 * M, za, 1.0 + rnd() * 0.3, 1 + (i % 3)], [xa + rw / 2 + 5 * M, za + 12 * M, 1.0 + rnd() * 0.3, 2]);
  }
  var bzr = 60 * M, bxr = river(bzr);
  archBridge(ctx, bxr, bzr, false, 44 * M, 5.5 * M, 3.6 * M, 0.5 * M);
  strip(ctx, 'earth', bxr - 120 * M, bzr - 2.5 * M, bxr - 22 * M, bzr + 2.5 * M, 0.045 * M);
  strip(ctx, 'earth', bxr + 22 * M, bzr - 2.5 * M, bxr + 160 * M, bzr + 2.5 * M, 0.045 * M);
  // villages: courtyard houses round a threshing floor, a village temple,
  // a pond, old trees
  var T = {
    vtemple: buildingTpl({ L: 13, D: 8, Hb: 0.8, He: 3.6, ov: 1.4, rise: 0.40, roof: 'xieshan', bay: 4.3 }),
    vgate: buildingTpl({ L: 6, D: 4, Hb: 0.5, He: 3.0, ov: 1.0, rise: 0.40, roof: 'yingshan', bay: 3.0, ns: 3, nt: 2, house: true })
  };
  for (var v = 0; v < nv; v++) {
    var vx = villages[v][0] * M, vz = villages[v][1] * M;
    if (Math.abs(vx - river(vz)) < 70 * M) vx -= 140 * M;
    strip(ctx, 'earth', vx - 24 * M, vz - 16 * M, vx + 24 * M, vz + 16 * M, 0.035 * M);       // 场 threshing floor
    P.put('vtemple', T.vtemple, vx, vz - 30 * M, 0);
    var n = 10 + Math.floor(rnd() * 9);
    for (var hh = 0; hh < n; hh++) {
      var a = rnd() * 6.28, dd = 36 * M + rnd() * 50 * M;
      var hv = Math.floor(rnd() * 3);
      var hx = vx + Math.cos(a) * dd, hz = vz + Math.sin(a) * dd * 0.8;
      P.put('syh' + hv + (rnd() < 0.35 ? 'd' : ''), siheyuanTpl(hv), hx, hz, rnd() < 0.2 ? Math.PI : 0, 0.85);
      if (rnd() < 0.8) ctx.trees.push([hx + 13 * M, hz - 9 * M, 1.0 + rnd() * 0.3, Math.floor(rnd() * 4)]);
    }
    // the pond
    var px = vx + 30 * M, pz = vz + 34 * M, ring = [];
    for (var e = 0; e < 16; e++) { var pa = e / 16 * 6.28, pr = 12 * M * (1 + 0.2 * Math.sin(pa * 3 + v)); ring.push([px + Math.cos(pa) * pr * 1.4, 0.045 * M, pz + Math.sin(pa) * pr, 0, 0]); }
    A.water.face([[px, 0.045 * M, pz, 0, 0]].concat(ring).concat([ring[0]]), [0, 1, 0]);
    for (var ot = 0; ot < 5; ot++) ctx.trees.push([px + (rnd() - 0.5) * 50 * M, pz + (rnd() - 0.5) * 40 * M, 1.1 + rnd() * 0.3, Math.floor(rnd() * 4)]);
    // the road into the village
    strip(ctx, 'earth', vx - 3 * M, vz + 16 * M, vx + 3 * M, vz + 110 * M, 0.04 * M);
  }
}

// ---------------------------------------------------------------------------
//  keep the world in step with the court: rebuilt only when its key changes
// ---------------------------------------------------------------------------
function disposeWorld() {
  if (!WORLD.group) return;
  worldGroup.remove(WORLD.group);
  var mats = [];
  WORLD.group.traverse(function (o) {
    if (!o.isMesh) return;
    // template geometries are cached and shared; only the merged meshes go
    if (!o.isInstancedMesh) o.geometry.dispose();
    if (mats.indexOf(o.material) < 0) mats.push(o.material);
  });
  mats.forEach(function (m) { m.dispose(); });
  WORLD.group = null;
}
function registerWorldLamps() {
  if (!WORLD.group) return;
  (WORLD.group.userData.lampMats || []).forEach(function (l) { LAMPS.mats.push(l); });
  var u = WORLD.group.userData.glowUniform;
  if (u && LAMPS.uniforms.indexOf(u) < 0) LAMPS.uniforms.push(u);
  var gm = WORLD.group.userData.glowMesh;
  if (gm && AO_HIDDEN.indexOf(gm) < 0) AO_HIDDEN.push(gm);
}
function updateWorld(info, court, sync) {
  worldGroup.visible = SITE.visible;
  var key = worldKey(info, court);
  if (key === WORLD.key && WORLD.group) { registerWorldLamps(); return; }
  var gen = ++WORLD.gen;
  clearTimeout(WORLD.timer);
  function go() {
    if (gen !== WORLD.gen) return;
    disposeWorld();
    WORLD.group = buildWorld(info, court);
    WORLD.key = key;
    worldGroup.add(WORLD.group);
    registerWorldLamps();
    applyNightLights();
    requestRender();
  }
  if (sync || !WORLD.group) go(); else WORLD.timer = setTimeout(go, 360);
}
