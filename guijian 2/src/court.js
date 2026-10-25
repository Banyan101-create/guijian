// ============================================================================
//  庭 THE COURT — what stands in it
//
//  A palace or temple court is not an empty square. Around this one:
//
//  * 配殿 side halls, east and west, facing the axis -- built by the same code
//    as the main hall, one rank lower, so they have real roofs, brackets and
//    lattice; for a pagoda, a 大殿 behind it as well, as in a temple
//  * 廊庑 corridors along the inside of the walls: red columns, a painted
//    beam, hanging 楣子 lattice, a 坐凳 bench, a rolled 卷棚 roof
//  * old trees in stone-kerbed pits: 侧柏 cypresses and 油松 pines, gnarled
//    and asymmetric, planted in formal pairs either side of the axis
//  * 吉祥缸 bronze water vats before the platform, a bronze 香炉 censer on the
//    axis, 石灯 stone lanterns lining the way
//
//  It all lives in the site group (never exported). Small parts are merged per
//  material and trees are instanced, so the whole court costs a few dozen draw
//  calls however much is in it.
// ============================================================================

// ---------------------------------------------------------------------------
//  geometry accumulator: transformed triangles, with colour and metre UVs
// ---------------------------------------------------------------------------
function GeoAcc() { this.p = []; this.n = []; this.uv = []; this.c = []; }
GeoAcc.prototype.add = function (geo, m4, col, uvFn) {
  var g = geo.index ? geo.toNonIndexed() : geo;
  var pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  var nm = new THREE.Matrix3().getNormalMatrix(m4);
  var v = new THREE.Vector3(), lv = new THREE.Vector3(), nn = new THREE.Vector3();
  for (var i = 0; i < pos.count; i++) {
    lv.fromBufferAttribute(pos, i);
    v.copy(lv).applyMatrix4(m4);
    nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    this.p.push(v.x, v.y, v.z); this.n.push(nn.x, nn.y, nn.z);
    var t = uvFn ? uvFn(i, lv, uv) : (uv ? [uv.getX(i), uv.getY(i)] : [0, 0]);
    this.uv.push(t[0], t[1]);
    var cc = typeof col === 'function' ? col(lv, nn, v) : col;
    this.c.push(cc.r, cc.g, cc.b);
  }
  if (g !== geo) g.dispose();
};
// one quad, both faces, sharing the given normals (so a foliage card is lit the
// same from either side): corners p[4], normals n[4], uvs uv[4], colour c[4]
GeoAcc.prototype.quad2 = function (p, n, uv, c) {
  var self = this;
  [[0, 1, 2, 0, 2, 3], [0, 2, 1, 0, 3, 2]].forEach(function (ix) {
    ix.forEach(function (k) {
      self.p.push(p[k].x, p[k].y, p[k].z); self.n.push(n[k].x, n[k].y, n[k].z);
      self.uv.push(uv[k][0], uv[k][1]); self.c.push(c[k].r, c[k].g, c[k].b);
    });
  });
};
GeoAcc.prototype.geometry = function () {
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
  g.computeBoundingSphere();
  g.userData.ownUVs = true;
  return g;
};

// small 3-D value noise for shaping crowns
function hash3(x, y, z) {
  var h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z) {
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  var fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  function L(a, b, t) { return a + (b - a) * t; }
  return L(L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx), fy),
           L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx), fy), fz);
}

// ============================================================================
//  TREES, in metres. A limb is a chain of tapered segments with a knuckle at
//  every joint; foliage is a mass of displaced clumps, darker underneath and
//  inside, the way a crown shades itself.
// ============================================================================
var _Y = new THREE.Vector3(0, 1, 0);
function limbChain(start, dir, len, n, wobble, rnd, upBias) {
  var pts = [start.clone()], d = dir.clone().normalize(), p = start.clone();
  for (var i = 0; i < n; i++) {
    d.x += (rnd() - 0.5) * wobble; d.z += (rnd() - 0.5) * wobble; d.y += (rnd() - 0.5) * wobble * 0.5 + (upBias || 0);
    d.normalize();
    p = p.clone().addScaledVector(d, len / n);
    pts.push(p);
  }
  return pts;
}
function addLimb(acc, pts, r0, r1, col) {
  var total = 0, seg = [];
  for (var i = 1; i < pts.length; i++) { var l = pts[i].distanceTo(pts[i - 1]); seg.push(l); total += l; }
  var run = 0, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), mid = new THREE.Vector3();
  for (var k = 1; k < pts.length; k++) {
    var a = pts[k - 1], b = pts[k], len = seg[k - 1];
    var ra = r0 + (r1 - r0) * (run / total), rb = r0 + (r1 - r0) * ((run + len) / total);
    var geo = new THREE.CylinderGeometry(rb, ra, len, 9, 1, true);
    var dir = new THREE.Vector3().subVectors(b, a).normalize();
    q.setFromUnitVectors(_Y, dir);
    m4.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, s1);
    var v0 = run;
    acc.add(geo, m4, col, function (i, lv, uv) { return [uv.getX(i) * Math.PI * 2 * (ra + rb) * 0.5, v0 + uv.getY(i) * len]; });
    geo.dispose();
    if (k < pts.length - 1) {
      var kn = new THREE.IcosahedronGeometry(rb * 1.04, 1);
      m4.makeTranslation(b.x, b.y, b.z);
      acc.add(kn, m4, col, function (i, lv) { return [lv.x * 3, lv.y * 3]; });
      kn.dispose();
    }
    run += len;
  }
}
// a clump of foliage: an icosphere pushed in and out by noise, so its outline
// is ragged; normals stay radial, which is what makes a mass of needles read
// soft rather than faceted
function addClump(acc, centre, r, sx, sy, sz, seed, tint) {
  var g = new THREE.IcosahedronGeometry(1, 1);
  var pos = g.attributes.position, nor = g.attributes.normal;
  var ox = seed * 7.13, oy = seed * 3.71, oz = seed * 5.37;
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    var k = 0.70 + 0.55 * noise3(x * 1.9 + ox, y * 1.9 + oy, z * 1.9 + oz) + 0.22 * noise3(x * 4.7 + oy, y * 4.7 + oz, z * 4.7 + ox);
    // a clump sags: flatter beneath than on top
    var yy = y < 0 ? y * 0.7 : y;
    pos.setXYZ(i, x * k * r * sx, yy * k * r * sy, z * k * r * sz);
    nor.setXYZ(i, x * 0.8 / sx, (y * 0.8 + 0.2) / sy, z * 0.8 / sz);
  }
  g.normalizeNormals();
  var m4 = new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z);
  var C = new THREE.Color();
  acc.add(g, m4, function (lv, nn, wv) {
    // lit tops, dark undersides, and darker toward the tree's own axis
    var up = nn.y * 0.5 + 0.5;
    var outward = Math.min(1, Math.hypot(wv.x, wv.z) / 4.0);
    var k = (0.42 + 0.58 * up) * (0.62 + 0.38 * outward) * tint;
    return C.setRGB(k, k, k);
  }, function (i, lv) {
    var d = Math.hypot(lv.x, lv.y, lv.z) || 1;
    return [Math.atan2(lv.z, lv.x) * r * 1.2, Math.acos(Math.max(-1, Math.min(1, lv.y / d))) * r * 1.2];
  });
  g.dispose();
}

