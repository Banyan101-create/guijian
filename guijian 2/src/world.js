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
// Each vertex also carries the accumulator's current colour (`col`), so one
// mesh can hold a roof, its darker soffit and its ridge in one draw call.
function MeshAcc() { this.p = []; this.uv = []; this.c = []; this.idx = []; this.n = 0; this.col = [1, 1, 1]; }
MeshAcc.prototype.v = function (x, y, z, u, w) {
  this.p.push(x, y, z); this.uv.push(u, w); this.c.push(this.col[0], this.col[1], this.col[2]);
  return this.n++;
};
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
    this.c.push(src.c[i * 3], src.c[i * 3 + 1], src.c[i * 3 + 2]);
  }
  for (var k = 0; k < src.idx.length; k++) this.idx.push(src.idx[k] + base);
  this.n += src.n;
};
MeshAcc.prototype.geometry = function () {
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
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
    roof: tiles(cRoof, 0.40), roofGreen: tiles('#4f8a5c', 0.36), roofGrey: tiles('#5c5e60', 0.27),
    ridge: std(darker(cRoof, 0.85), { roughness: 0.5 }), ridgeGrey: std('#5d5e5b'), ridgeGreen: std('#3f6a4a', { roughness: 0.5 }),
    soffit: std('#4a2f24'), soffitGrey: std('#3b3631'),
    fascia: std('#7a2418'), fasciaGrey: std('#4a3b30'),
    gable: std(darker(cWall, 0.95)),
    facade: lit(new THREE.MeshStandardMaterial({ map: palaceBay(false), emissiveMap: palaceBay(true), roughness: 0.8 }), 0.85),
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
    vcol: std('#ffffff', { vertexColors: true, roughness: 0.9 }),
    ground: dress(std('#8a8274', { vertexColors: true }), 'earth', 1, { size: 5, normal: 0.5 }),
    beam: std('#2d5068', { roughness: 0.7 }),
    gold: std('#c9a548', { metalness: 0.9, roughness: 0.35 })
  };
  mats.water.color = C('#203133');
  // everything laid flat on the ground is drawn a little toward the eye, in
  // order, so the layers never fight however far off they are
  [['ground', -1], ['grass', -1], ['field', -1], ['earth', -2], ['lane', -2], ['paving', -2], ['water', -3]].forEach(function (p) {
    var m = mats[p[0]];
    m.polygonOffset = true; m.polygonOffsetFactor = p[1]; m.polygonOffsetUnits = p[1] * 2;
  });
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