// a tuft: a dark core for volume, and around it a spray of foliage cards --
// quads carrying a painted, cut-out spray of needles, turned every way. This is
// how trees are drawn in real-time work: the cards give the ragged, see-through
// edge of a real crown, the core keeps it from looking hollow. Card normals are
// bent out from the tuft's centre, so the whole tuft shades as one round mass.
var _cardN = new THREE.Vector3(), _cu = new THREE.Vector3(), _cv = new THREE.Vector3();
function addTuft(leaf, centre, r, sx, sy, sz, seed, tint) {
  var rnd = TEXGEN.rng(seed * 7 + 3);
  addClump(leaf.core, centre, r * 0.36, sx, sy, sz, seed, tint * 0.9);
  var flat = sy < 0.6;
  var k = r > 1.3 ? 11 : r > 0.95 ? 9 : 7;
  for (var i = 0; i < k; i++) {
    var a = rnd() * Math.PI * 2;
    // pine pads lie flat, so their cards mostly face up; cypress sprays stand
    // in vertical fans
    if (flat) _cardN.set((rnd() - 0.5) * 0.9, 1, (rnd() - 0.5) * 0.9).normalize();
    else _cardN.set(Math.cos(a), (rnd() - 0.5) * 0.7, Math.sin(a)).normalize();
    var helper = Math.abs(_cardN.y) < 0.9 ? _Y : new THREE.Vector3(1, 0, 0);
    _cu.crossVectors(helper, _cardN).normalize();
    _cv.crossVectors(_cardN, _cu).normalize();
    var rot = rnd() * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
    var U = _cu.clone().multiplyScalar(cr).addScaledVector(_cv, sr);
    var V = _cu.clone().multiplyScalar(-sr).addScaledVector(_cv, cr);
    var w = r * (1.25 + 0.6 * rnd());
    var off = new THREE.Vector3((rnd() - 0.5) * r * 0.8 * sx, (rnd() - 0.5) * r * 0.8 * sy, (rnd() - 0.5) * r * 0.8 * sz);
    var cc = centre.clone().add(off);
    var P = [cc.clone().addScaledVector(U, -w / 2).addScaledVector(V, -w / 2), cc.clone().addScaledVector(U, w / 2).addScaledVector(V, -w / 2),
             cc.clone().addScaledVector(U, w / 2).addScaledVector(V, w / 2), cc.clone().addScaledVector(U, -w / 2).addScaledVector(V, w / 2)];
    var q = Math.floor(rnd() * 4), u0 = (q % 2) * 0.5, v0 = Math.floor(q / 2) * 0.5;
    var UV = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 + 0.5], [u0, v0 + 0.5]];
    var N = [], Cs = [];
    for (var j = 0; j < 4; j++) {
      var d = P[j].clone().sub(centre).normalize();
      N.push(d.multiplyScalar(0.75).addScaledVector(_cardN, 0.25 * Math.sign(_cardN.dot(d) || 1)).normalize());
      var up = N[j].y * 0.5 + 0.5;
      var outward = Math.min(1, Math.hypot(P[j].x, P[j].z) / 4.0);
      var kk = (0.50 + 0.50 * up) * (0.68 + 0.32 * outward) * tint * (0.9 + 0.2 * rnd());
      Cs.push(new THREE.Color(kk, kk, kk));
    }
    leaf.cards.quad2(P, N, UV, Cs);
  }
}

// foliage sprays painted into a 2 x 2 atlas: four different sprays per species
var _sprayTex = {};
function sprayAtlas(kind) {
  if (_sprayTex[kind]) return _sprayTex[kind];
  var S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  var x = c.getContext('2d');
  var rnd = TEXGEN.rng(kind === 'pine' ? 909 : 707);
  var greens = kind === 'pine'
    ? ['#263d22', '#30492a', '#3b5632', '#48633a', '#58744a']
    : ['#2c4224', '#384f2c', '#465f34', '#557040', '#68834c'];
  function shade(i) { return greens[Math.max(0, Math.min(greens.length - 1, i))]; }
  for (var q = 0; q < 4; q++) {
    var ox = (q % 2) * 256, oy = (q >> 1) * 256;
    x.save();
    x.beginPath(); x.rect(ox + 2, oy + 2, 252, 252); x.clip();
    if (kind === 'pine') {
      // a twig with three or four rosettes of long needles
      var nros = 3 + Math.floor(rnd() * 2);
      for (var r = 0; r < nros; r++) {
        var px = ox + 128 + (rnd() - 0.5) * 120, py = oy + 128 + (rnd() - 0.5) * 120;
        var nn = 70 + Math.floor(rnd() * 40);
        for (var pass = 0; pass < 2; pass++) {
          for (var n = 0; n < nn; n++) {
            var ang = rnd() * Math.PI * 2, len = 35 + rnd() * 55;
            x.strokeStyle = shade(pass * 2 + Math.floor(rnd() * 3));
            x.lineWidth = 2.2 + rnd() * 1.2;
            x.beginPath(); x.moveTo(px, py);
            x.quadraticCurveTo(px + Math.cos(ang) * len * 0.5, py + Math.sin(ang) * len * 0.5 - 6,
                               px + Math.cos(ang) * len, py + Math.sin(ang) * len);
            x.stroke();
          }
        }
        x.fillStyle = '#4a3a2a'; x.beginPath(); x.arc(px, py, 3, 0, 6.28); x.fill();
      }
    } else {
      // a flat fan of scale-leaf branchlets either side of a stem: each
      // branchlet a tapering ribbon of overlapping scales, solid enough to
      // read as foliage, ragged at every edge
      var sx0 = ox + 128 + (rnd() - 0.5) * 30, sy0 = oy + 250;
      var tipX = ox + 128 + (rnd() - 0.5) * 60, tipY = oy + 14;
      var steps = 18;
      function ribbon(x0, y0, ang, len, w0, tone) {
        var n = Math.max(4, Math.round(len / 5));
        for (var i = 0; i < n; i++) {
          var g = i / n, w = w0 * (1 - 0.7 * g);
          var ex = x0 + Math.cos(ang) * len * g + (rnd() - 0.5) * 2, ey = y0 + Math.sin(ang) * len * g + (rnd() - 0.5) * 2;
          x.fillStyle = shade(tone + Math.floor(rnd() * 2) - (rnd() < 0.2 ? 1 : 0));
          x.beginPath(); x.ellipse(ex, ey, w, w * 0.62, ang + (rnd() - 0.5) * 0.8, 0, 6.28); x.fill();
        }
      }
      for (var st = 0; st < steps; st++) {
        var f = st / steps;
        var bx = sx0 + (tipX - sx0) * f, by = sy0 + (tipY - sy0) * f;
        var side = st % 2 ? 1 : -1;
        var blen = (105 - 65 * f) * (0.8 + 0.4 * rnd());
        var bang = -Math.PI / 2 + side * (0.8 + 0.35 * rnd());
        ribbon(bx, by, bang, blen, 10, 0);
        for (var sb = 1; sb <= 3; sb++) {
          var sf = sb / 4, sa = bang + (sb % 2 ? 0.7 : -0.7);
          ribbon(bx + Math.cos(bang) * blen * sf, by + Math.sin(bang) * blen * sf, sa, blen * 0.35 * (1 - sf * 0.5), 7, 1);
        }
        // highlights along the upper edge of the branchlet
        ribbon(bx + Math.cos(bang - side * 0.08) * 4, by - 3, bang, blen * 0.85, 4, 3);
      }
    }
    x.restore();
  }
  var t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  t.userData = { cached: true };
  return (_sprayTex[kind] = t);
}

// 侧柏: an old temple cypress. A short massive trunk, twisted, splitting into
// several leaders that climb and lean; the crown a broad irregular column of
// tufts. 10-14 m.
function buildCypress(seed) {
  var rnd = TEXGEN.rng(seed), bark = new GeoAcc(), leaf = { core: new GeoAcc(), cards: new GeoAcc() };
  var WOOD = new THREE.Color(1, 1, 1);
  var H = 10 + rnd() * 4;
  var lean = new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3);
  var trunkH = 2.2 + rnd() * 1.6;
  var trunk = limbChain(new THREE.Vector3(0, -0.2, 0), lean, trunkH, 4, 0.22, rnd, 0.05);
  addLimb(bark, trunk, 0.62, 0.42, WOOD);
  // a buttress flare at the foot
  addLimb(bark, [new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, 0.5, 0)], 0.85, 0.6, WOOD);
  var top = trunk[trunk.length - 1];
  var nL = 3 + Math.floor(rnd() * 3), a0 = rnd() * 6.28;
  for (var l = 0; l < nL; l++) {
    var a = a0 + l / nL * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    var spread = 0.22 + rnd() * 0.45;
    var dir = new THREE.Vector3(Math.cos(a) * spread, 1, Math.sin(a) * spread);
    var len = (H - trunkH) * (0.62 + rnd() * 0.38);
    var pts = limbChain(top, dir, len, 5, 0.32, rnd, 0.06);
    addLimb(bark, pts, 0.30, 0.06, WOOD);
    var nc = 6 + Math.floor(rnd() * 4);
    for (var c = 0; c < nc; c++) {
      var f = 0.25 + 0.75 * c / (nc - 1);
      var idx = Math.min(pts.length - 2, Math.floor(f * (pts.length - 1)));
      var t = f * (pts.length - 1) - idx;
      var p = pts[idx].clone().lerp(pts[idx + 1], t);
      var oa = rnd() * 6.28, od = 0.5 + rnd() * 1.3 * (1.1 - f * 0.5);
      p.x += Math.cos(oa) * od; p.z += Math.sin(oa) * od; p.y += (rnd() - 0.3) * 0.6;
      var r = (0.95 + rnd() * 0.75) * (1.05 - 0.35 * f);
      addTuft(leaf, p, r, 1.0, 0.95 + rnd() * 0.3, 1.0, seed * 31 + l * 7 + c, 0.82 + rnd() * 0.3);
    }
  }
  // side tufts low on the trunk -- old cypresses keep a few
  for (var s = 0; s < 3; s++) {
    var sa = rnd() * 6.28, sp = top.clone();
    sp.y -= rnd() * 0.8; sp.x += Math.cos(sa) * 1.4; sp.z += Math.sin(sa) * 1.4;
    addLimb(bark, [top.clone().setY(top.y - 0.5), sp], 0.16, 0.05, WOOD);
    addTuft(leaf, sp, 0.9 + rnd() * 0.4, 1.1, 0.8, 1.1, seed * 13 + s, 0.85);
  }
  return { bark: bark.geometry(), core: leaf.core.geometry(), cards: leaf.cards.geometry(), crown: 3.6, height: H };
}

// 油松: Chinese pine. A leaning trunk, limbs reaching out almost level, each
// ending in a flat pad of needles; an umbrella crown with sky between the
// tiers. 9-13 m.
function buildPine(seed) {
  var rnd = TEXGEN.rng(seed), bark = new GeoAcc(), leaf = { core: new GeoAcc(), cards: new GeoAcc() };
  var WOOD = new THREE.Color(1, 1, 1);
  var H = 8 + rnd() * 4;
  var la = rnd() * 6.28, lk = 0.15 + rnd() * 0.25;
  var trunk = limbChain(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(Math.cos(la) * lk, 1, Math.sin(la) * lk), H, 7, 0.22, rnd, 0.02);
  addLimb(bark, trunk, 0.42, 0.12, WOOD);
  addLimb(bark, [new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, 0.45, 0)], 0.58, 0.42, WOOD);
  var nB = 7 + Math.floor(rnd() * 4), ga = rnd() * 6.28;
  for (var b = 0; b < nB; b++) {
    var f = 0.42 + 0.55 * b / (nB - 1);
    var idx = Math.min(trunk.length - 2, Math.floor(f * (trunk.length - 1)));
    var base = trunk[idx].clone().lerp(trunk[idx + 1], f * (trunk.length - 1) - idx);
    var a = ga + b * 2.39996;
    var el = 0.10 + rnd() * 0.35;
    var dir = new THREE.Vector3(Math.cos(a), el, Math.sin(a));
    var len = (2.0 + rnd() * 2.4) * (1.15 - 0.55 * f);
    var pts = limbChain(base, dir, len, 4, 0.30, rnd, -0.03);
    addLimb(bark, pts, 0.16 * (1.2 - 0.6 * f), 0.04, WOOD);
    var tip = pts[pts.length - 1];
    var pr = 1.2 + rnd() * 0.8;
    addTuft(leaf, tip.clone().add(new THREE.Vector3(0, 0.25, 0)), pr, 1.25, 0.42, 1.25, seed * 17 + b, 0.85 + rnd() * 0.25);
    if (rnd() < 0.6) {
      var mid = pts[2].clone().add(new THREE.Vector3(0, 0.3, 0));
      addTuft(leaf, mid, pr * 0.7, 1.2, 0.45, 1.2, seed * 19 + b, 0.8);
    }
  }
  var crown = trunk[trunk.length - 1];
  for (var t = 0; t < 3; t++) {
    var ta = rnd() * 6.28;
    addTuft(leaf, crown.clone().add(new THREE.Vector3(Math.cos(ta) * 0.9, 0.2 + rnd() * 0.3, Math.sin(ta) * 0.9)), 1.4 + rnd() * 0.5, 1.3, 0.45, 1.3, seed * 23 + t, 0.95);
  }
  return { bark: bark.geometry(), core: leaf.core.geometry(), cards: leaf.cards.geometry(), crown: 4.2, height: H };
}

var _treeCache = null;
function treeTemplates() {
  if (_treeCache) return _treeCache;
  _treeCache = {
    cypress: [buildCypress(11), buildCypress(23), buildCypress(37)],
    pine: [buildPine(41), buildPine(53)]
  };
  return _treeCache;
}