// ---------------------------------------------------------------------------
//  placing: collect placements per template, then bake them all, one mesh
//  per material
// ---------------------------------------------------------------------------
function Placer(M) { this.M = M; this.lists = {}; this.tpls = {}; }
Placer.prototype.put = function (name, tpl, x, z, rot, s, y) {
  this.tpls[name] = tpl;
  (this.lists[name] = this.lists[name] || []).push([x, y || 0, z, rot || 0, (s || 1) * this.M]);
};
// Everything placed is baked into one static mesh per material: a few hundred
// halls of a dozen kinds cost a dozen draw calls, not a dozen per kind.
Placer.prototype.build = function (group, slotMats) {
  var self = this, byMat = [], count = 0;
  Object.keys(this.lists).forEach(function (name) {
    var list = self.lists[name], tpl = self.tpls[name];
    Object.keys(tpl.parts).forEach(function (slot) {
      var mat = slotMats(name, slot);
      if (!mat) return;
      var g = tpl.parts[slot], e = null;
      for (var i = 0; i < byMat.length; i++) if (byMat[i].mat === mat) { e = byMat[i]; break; }
      if (!e) byMat.push(e = { mat: mat, parts: [], nv: 0, ni: 0 });
      e.parts.push([g, list]);
      e.nv += g.attributes.position.count * list.length;
      e.ni += (g.index ? g.index.count : g.attributes.position.count) * list.length;
    });
    count += list.length;
  });
  byMat.forEach(function (e) {
    var P = new Float32Array(e.nv * 3), N = new Float32Array(e.nv * 3), U = new Float32Array(e.nv * 2);
    var I = e.nv > 65535 ? new Uint32Array(e.ni) : new Uint16Array(e.ni);
    var v = 0, k = 0;
    e.parts.forEach(function (pl) {
      var g = pl[0], pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv ? g.attributes.uv.array : null;
      var idx = g.index ? g.index.array : null, vc = g.attributes.position.count;
      pl[1].forEach(function (it) {
        var c = Math.cos(it[3]), sn = Math.sin(it[3]), sc = it[4], base = v;
        for (var i = 0; i < vc; i++) {
          var x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          P[v * 3] = (c * x + sn * z) * sc + it[0]; P[v * 3 + 1] = y * sc + it[1]; P[v * 3 + 2] = (c * z - sn * x) * sc + it[2];
          var nx = nor[i * 3], nz = nor[i * 3 + 2];
          N[v * 3] = c * nx + sn * nz; N[v * 3 + 1] = nor[i * 3 + 1]; N[v * 3 + 2] = c * nz - sn * nx;
          if (uv) { U[v * 2] = uv[i * 2]; U[v * 2 + 1] = uv[i * 2 + 1]; }
          v++;
        }
        if (idx) for (var j = 0; j < idx.length; j++) I[k++] = idx[j] + base;
        else for (var j2 = 0; j2 < vc; j2++) I[k++] = base + j2;
      });
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    geo.computeBoundingSphere();
    var mesh = new THREE.Mesh(geo, e.mat);
    mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
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

// the palace-style templates, metres, shared by every layout
var _palTpl = null;
function palaceTemplates() {
  if (_palTpl) return _palTpl;
  return (_palTpl = {
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
    jpav: buildingTpl({ L: 12, D: 12, Hb: 1.6, He: 5.0, ov: 2.0, rise: 0.60, roof: 'pyramid', bay: 4.0 }),
    // the roof of an arrow tower or a corner tower: it sits on a brick body
    atower: buildingTpl({ L: 36, D: 14, Hb: 0, He: 1.4, ov: 2.0, rise: 0.42, roof: 'xieshan', bay: 6.0, steps: false, margin: 0 }),
    // 天安门: nine bays under a hip-and-gable roof, on its 城台
    tam: buildingTpl({ L: 57, D: 25, Hb: 0.6, He: 8.0, ov: 2.9, rise: 0.42, roof: 'xieshan', bay: 6.3, wen: true, steps: false }),
    // a long range of rooms: 朝房, 千步廊, storehouses
    long: buildingTpl({ L: 44, D: 7.5, Hb: 0.6, He: 3.8, ov: 1.4, rise: 0.34, roof: 'yingshan', bay: 4.0 })
  });
}

var WORLD_FOGCAP = 1e9;
function buildWorld(info, court) {
  var g = new THREE.Group();
  var M = info.M, lite = IS_TOUCH;
  KIT_UM.value = M;
  buildKit();
  var W = worldMaterials(info.colors.roof, info.colors.wall, lite);
  var P = new Placer(M);
  var acc = { wall: new MeshAcc(), cap: new MeshAcc(), lane: new MeshAcc(), paving: new MeshAcc(), water: new MeshAcc(),
              stone: new MeshAcc(), brick: new MeshAcc(), capGrey: new MeshAcc(), grass: new MeshAcc(), arch: new MeshAcc(),
              earth: new MeshAcc(), beam: new MeshAcc(), ground: new MeshAcc(), vcol: new MeshAcc() };
  var fieldAcc = new GeoAcc();
  var F = new Fabric(M);
  var rnd = TEXGEN.rng(20261025);
  var ctx = { info: info, court: court, M: M, lite: lite, P: P, acc: acc, trees: [], rnd: rnd, W: W, fieldAcc: fieldAcc,
              extra: [], glows: [], F: F, holes: [], T: palaceTemplates() };

  if (SITE.mode !== 'court') buildCountryside(ctx);
  else if (info.type === 'pagoda') buildTempleTownCity(ctx);
  else buildCapital(ctx);

  if (ctx.worldR) farFields(ctx, ctx.worldR, ctx.worldR * 2.2);

  // trees collected the older way go into the fabric too
  var OLD = [0, 2, 4, 5];
  ctx.trees.forEach(function (t) { F.tree(OLD[t[3] % 4], t[0], t[1], t[2], null, t[4]); });

  // the city's own ground: packed earth inside the wall, with a hole where
  // the court's paving is
  if (ctx.groundRect) {
    var G = ctx.groundRect, wt = 1.6 * M;
    var h = { x0: -court.hx - wt, x1: court.hx + wt, z0: court.zb - wt, z1: court.zf + wt };
    [[G.x0, G.z0, G.x1, h.z0], [G.x0, h.z1, G.x1, G.z1], [G.x0, h.z0, h.x0, h.z1], [h.x1, h.z0, G.x1, h.z1]].forEach(function (q) {
      var nx = Math.max(1, Math.round((q[2] - q[0]) / (40 * M))), nz = Math.max(1, Math.round((q[3] - q[1]) / (40 * M)));
      acc.ground.col = [1, 1, 1];
      acc.ground.grid(nx, nz, function (s, t) {
        var x = q[0] + (q[2] - q[0]) * s, z = q[1] + (q[3] - q[1]) * t;
        var k = 0.86 + 0.28 * (0.5 + 0.5 * Math.sin(x * 0.013 / M + Math.cos(z * 0.011 / M) * 2.1)) * (0.7 + 0.3 * Math.sin(z * 0.031 / M));
        acc.ground.col = [k, k * 0.985, k * 0.96];
        return [x, 0, z, x, z];
      }, [0, 1, 0]);
    });
  }

  // the fabric: houses, walls, shops, trees, in tiles with two levels of detail
  var KM = kitMaterials(W.lamps);
  g.add(F.build(ctx.fabricInner, lite ? 200 : 230, KM));
  g.userData.fabric = F;

  // the palace-style buildings, their roof colour named after the '|'
  var slot = {
    roof: 'roof', under: 'soffit', fascia: 'fascia', ridge: 'ridge', gable: 'gable', facade: 'facade',
    wall: 'wall', base: 'stone', wall2: 'brick', cap: 'capGrey', court: 'paving'
  };
  P.build(g, function (name, s) {
    var parts = name.split('|'), tone = parts[1] || 'y';
    if (parts[0] === 'paifang' && (s === 'facade' || s === 'wall' || s === 'base')) return null;
    if (s === 'roof') return tone === 'g' ? W.roofGreen : tone === 'k' ? W.roofGrey : W.roof;
    if (s === 'ridge') return tone === 'g' ? W.ridgeGreen : tone === 'k' ? W.ridgeGrey : W.ridge;
    if (s === 'fascia' && tone === 'k') return W.fasciaGrey;
    return W[slot[s]];
  });

  // merged statics; their UVs were laid in scene units, the textures are in metres
  var accMat = { wall: W.wall, cap: W.cap, lane: W.lane, paving: W.paving, water: W.water, stone: W.stone,
                 brick: W.brick, capGrey: W.capGrey, grass: W.grass, arch: W.arch, earth: W.earth, beam: W.beam,
                 ground: W.ground, vcol: W.vcol };
  Object.keys(acc).forEach(function (k) {
    if (!acc[k].n) return;
    var geo = acc[k].geometry(), uv = geo.attributes.uv;
    for (var i = 0; i < uv.array.length; i++) uv.array[i] /= M;
    var mesh = new THREE.Mesh(geo, accMat[k]);
    mesh.receiveShadow = false; mesh.castShadow = false;
    g.add(mesh);
  });
  if (fieldAcc.p.length) {
    var fm = new THREE.Mesh(fieldAcc.geometry(), W.field);
    fm.receiveShadow = false;
    g.add(fm);
  }
  ctx.extra.forEach(function (o) { g.add(o); });
  // lanterns at gates and shrines: glows only, the lamps too small to see
  var m4 = new THREE.Matrix4();
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
  // the haze is whole at the last of the far fields, so the world has no edge
  WORLD_FOGCAP = (ctx.worldR || 2000 * M) * 2.1;
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
  b.col = acc.col;
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
  b.col = acc.col;
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
  var T = ctx.T;
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

  // ---- the compounds, east and west, and north of the court. No two the
  // same size, none the same inside: a hall court, a 前殿后寝 pair, rows of
  // living quarters, a garden, a shrine in its grove, a prince's court under
  // green tiles. Ranges of rooms (围房) line the walls, as in the palace.
  var RS = 0.55, RL = 44 * RS * M, RD = 7.5 * RS * M;     // one range: 24 m by 4 m
  function rangeRun(tone, x0r, z0r, x1r, z1r, rot) {
    // ranges end to end from (x0r,z0r) to (x1r,z1r), facing `rot`
    var alongX = Math.abs(x1r - x0r) > Math.abs(z1r - z0r), len = alongX ? Math.abs(x1r - x0r) : Math.abs(z1r - z0r);
    var n = Math.floor(len / (RL + 0.6 * M));
    if (n < 1) return;
    var s0 = (len - n * (RL + 0.6 * M)) / 2 + (RL + 0.6 * M) / 2;
    for (var i = 0; i < n; i++) {
      var f = (s0 + i * (RL + 0.6 * M)) / len;
      P.put('long' + tone, T.long, x0r + (x1r - x0r) * f, z0r + (z1r - z0r) * f, rot, RS);
    }
  }
  function compound(cx, cz, w, d, k) {
    var hw = w / 2, hd = d / 2, gw = 4.2 * M;
    var h = 5.0 * M, t = 1.1 * M;
    wallRun(ctx, cx - hw, cz - hd, cx + hw, cz - hd, h, t);
    wallRun(ctx, cx - hw, cz - hd, cx - hw, cz + hd, h, t);
    wallRun(ctx, cx + hw, cz - hd, cx + hw, cz + hd, h, t);
    wallRun(ctx, cx - hw, cz + hd, cx - gw, cz + hd, h, t);
    wallRun(ctx, cx + gw, cz + hd, cx + hw, cz + hd, h, t);
    var kind = ['hall', 'hall', 'pair', 'rows', 'garden', 'shrine', 'green', 'hall', 'pair', 'green', 'rows', 'pair'][Math.floor(rnd() * 12)];
    if (kind === 'garden' && w * d > 6000 * M * M) kind = 'pair';
    var tone = kind === 'green' ? '|g' : '';
    P.put('gate3' + tone, T.gate3, cx, cz + hd - 0.4 * M, 0, 0.9 + rnd() * 0.15);
    ctx.glows.push([cx - 3.4 * M, 3.4 * M, cz + hd + 3.0 * M, 2.4 * M], [cx + 3.4 * M, 3.4 * M, cz + hd + 3.0 * M, 2.4 * M]);
    strip(ctx, 'paving', cx - hw + t, cz - hd + t, cx + hw - t, cz + hd - t, 0.025 * M);
    var inX = hw - t / 2 - RD / 2 - 0.4 * M, backZ = cz - hd + t / 2 + RD / 2 + 0.4 * M;
    var sc = 0.86 + rnd() * 0.18;
    if (kind === 'garden') {
      // a garden court: a pond, a pavilion beside it, rockwork, trees; a
      // range of rooms along the back to look out over it
      var pr = Math.min(w, d) * 0.2;
      var ring = [];
      for (var i = 0; i < 14; i++) {
        var a = i / 14 * Math.PI * 2, rr = pr * (0.82 + 0.3 * Math.sin(a * 3 + k));
        ring.push([cx + Math.cos(a) * rr * 1.3, 0.05 * M, cz + Math.sin(a) * rr, Math.cos(a) * rr * 1.3, Math.sin(a) * rr]);
      }
      A.water.face([[cx, 0.05 * M, cz, 0, 0]].concat(ring).concat([ring[0]]), [0, 1, 0]);
      for (var e = 0; e < ring.length; e++) {
        var p0 = ring[e], p1 = ring[(e + 1) % ring.length];
        lineBox(A.stone, p0[0], p0[2], p1[0], p1[2], 0, 0.3 * M, 0.6 * M);
      }
      P.put(k % 2 ? 'pav' : 'pav|g', T.pav, cx + pr * 1.6, cz - pr * 0.5, 0);
      for (var s2 = 0; s2 < 7; s2++) A.stone.box(cx - pr * 1.5 + (rnd() - 0.5) * pr, (0.5 + rnd()) * M, cz + pr * 1.1 + (rnd() - 0.5) * pr * 0.5, (1.4 + rnd() * 2) * M, (1 + rnd() * 2.4) * M, (1.2 + rnd() * 1.6) * M, { bottom: true });
      for (var tt = 0; tt < 12; tt++) {
        var ta = rnd() * 6.28, td = pr * (1.7 + rnd() * 0.5);
        ctx.trees.push([cx + Math.cos(ta) * td * 1.1, cz + Math.sin(ta) * td * 0.9, 0.8 + rnd() * 0.4, Math.floor(rnd() * 4)]);
      }
      rangeRun('', cx - hw + 5 * M, backZ, cx + hw - 5 * M, backZ, 0);
      return;
    }
    if (kind === 'rows') {
      // living quarters: small courts one behind the other, each with its
      // range of rooms and a wall with a gap before it
      var nR = Math.max(2, Math.floor((d - 14 * M) / (21 * M))), step = (d - 10 * M) / nR;
      var rs = Math.min(1.15, (w - 8 * M) / (22 * M));
      for (var rw = 0; rw < nR; rw++) {
        var zr = cz - hd + 5 * M + rw * step;
        P.put('side5' + (rw % 3 === 2 ? '|k' : ''), T.side5, cx, zr + 5.5 * M, 0, rs);
        if (rw < nR - 1) {
          var zw = zr + step - 1.5 * M;
          wallRun(ctx, cx - hw, zw, cx - 1.8 * M, zw, 3.6 * M, 0.7 * M);
          wallRun(ctx, cx + 1.8 * M, zw, cx + hw, zw, 3.6 * M, 0.7 * M);
        }
        if (rnd() < 0.6) ctx.trees.push([cx + (rnd() < 0.5 ? 1 : -1) * w * 0.3, zr + step * 0.72, 0.8 + rnd() * 0.3, Math.floor(rnd() * 4)]);
      }
      return;
    }
    // ranges down both sides, and across the back unless a rear hall is there
    var twoCourts = d > 96 * M && kind !== 'shrine';
    var sideZ0 = cz - hd + t + 1.0 * M, sideZ1 = cz + hd - t - 6.5 * M;
    rangeRun(kind === 'green' ? '|k' : '', cx - inX, sideZ0, cx - inX, sideZ1, Math.PI / 2);
    rangeRun(kind === 'green' ? '|k' : '', cx + inX, sideZ0, cx + inX, sideZ1, -Math.PI / 2);
    var ix = inX - RD / 2 - 1.2 * M;                         // the court's inner half-width
    if (kind === 'shrine') {
      P.put('main5w', T.main5w, cx, cz - d * 0.12, 0, Math.min(0.7, ix * 2 / (30 * M)));
      P.put('pav', T.pav, cx - ix * 0.55, cz + d * 0.24, 0, 0.9);
      P.put('pav', T.pav, cx + ix * 0.55, cz + d * 0.24, 0, 0.9);
      A.stone.box(cx, 0.6 * M, cz + d * 0.14, 2.2 * M, 1.2 * M, 2.2 * M, { bottom: true });
      for (var g2 = 0; g2 < 12; g2++) ctx.trees.push([cx + (rnd() - 0.5) * ix * 1.7, cz - hd + (5 + rnd() * 8) * M + (g2 % 2 ? d * 0.55 : 0), 0.9 + rnd() * 0.3, 2]);
      rangeRun('', cx - ix, backZ, cx + ix, backZ, 0);
      return;
    }
    // the main hall, sized to its court
    var mainName = ix * 2 > 44 * M && rnd() < 0.35 ? 'main7x' : rnd() < 0.5 ? 'main5x' : 'main5w';
    var mL = mainName === 'main7x' ? 41 : 32;
    var ms = Math.min(sc, ix * 2 / (mL * M));
    var front = twoCourts ? cz - hd + d * 0.46 : cz - hd;  // north edge of the front court
    var fd = (cz + hd) - front;
    var mz = front + fd * 0.33;
    P.put(mainName + tone, T[mainName], cx, mz, 0, ms);
    var s3 = Math.min(sc, (ix - 4 * M) / (9.5 * M));
    var sx3 = ix - 5.2 * M * s3;
    P.put('side3' + tone, T.side3, cx - sx3, front + fd * 0.64, Math.PI / 2, s3);
    P.put('side3' + tone, T.side3, cx + sx3, front + fd * 0.64, -Math.PI / 2, s3);
    if (twoCourts) {
      // the rear court behind a cross wall: 后殿, its own side rooms
      wallRun(ctx, cx - hw, front, cx - 3.2 * M, front, 4.4 * M, 0.9 * M);
      wallRun(ctx, cx + 3.2 * M, front, cx + hw, front, 4.4 * M, 0.9 * M);
      P.put('gate3' + tone, T.gate3, cx, front, 0, 0.7);
      var rz = cz - hd + (front - (cz - hd)) * 0.42;
      var rn = rnd() < 0.5 ? 'main5w' : 'side5';
      P.put(rn + tone, T[rn], cx, rz, 0, Math.min(0.78, ix * 2 / (32 * M)));
      if (front - (cz - hd) > 40 * M) {
        P.put('side3|k', T.side3, cx - sx3, rz + 15 * M, Math.PI / 2, s3 * 0.85);
        P.put('side3|k', T.side3, cx + sx3, rz + 15 * M, -Math.PI / 2, s3 * 0.85);
      }
      rangeRun('|k', cx - ix, backZ, cx + ix, backZ, 0);
      ctx.trees.push([cx - ix * 0.6, rz + 13 * M, 0.85 + rnd() * 0.3, 0], [cx + ix * 0.6, rz + 13 * M, 0.85 + rnd() * 0.3, 3]);
    } else if (kind === 'pair') {
      // 前殿后寝: a second hall behind the first, joined by a covered way
      var bz = cz - hd + t + 6 * M;
      P.put('side5' + tone, T.side5, cx, bz, 0, Math.min(1.05, ix * 2 / (25 * M)));
      var gz0 = bz + 5 * M, gz1 = mz - 9 * ms * M;
      if (gz1 - gz0 > 2 * M) A.wall.box(cx, 2.2 * M, (gz0 + gz1) / 2, 3.5 * M, 4.4 * M, gz1 - gz0, { bottom: true });
    } else rangeRun(kind === 'green' ? '|k' : '', cx - ix, backZ, cx + ix, backZ, 0);
    // a path from the gate to the main hall's steps
    strip(ctx, 'lane', cx - 2.2 * M, mz + 10 * ms * M, cx + 2.2 * M, cz + hd - t, 0.04 * M);
    if (kind !== 'hall') {
      ctx.trees.push([cx - ix * 0.45, front + fd * 0.82, 0.9 + rnd() * 0.3, 0]);
      ctx.trees.push([cx + ix * 0.45, front + fd * 0.82, 0.9 + rnd() * 0.3, rnd() < 0.5 ? 0 : 2]);
    }
    // bronze vats and stone lanterns before the main hall
    [-1, 1].forEach(function (s4) {
      A.stone.box(cx + s4 * 9 * M * ms, 0.45 * M, mz + 12 * ms * M, 1.6 * M, 0.9 * M, 1.6 * M, { bottom: true });
      A.stone.box(cx + s4 * 4.5 * M, 0.9 * M, mz + 15 * ms * M, 0.5 * M, 1.8 * M, 0.5 * M, { bottom: true });
    });
  }
  // the columns either side of the court: their widths vary, and down each
  // the compounds are cut to different depths; one side never mirrors the other
  function split(a, b, n, gapW) {
    var ws = [], sum = 0;
    for (var i = 0; i < n; i++) { var q = 0.7 + rnd() * 0.65; ws.push(q); sum += q; }
    var free = (b - a) - gapW * (n - 1), out = [], p = a;
    ws.forEach(function (q) { var len = free * q / sum; out.push([p, p + len]); p += len + gapW; });
    return out;
  }
  var k = 0, laneX = [];
  [-1, 1].forEach(function (sd) {
    var cols = split(x0, PX - 16 * M, nE, lane);
    cols.forEach(function (c, ci) {
      if (ci > 0) laneX.push(sd * (c[0] - lane / 2));
      var z = PZb + 16 * M, zEnd = PZf - 18 * M;
      while (zEnd - z > 40 * M) {
        var dd = (50 + rnd() * 62) * M;
        if (zEnd - z - dd - lane < 46 * M) dd = zEnd - z;
        compound(sd * (c[0] + c[1]) / 2, z + dd / 2, c[1] - c[0], dd, k++);
        z += dd + lane;
      }
    });
    laneX.push(sd * (Hx + gap / 2));
  });
  // north of the court, either side of the axis
  [-1, 1].forEach(function (sd) {
    var halfW = Hx - lane / 2, z = Zb - gap, zEnd = PZb + 16 * M;
    while (z - zEnd > 40 * M) {
      var dd = (52 + rnd() * 50) * M;
      if (z - dd - lane - zEnd < 46 * M) dd = z - zEnd;
      compound(sd * (lane / 2 + halfW / 2), z - dd / 2, halfW, dd, k++);
      z -= dd + lane;
    }
  });

  // ---- lanes: the long ways north-south between the columns
  laneX.forEach(function (lx, i) {
    var lw = Math.abs(Math.abs(lx) - (Hx + gap / 2)) < 1e-3 ? gap * 0.6 : lane * 0.7;
    strip(ctx, 'lane', lx - lw / 2, PZb + 10 * M, lx + lw / 2, PZf - 10 * M);
  });
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
    P.put('pav|g', T.pav, px, JZ, 0, 1.2, h - 0.5 * M);
  });
  for (var jt = 0; jt < (lite ? 50 : 110); jt++) {
    var ja = rnd() * 6.28, jd = Math.sqrt(rnd()) * JR * 0.92;
    if (jd < 18 * M) continue;
    var tH = JH * (0.5 - 0.5 * Math.cos(Math.PI * Math.pow(1 - jd / JR, 0.8)));
    ctx.trees.push([Math.cos(ja) * jd, JZ + Math.sin(ja) * jd * 0.8, 1.0 + rnd() * 0.4, Math.floor(rnd() * 4), tH]);
  }

  // ---- 北海 the lake to the west, its island and the White Dagoba
  var lake = lakeWithDagoba(ctx, -ex0 - mw - 40 * M - 230 * M, (PZb + PZf) / 2 - 120 * M, 190 * M, 320 * M);
  ctx.holes.push({ fn: function (x, z) { return lake.inside(x, z, 10 * M); } });
  return {
    moat: { x0: -ex0 - mw, x1: ex0 + mw, z0: ez0 - mw, z1: sz0 + mw },
    JZ: JZ, JR: JR, JH: JH, lake: lake, PZf: PZf, PZb: PZb, PX: PX
  };
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
    cx: cx, cz: cz, rx: rx * 1.13, rz: rz * 1.13, x0: cx - rx * 1.13, x1: cx + rx * 1.13, z0: cz - rz * 1.13, z1: cz + rz * 1.13,
    inside: function (x, z, pad) {
      var dx = (x - cx) / (rx * 1.12 + (pad || 0)), dz = (z - cz) / (rz * 1.12 + (pad || 0));
      return dx * dx + dz * dz < 1;
    }
  };
}

// ---------------------------------------------------------------------------
//  keep the world in step with the court: rebuilt only when its key changes
// ---------------------------------------------------------------------------
function disposeWorld() {
  if (!WORLD.group) return;
  worldGroup.remove(WORLD.group);
  if (WORLD.group.userData.fabric) WORLD.group.userData.fabric.dispose();
  var mats = [];
  WORLD.group.traverse(function (o) {
    if (!o.isMesh) return;
    // template geometries are cached and shared; only the merged meshes and
    // the instance buffers go
    if (o.isInstancedMesh) { if (o.dispose) o.dispose(); }
    else o.geometry.dispose();
    if (mats.indexOf(o.material) < 0) mats.push(o.material);
  });
  mats.forEach(function (m) { m.dispose(); });
  pruneAoHidden();
  WORLD.group = null;
}
// the city's tiles near the eye are drawn in detail; called every frame,
// cheap (a few hundred box tests). True when anything changed.
function updateWorldLOD(cam) {
  if (!WORLD.group || !worldGroup.visible) return false;
  var F = WORLD.group.userData.fabric;
  return F ? F.updateLOD(cam) : false;
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
    fitFog();
    requestRender();
  }
  if (sync || !WORLD.group) go(); else WORLD.timer = setTimeout(go, 360);
}