// ---------------------------------------------------------------------------
//  shared canvas textures (kept across rebuilds)
// ---------------------------------------------------------------------------
var _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var x = c.getContext('2d');
  var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _blobTex = new THREE.CanvasTexture(c);
  _blobTex.userData = { cached: true };
  return _blobTex;
}

// ============================================================================
//  the court builder
// ============================================================================
function courtMaterials(M) {
  function cards(tex) {
    return new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.38, vertexColors: true, roughness: 0.88, metalness: 0,
                                            color: 0xffffff });
  }
  function std(hex, o) {
    var m = new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.8, metalness: 0 });
    if (o) Object.keys(o).forEach(function (k) { m[k] = o[k]; });
    return m;
  }
  return {
    bark: dress(std('#7a6a5c', { vertexColors: true }), 'bark', 1, { normal: 1.2 }),
    pineBark: dress(std('#7c6050', { vertexColors: true }), 'bark', 1, { normal: 1.2 }),
    cypressCore: dress(std('#3a4c32', { vertexColors: true }), 'foliage', 1, { normal: 1.0 }),
    pineCore: dress(std('#35462f', { vertexColors: true }), 'foliage', 1, { normal: 1.0 }),
    cypress: cards(sprayAtlas('cypress')),
    pine: cards(sprayAtlas('pine')),
    bronze: dress(std('#6f5a3a', { metalness: 0.75 }), 'stone', M, { size: 0.8, normal: 0.35, roughMul: 0.62 }),
    water: std('#0f1418', { roughness: 0.04, metalness: 0.0, envMapIntensity: 1.4 }),
    soil: dress(std('#4a3d30'), 'earth', M, { size: 1.5, normal: 0.8 }),
    granite: dress(std('#a19d94'), 'stone', M, { size: 1.0, normal: 0.9, roughMul: 1.0 }),
    ash: std('#3a3530', { roughness: 0.95 }),
    blob: new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.42,
                                        depthWrite: false, toneMapped: false, polygonOffset: true,
                                        polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  };
}

// side and rear halls: one rank down from the main building, real metres
function courtHall(Pm, M, bays, gradeShift, mats) {
  var grade = Math.min(11, Pm.grade + gradeShift);
  var D = deriveDimensions(grade, bays, 7, Pm.isDaShi, Pm.isSong);
  var mPerDk = D.doukouCun * 3.2 / 100;
  var scale = M * mPerDk;
  var tileM = (0.18 + 0.05 * D.doukouCun) * Pm.tileScale;
  var H = buildHall({
    D: D, scale: scale, M: M, isDaShi: Pm.isDaShi, isSong: Pm.isSong, roofType: 'xieshan',
    grade: grade, grade3: Pm.grade3, caihua: Pm.caihua, railing: false,
    shengqi: false, cejiao: Pm.cejiao, tuishan: Pm.tuishan,
    nBeasts: Pm.beasts && Pm.isDaShi ? Math.max(1, beastCount(grade) - 2) : 0,
    colours: Pm.colours, tileM: tileM, ridgeM: 0.55 + 0.12 * D.doukouCun, yulu: false
  }, mats);
  H.frontRun = H.base.userData.topHD + H.steps.userData.run;
  return H;
}

function buildCourt(info, court, mats, siteMats, lamps, g) {
  var M = info.M, CM = courtMaterials(M);
  // a phone gets the same court, lighter: three-bay side halls, fewer trees
  var lite = IS_TOUCH;
  var merge = new THREE.Group();
  merge.name = 'courtMerge';
  g.add(merge);
  var obstacles = [], keepOut = [], blobs = [];
  function blob(x, z, r) { blobs.push([x, z, r]); }
  var walled = SITE.mode === 'court';
  var isPagoda = info.type === 'pagoda';
  var W = info.width, Dp = info.depth;
  var pathHalf = (info.stepsHalfW || 2 * M) * 0.86 + 0.3 * M;
  var d = walled ? 4.6 * M : 0;              // corridor depth
  var X0 = court.hx - d, Zf = court.zf - d, Zb = court.zb + (walled ? d : 0);
  var m4 = new THREE.Matrix4();

  function rect(x0, x1, z0, z1) { return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) }; }
  function blocked(x, z, r) {
    for (var i = 0; i < keepOut.length; i++) {
      var k = keepOut[i];
      if (x > k.x0 - r && x < k.x1 + r && z > k.z0 - r && z < k.z1 + r) return true;
    }
    return false;
  }
  function obstacle(x, z, hx, hz) { obstacles.push({ x: x, z: z, hx: hx, hz: hz }); }
  // the court is built as a list of steps, run one per frame by the caller, so
  // the page never stalls for the whole of it; a hall is merged as it lands
  var tasks = [];
  function step(fn) { tasks.push(fn); }
  function landHall(hg) { worldScaleUVs(hg); mergeStatic(hg); }

  // the main building and its steps stay clear
  keepOut.push(rect(-W / 2 - 2.5 * M, W / 2 + 2.5 * M, -Dp / 2 - 2.5 * M, info.frontZ + 1.5 * M));
  // the axis path, front and back
  keepOut.push(rect(-pathHalf - 1.5 * M, pathHalf + 1.5 * M, info.frontZ, court.zf));

  // ----------------------------------------------------------- 配殿 halls
  var sideHalls = [], Pm = info.hallP, H = null, bays, Ls, Ds, xc, zc, fits = false;
  function placeSide(side, hg) {
    hg.position.set(side * xc, 0, zc);
    hg.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;     // front toward the axis
    g.add(hg);
    hg.updateMatrixWorld(true);
    landHall(hg);
    sideHalls.push({ side: side, x: side * xc, z: zc, front: side * (xc - H.frontRun), group: hg });
    keepOut.push(rect(side * (xc + Ds / 2 + M), side * (xc - H.frontRun - 2.5 * M), zc - Ls / 2 - 2 * M, zc + Ls / 2 + 2 * M));
    obstacle(side * xc, zc, Ds / 2 + 0.3 * M, Ls / 2 + 0.3 * M);
    // lanterns under its front eave
    H.lamps.forEach(function (lp) {
      var v = new THREE.Vector3(lp.x, lp.y, lp.z).applyMatrix4(hg.matrixWorld);
      lamps.hang(v.x, v.y, v.z, 1.0);
    });
  }
  if (walled && Pm) step(function () {
    bays = lite ? 3 : 5; H = courtHall(Pm, M, bays, isPagoda ? 1 : 2, mats);
    Ls = H.base.userData.topHW * 2;              // along the court, once turned
    Ds = H.base.userData.topHD * 2;              // across
    var zMin = isPagoda ? -Ls / 2 : info.frontZ + 3 * M, zMax = Zf - 3 * M;
    if (zMax - zMin < Ls) {
      // too tight for five bays: three
      H.group.traverse(function (o) { if (o.isMesh) o.geometry.dispose(); });
      bays = 3; H = courtHall(Pm, M, bays, isPagoda ? 1 : 2, mats);
      Ls = H.base.userData.topHW * 2; Ds = H.base.userData.topHD * 2;
    }
    fits = zMax - zMin >= Ls && X0 - Ds - 2 * M > W / 2 + 8 * M;
    if (fits) {
      zc = isPagoda ? 0 : Math.max(zMin + Ls / 2, Math.min(zMax - Ls / 2, (info.frontZ + Zf) / 2));
      xc = X0 - Ds / 2 - 0.6 * M;
      info.sideHallSize = { L: Ls, D: Ds, run: H.frontRun };
      placeSide(-1, H.group);
    } else {
      H.group.traverse(function (o) { if (o.isMesh) o.geometry.dispose(); });
    }
  });
  if (walled && Pm) step(function () {
    if (fits) placeSide(1, courtHall(Pm, M, bays, isPagoda ? 1 : 2, mats).group);
  });

  // a pagoda stands before its temple's main hall
  if (walled && Pm && isPagoda) step(function () {
    {
      var R = courtHall(Pm, M, 5, 0, mats);
      var Lr = R.base.userData.topHW * 2, Dr = R.base.userData.topHD * 2;
      var zr = Zb + Dr / 2 + 1.5 * M;
      if (zr + Dr / 2 + R.steps.userData.run + 6 * M < -Dp / 2) {
        R.group.position.set(0, 0, zr);
        g.add(R.group);
        R.group.updateMatrixWorld(true);
        landHall(R.group);
        keepOut.push(rect(-Lr / 2 - 2 * M, Lr / 2 + 2 * M, zr - Dr / 2 - M, zr + Dr / 2 + R.steps.userData.run + 2 * M));
        obstacle(0, zr, Lr / 2 + 0.3 * M, Dr / 2 + 0.3 * M);
        R.lamps.forEach(function (lp) {
          var v = new THREE.Vector3(lp.x, lp.y, lp.z).applyMatrix4(R.group.matrixWorld);
          lamps.hang(v.x, v.y, v.z, 1.1);
        });
        // the way back to it, past the pagoda
        var z0 = zr + Dr / 2 + R.steps.userData.run, z1 = -Dp / 2;
        pathStrip(0, (z0 + z1) / 2, pathHalf * 2, z1 - z0, false);
        keepOut.push(rect(-pathHalf - 1.5 * M, pathHalf + 1.5 * M, z0, z1));
      } else {
        R.group.traverse(function (o) { if (o.isMesh) o.geometry.dispose(); });
      }
    }
  });

  // ------------------------------------------- 钟鼓楼 bell and drum towers
  // In a temple court the bell tower stands east of the way in and the drum
  // tower west: a timber pavilion with a balcony on a tall brick 城台 pierced
  // by an arched passage.
  if (walled && isPagoda && info.hallP && !lite) {
    var Pt = info.hallP;
    var Dt = deriveDimensions(Math.min(11, Pt.grade + 2), 3, 7, Pt.isDaShi, Pt.isSong);
    var tScale = M * Dt.doukouCun * 3.2 / 100;
    var tw = Dt.totalWidth * tScale, td = Dt.totalDepth * tScale;
    var podH = 5.2 * M, podW = Math.max(tw, td) + 3.2 * M;
    var tz = Zf - podW / 2 - 6 * M, tx = pathHalf + podW / 2 + 9 * M;
    if (tz - podW / 2 > info.frontZ + 6 * M && tx + podW / 2 < X0 - 4 * M) {
      [-1, 1].forEach(function (side) { step(function () {
        var tg = new THREE.Group();
        var TH = buildHall({
          D: Dt, scale: tScale, M: M, isDaShi: Pt.isDaShi, isSong: Pt.isSong, roofType: 'xieshan',
          grade: Math.min(11, Pt.grade + 2), grade3: Pt.grade3, caihua: Pt.caihua, railing: true,
          shengqi: false, cejiao: Pt.cejiao, tuishan: Pt.tuishan, nBeasts: 0,
          colours: Pt.colours, tileM: (0.18 + 0.05 * Dt.doukouCun) * Pt.tileScale, ridgeM: 0.55 + 0.12 * Dt.doukouCun, yulu: false
        }, mats);
        // the pavilion's own steps would hang in the air: the 城台 is its stair
        TH.steps.visible = false;
        TH.group.remove(TH.steps);
        TH.group.position.y = podH;
        tg.add(TH.group);
        // 城台: brick, battered a little, a stone coping, an arched way through
        var pod = new THREE.Mesh(new THREE.BoxGeometry(podW, podH, podW), siteMats.brick);
        pod.position.y = podH / 2; pod.castShadow = true; pod.receiveShadow = true;
        tg.add(pod);
        part(new THREE.BoxGeometry(podW + 0.3 * M, 0.25 * M, podW + 0.3 * M), mats.stone, 0, podH + 0.12 * M, 0, 0, tg);
        var archW = 2.6 * M, archH = 3.4 * M;
        [[0, 1], [0, -1]].forEach(function (f) {
          var ar = new THREE.Mesh(new THREE.BoxGeometry(archW, archH, 0.6 * M), CM.ash);
          ar.position.set(0, archH / 2, f[1] * (podW / 2 - 0.2 * M));
          tg.add(ar);
          var top = new THREE.Mesh(new THREE.CylinderGeometry(archW / 2, archW / 2, 0.6 * M, 16, 1, false, 0, Math.PI), CM.ash);
          top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2;
          top.position.set(0, archH, f[1] * (podW / 2 - 0.2 * M));
          tg.add(top);
        });
        tg.position.set(side * tx, 0, tz);
        tg.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(tg);
        tg.updateMatrixWorld(true);
        landHall(tg);
        TH.lamps.forEach(function (lp) {
          var v = new THREE.Vector3(lp.x, lp.y + podH, lp.z).applyMatrix4(tg.matrixWorld);
          lamps.hang(v.x, v.y, v.z, 0.9);
        });
        keepOut.push(rect(side * tx - podW / 2 - 2.5 * M, side * tx + podW / 2 + 2.5 * M, tz - podW / 2 - 2.5 * M, tz + podW / 2 + 2.5 * M));
        obstacle(side * tx, tz, podW / 2, podW / 2);
        blob(side * tx, tz, podW * 0.75);
      }); });
    }
  }

  // ------------------------------------------------------------ paths
  function pathStrip(x, z, w, l, alongX) {
    if (l <= 0 || w <= 0) return;
    var sx = alongX ? l : w, sz = alongX ? w : l;
    part(new THREE.BoxGeometry(sx, 0.06 * M, sz), siteMats.path, x, 0.03 * M, z, 0, merge);
    [-1, 1].forEach(function (s) {
      part(new THREE.BoxGeometry(alongX ? l : 0.28 * M, 0.1 * M, alongX ? 0.28 * M : l), siteMats.path,
           x + (alongX ? 0 : s * (w / 2 + 0.14 * M)), 0.05 * M, z + (alongX ? s * (w / 2 + 0.14 * M) : 0), 0, merge);
    });
  }
  step(function () {
  // a pagoda court gets the axis way the hall court already has
  if (isPagoda) {
    var pz0 = info.frontZ, pz1 = court.zf - 0.2 * M;
    pathStrip(0, (pz0 + pz1) / 2, pathHalf * 2, pz1 - pz0, false);
  }
  // cross paths from the axis to each side hall's steps
  sideHalls.forEach(function (sh) {
    var xa = sh.side * (pathHalf + 0.3 * M), xb = sh.front;
    pathStrip((xa + xb) / 2, sh.z, pathHalf * 1.4, Math.abs(xb - xa), true);
    keepOut.push(rect(xa, xb, sh.z - pathHalf * 0.7 - 1.5 * M, sh.z + pathHalf * 0.7 + 1.5 * M));
  });

  // ------------------------------------------------------- 廊庑 corridors
  if (walled) {
    var gateHalf = Math.max(5.5 * M, (info.stepsHalfW || 2 * M) * 2.4) / 2 + 1.2 * M;
    var segs = [];
    function sideRun(xs, inward) {
      // along a side wall, broken where a side hall stands against it
      var breaks = sideHalls.filter(function (s) { return s.side === Math.sign(xs); })
        .map(function (s) { return [s.z - info.sideHallSize.L / 2 - 0.5 * M, s.z + info.sideHallSize.L / 2 + 0.5 * M]; });
      var z = court.zb, runs = [];
      breaks.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (b) { runs.push([z, b[0]]); z = b[1]; });
      runs.push([z, court.zf]);
      runs.forEach(function (r) { if (r[1] - r[0] > 6 * M) segs.push({ a: new THREE.Vector3(xs, 0, r[0]), b: new THREE.Vector3(xs, 0, r[1]), inward: inward }); });
    }
    sideRun(court.hx, new THREE.Vector3(-1, 0, 0));
    sideRun(-court.hx, new THREE.Vector3(1, 0, 0));
    // front wall, either side of the gate; back wall whole
    var xe = court.hx - d;
    segs.push({ a: new THREE.Vector3(-xe, 0, court.zf), b: new THREE.Vector3(-gateHalf, 0, court.zf), inward: new THREE.Vector3(0, 0, -1) });
    segs.push({ a: new THREE.Vector3(gateHalf, 0, court.zf), b: new THREE.Vector3(xe, 0, court.zf), inward: new THREE.Vector3(0, 0, -1) });
    if (Zb + 4 * M < -Dp / 2) segs.push({ a: new THREE.Vector3(-xe, 0, court.zb), b: new THREE.Vector3(xe, 0, court.zb), inward: new THREE.Vector3(0, 0, 1) });
    segs.forEach(function (s) { buildCorridor(s.a, s.b, s.inward, d, M, mats, siteMats, lamps, merge); });
  }
  });

  // ---------------------------------------------------- the axis furniture
  step(function () {
  var furnZ0 = info.frontZ + 4 * M, furnZ1 = Zf - 5 * M;
  // 香炉 on the axis, a third of the way to the gate
  var censerZ = info.frontZ + Math.max(9 * M, (furnZ1 - info.frontZ) * 0.3);
  var censerS = M * (isPagoda ? 1.1 : 1.25);
  if (censerZ < furnZ1) {
    buildCenser(merge, 0, censerZ, censerS, mats, CM);
    lamps.glow(0, 1.75 * censerS, censerZ, 0.9 * censerS);
    lamps.light(0, 2.4 * censerS, censerZ, 0.9, 10 * M, 3);
    obstacle(0, censerZ, 1.5 * censerS, 1.5 * censerS);
    blob(0, censerZ, 2.2 * censerS);
  }
  // 吉祥缸 before the platform's front corners
  var vatS = M * (info.hallP && info.hallP.isDaShi ? 1.0 : 0.85);
  var vatX = Math.min(W / 2 - 1.6 * M, Math.max(pathHalf + 4 * M, W * 0.32));
  var vatZ = (isPagoda ? info.platformHD : Dp / 2) + 2.6 * M;
  if (vatX > pathHalf + 2.5 * M) {
    [-1, 1].forEach(function (s) {
      buildVat(merge, s * vatX, vatZ, vatS, mats, CM);
      obstacle(s * vatX, vatZ, 1.1 * vatS, 1.1 * vatS);
      blob(s * vatX, vatZ, 1.5 * vatS);
      keepOut.push(rect(s * vatX - 2 * M, s * vatX + 2 * M, vatZ - 2 * M, vatZ + 2 * M));
    });
  }
  // 石灯 in pairs along the way
  var lanternS = M * 1.0, lx = pathHalf + 2.0 * M;
  var lanternTpl = stoneLanternTemplate({ stone: CM.granite }, lampMat(new THREE.MeshStandardMaterial({ color: C('#efd6a2'), roughness: 0.6 }), new THREE.Color(1.0, 0.70, 0.38), 2.2));
  var lanternSpots = [];
  for (var lz = furnZ0 + 2 * M; lz < furnZ1; lz += 11 * M) {
    if (Math.abs(lz - censerZ) < 5 * M) continue;
    lanternSpots.push([-lx, lz], [lx, lz]);
  }
  sideHalls.forEach(function (sh) {
    var fx = sh.front - sh.side * 2.2 * M;
    lanternSpots.push([fx, sh.z - pathHalf * 0.7 - 1.6 * M], [fx, sh.z + pathHalf * 0.7 + 1.6 * M]);
  });
  lanternSpots.forEach(function (p, i) {
    var t = lanternTpl.clone();
    t.scale.setScalar(lanternS);
    t.position.set(p[0], 0, p[1]);
    merge.add(t);
    var fy = 1.86 * lanternS;
    lamps.glow(p[0], fy, p[1], 0.75 * lanternS);
    lamps.pool(p[0], 0, p[1], 3.2 * lanternS);
    // the lanterns nearest the building get the real lights
    lamps.light(p[0], fy + 0.6 * lanternS, p[1], 1.1, 10 * M, 2 - Math.abs(p[1] - info.frontZ) / (50 * M) - (Math.abs(p[0]) > lx * 1.5 ? 1 : 0));
    obstacle(p[0], p[1], 0.45 * lanternS, 0.45 * lanternS);
    blob(p[0], p[1], 0.9 * lanternS);
    keepOut.push(rect(p[0] - 1.5 * M, p[0] + 1.5 * M, p[1] - 1.5 * M, p[1] + 1.5 * M));
  });
  });

  // ------------------------------------------------------------ trees
  step(function () {
  var T = treeTemplates(), spots = [];
  var xMax = (walled ? X0 : court.hx) - 4 * M, zLo = Zb + 4 * M, zHi = Zf - 4 * M;
  var rows = [], step = 15 * M;
  for (var rx = pathHalf + 9 * M; rx < xMax; rx += 15 * M) rows.push(rx);
  rows.forEach(function (x, ri) {
    for (var z = zHi; z > zLo; z -= step) {
      if (blocked(x, z, 3.2 * M)) continue;
      // formal pairs: cypress on the inner rows, pines further out
      var kind = (ri === 0 || (ri + Math.round(z / step)) % 3) ? 'cypress' : 'pine';
      spots.push({ x: x, z: z, kind: kind, v: (ri * 7 + Math.round(z / step) * 3) & 0xff });
    }
  });
  // a row behind the main hall shows above its roof from the front
  if (!isPagoda && court.zb + d + 3 * M < -Dp / 2 - 4 * M) {
    var zr2 = (Zb - Dp / 2) / 2;
    for (var bx = 6 * M; bx < Math.min(xMax, W * 0.75); bx += 12 * M) {
      if (!blocked(bx, zr2, 2.5 * M)) spots.push({ x: bx, z: zr2, kind: 'cypress', v: Math.round(bx) & 0xff });
    }
  }
  // open country: a looser grove either side instead
  if (!walled) {
    spots = spots.filter(function (s) { return Math.abs(s.x) < W * 1.6 && Math.abs(s.z) < W * 1.6; });
  }
  // more places than trees: thin them evenly, so every row keeps some
  var cap = lite ? 6 : 12;
  if (spots.length > cap) {
    var stride = spots.length / cap, kept = [];
    for (var si = 0; si < cap; si++) kept.push(spots[Math.floor(si * stride)]);
    spots = kept;
  }
  var mir = [];
  spots.forEach(function (s) { mir.push(s, { x: -s.x, z: s.z, kind: s.kind, v: s.v + 1 }); });
  plantTrees(mir, T, CM, M, g, merge, siteMats, obstacles, blob);
  });

  // ---------------------------------------------------- contact shadows
  step(function () {
  if (blobs.length) {
    var bg = new THREE.PlaneGeometry(1, 1); bg.rotateX(-Math.PI / 2);
    var bi = new THREE.InstancedMesh(bg, CM.blob, blobs.length);
    blobs.forEach(function (b, i) { m4.makeScale(b[2] * 2, 1, b[2] * 2); m4.setPosition(b[0], 0.02 * M, b[1]); bi.setMatrixAt(i, m4); });
    bi.instanceMatrix.needsUpdate = true;
    bi.frustumCulled = false; bi.renderOrder = 1;
    g.add(bi);
    AO_HIDDEN.push(bi);
  }

  });

  g.userData.obstacles = obstacles;
  g.userData.mergeRoots = [merge];
  return tasks;
}

// ---------------------------------------------------------------------------
function plantTrees(spots, T, CM, M, g, merge, siteMats, obstacles, blob) {
  if (!spots.length) return;
  var groups = {};
  spots.forEach(function (s) {
    var list = T[s.kind], vi = s.v % list.length;
    var key = s.kind + vi;
    (groups[key] = groups[key] || { tpl: list[vi], kind: s.kind, at: [] }).at.push(s);
  });
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
  Object.keys(groups).forEach(function (k) {
    var G = groups[k], n = G.at.length;
    var bark = new THREE.InstancedMesh(G.tpl.bark, G.kind === 'pine' ? CM.pineBark : CM.bark, n);
    var core = new THREE.InstancedMesh(G.tpl.core, G.kind === 'pine' ? CM.pineCore : CM.cypressCore, n);
    var leaf = new THREE.InstancedMesh(G.tpl.cards, G.kind === 'pine' ? CM.pine : CM.cypress, n);
    G.at.forEach(function (s, i) {
      var r = TEXGEN.rng(Math.round(s.x * 13 + s.z * 7) | 0);
      var sz = M * (0.85 + 0.3 * r());
      q.setFromAxisAngle(_Y, r() * Math.PI * 2);
      m4.compose(ps.set(s.x, 0, s.z), q, sc.set(sz, sz, sz));
      bark.setMatrixAt(i, m4); core.setMatrixAt(i, m4); leaf.setMatrixAt(i, m4);
      obstacles.push({ x: s.x, z: s.z, hx: 0.7 * sz, hz: 0.7 * sz });
      blob(s.x, s.z, G.tpl.crown * sz * 0.9);
      // 树池: a square stone kerb round dark soil
      var pit = 1.5 * M;
      part(new THREE.BoxGeometry(pit * 2, 0.04 * M, pit * 2), CM.soil, s.x, 0.02 * M, s.z, 0, merge);
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (e) {
        part(new THREE.BoxGeometry(e[0] ? 0.26 * M : pit * 2 + 0.26 * M, 0.18 * M, e[0] ? pit * 2 : 0.26 * M), siteMats.path,
             s.x + e[0] * (pit + 0.13 * M), 0.09 * M, s.z + e[1] * (pit + 0.13 * M), 0, merge);
      });
    });
    [bark, core, leaf].forEach(function (im) {
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      im.frustumCulled = false;
      g.add(im);
    });
    // the occlusion pass draws with one override material and no alpha test,
    // so a card would occlude as a solid square: leave the cards out of it
    AO_HIDDEN.push(leaf);
  });
}

// ---------------------------------------------------------------------------
//  吉祥缸: a bronze water vat on a carved stone stand, ring handles on masks
// ---------------------------------------------------------------------------
function buildVat(parent, x, z, s, mats, CM) {
  var t = new THREE.Group();
  part(new THREE.BoxGeometry(2.0, 0.22, 2.0), mats.stone, 0, 0.11, 0, 0, t);
  part(new THREE.CylinderGeometry(0.92, 0.98, 0.26, 8), mats.stone, 0, 0.35, 0, 0, t);
  part(latheGeo([[0.0001, 0], [0.55, 0], [0.64, 0.04], [0.78, 0.20], [0.86, 0.44], [0.88, 0.68], [0.85, 0.90],
                 [0.88, 0.99], [0.91, 1.05], [0.86, 1.08], [0.82, 1.0], [0.0001, 0.97]], 28), CM.bronze, 0, 0.48, 0, 0, t);
  var water = new THREE.Mesh(new THREE.CircleGeometry(0.82, 28), CM.water);
  water.rotation.x = -Math.PI / 2; water.position.y = 0.48 + 0.975;
  t.add(water);
  [-1, 1].forEach(function (sd) {
    part(new THREE.SphereGeometry(0.13, 12, 8), CM.bronze, sd * 0.87, 0.48 + 0.72, 0, 0, t);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 18), CM.bronze);
    ring.position.set(sd * 0.93, 0.48 + 0.60, 0);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = true;
    t.add(ring);
  });
  t.scale.setScalar(s);
  t.position.set(x, 0, z);
  t.rotation.y = x < 0 ? Math.PI : 0;
  parent.add(t);
}

// ---------------------------------------------------------------------------
//  香炉: a three-legged bronze censer with upright ears and a domed lid, on a
//  stone plinth
// ---------------------------------------------------------------------------
function buildCenser(parent, x, z, s, mats, CM) {
  var t = new THREE.Group();
  part(new THREE.BoxGeometry(2.6, 0.18, 2.6), mats.stone, 0, 0.09, 0, 0, t);
  part(new THREE.BoxGeometry(2.1, 0.42, 2.1), mats.stone, 0, 0.39, 0, 0, t);
  part(new THREE.BoxGeometry(2.4, 0.12, 2.4), mats.stone, 0, 0.66, 0, 0, t);
  var y0 = 0.72;
  part(latheGeo([[0.0001, 0.55], [0.40, 0.56], [0.62, 0.70], [0.74, 0.92], [0.72, 1.14], [0.62, 1.26], [0.66, 1.32], [0.60, 1.36], [0.0001, 1.33]], 28), CM.bronze, 0, y0, 0, 0, t);
  for (var i = 0; i < 3; i++) {
    var a = i / 3 * Math.PI * 2 + Math.PI / 2;
    var top = new THREE.Vector3(Math.cos(a) * 0.40, y0 + 0.62, Math.sin(a) * 0.40);
    var bot = new THREE.Vector3(Math.cos(a) * 0.56, y0, Math.sin(a) * 0.56);
    var len = top.distanceTo(bot);
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, len, 10), CM.bronze);
    leg.position.copy(top).add(bot).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(_Y, top.clone().sub(bot).normalize());
    leg.castShadow = true; leg.receiveShadow = true;
    t.add(leg);
    part(new THREE.SphereGeometry(0.12, 10, 8), CM.bronze, bot.x, y0 + 0.06, bot.z, 0, t);
  }
  [-1, 1].forEach(function (sd) {
    var ear = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 16, Math.PI), CM.bronze);
    ear.position.set(sd * 0.56, y0 + 1.34, 0);
    ear.rotation.y = Math.PI / 2;
    ear.castShadow = true;
    t.add(ear);
  });
  // the lid, pierced in life so the smoke comes through; a 宝珠 on top
  part(latheGeo([[0.0001, 0], [0.60, 0], [0.56, 0.10], [0.40, 0.24], [0.18, 0.32], [0.13, 0.42], [0.18, 0.48], [0.0001, 0.50]], 24), CM.bronze, 0, y0 + 1.40, 0, 0, t);
  part(new THREE.SphereGeometry(0.11, 12, 10), CM.bronze, 0, y0 + 1.98, 0, 0, t);
  t.scale.setScalar(s);
  t.position.set(x, 0, z);
  parent.add(t);
}

// ---------------------------------------------------------------------------
//  廊庑: a corridor along the inside of a wall. a, b: its run along the wall
//  face (y = 0); inward: toward the court; d: its depth.
// ---------------------------------------------------------------------------
function buildCorridor(a, b, inward, d, M, mats, siteMats, lamps, parent) {
  var along = new THREE.Vector3().subVectors(b, a);
  var L = along.length();
  if (L < 4 * M) return;
  along.normalize();
  var th = Math.atan2(-along.z, along.x);
  // local z must point inward: if the rotation sends it the other way, run b -> a
  var lz = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
  if (lz.dot(inward) < 0) { var t0 = a; a = b; b = t0; along.negate(); th = Math.atan2(-along.z, along.x); }
  var g = new THREE.Group();
  g.position.copy(a);
  g.rotation.y = th;

  var plat = 0.42 * M, Hc = 3.1 * M, r = 0.15 * M;
  var nb = Math.max(1, Math.round(L / (3.6 * M))), bay = L / nb;
  var zF = d - 0.65 * M, zB = 0.45 * M;
  // 台明
  part(new THREE.BoxGeometry(L, plat, d + 0.2 * M), mats.base, L / 2, plat / 2, d / 2, 0, g);
  // columns
  var colGeo = new THREE.CylinderGeometry(r * 0.92, r, Hc, 12);
  for (var i = 0; i <= nb; i++) {
    var x = i * bay;
    part(colGeo, mats.column, x, plat + Hc / 2, zF, 0, g);
    part(colGeo, mats.column, x, plat + Hc / 2, zB, 0, g);
    // 穿插枋 tying the two rows
    part(new THREE.BoxGeometry(0.16 * M, 0.26 * M, zF - zB), mats.beam, x, plat + Hc - 0.15 * M, (zF + zB) / 2, 0, g);
  }
  // 檐枋 along both rows, the 彩画 band
  part(new THREE.BoxGeometry(L + 0.3 * M, 0.34 * M, 0.22 * M), mats.beam, L / 2, plat + Hc - 0.17 * M, zF, 0, g);
  part(new THREE.BoxGeometry(L + 0.3 * M, 0.34 * M, 0.22 * M), mats.beam, L / 2, plat + Hc - 0.17 * M, zB, 0, g);
  // 天花 ceiling boards
  part(new THREE.BoxGeometry(L, 0.06 * M, zF - zB + 0.3 * M), mats.board, L / 2, plat + Hc + 0.05 * M, (zF + zB) / 2, 0, g);
  // per bay: 倒挂楣子 lattice under the beam, 坐凳 bench with its lattice below
  var lat = mats.railGrid || mats.grid;
  for (var j = 0; j < nb; j++) {
    var cx = (j + 0.5) * bay, w = bay - 2 * r;
    var my = plat + Hc - 0.34 * M - 0.24 * M;
    var top = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.44 * M), lat);
    top.position.set(cx, my, zF);
    g.add(top);
    part(new THREE.BoxGeometry(w, 0.06 * M, 0.08 * M), mats.frame || mats.column, cx, my - 0.24 * M, zF, 0, g);
    part(new THREE.BoxGeometry(w, 0.08 * M, 0.42 * M), mats.frame || mats.column, cx, plat + 0.50 * M, zF - 0.1 * M, 0, g);
    var low = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.40 * M), lat);
    low.position.set(cx, plat + 0.25 * M, zF);
    g.add(low);
    if (j % 2 === 1 || nb === 1) {
      var v = new THREE.Vector3(cx, plat + Hc + 0.02 * M, d + 0.25 * M);
      g.updateMatrixWorld(true);
      v.applyMatrix4(g.matrixWorld);
      lamps.hang(v.x, v.y, v.z, 0.75);
    }
  }
  // 卷棚 roof: two concave slopes over a rounded crown, swept along the run
  var e = d / 2 + 0.85 * M, y0 = plat + Hc + 0.12 * M, rise = d * 0.36, tk = 0.16 * M;
  var sec = [];
  var N = 6;
  for (var k = 0; k <= N; k++) {               // court-side slope, eave up to crown
    var f = k / N, lat0 = -e + (e - 0.35 * M) * f;
    sec.push([lat0, y0 + tk + (rise - tk) * Math.pow(f, 1.6)]);
  }
  sec.push([0, y0 + rise + 0.10 * M]);
  for (var k2 = N; k2 >= 0; k2--) {
    var f2 = k2 / N, lat1 = e - (e - 0.35 * M) * f2;
    sec.push([lat1, y0 + tk + (rise - tk) * Math.pow(f2, 1.6)]);
  }
  sec.push([e, y0]);
  for (var k3 = N - 1; k3 >= 1; k3--) {        // the underside, a shallow arch
    var f3 = k3 / N, lat2 = -e + 2 * e * f3;
    sec.push([lat2, y0 + (rise * 0.55) * (1 - Math.pow(2 * f3 - 1, 2))]);
  }
  sec.push([-e, y0]);
  // the section's lateral axis is the path's horizontal normal; sweep along
  // the centre line so either sign is the same roof
  var p0 = new THREE.Vector3(-0.45 * M, 0, d / 2), p1 = new THREE.Vector3(L + 0.45 * M, 0, d / 2);
  var roof = new THREE.Mesh(sweepGeometry([p0, p1], sec), siteMats.capTile);
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  // 连檐 fascia along the eave, painted
  part(new THREE.BoxGeometry(L + 0.9 * M, 0.2 * M, 0.08 * M), mats.fascia, L / 2, y0 + 0.02 * M, d / 2 + e, 0, g);
  parent.add(g);
}
