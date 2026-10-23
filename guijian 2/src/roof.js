// ============================================================================
//  屋顶坡面 ROOF SECTION
//  The 坡面 curve editor drives this. The profile is a quadratic Bezier from
//  eave to ridge over the unit square; `cx`/`cy` are its control point, and the
//  three multipliers scale the dimensions constants.js derived.
//
//  The defaults reproduce the Qing 举架 coefficient ladder
//  [0.5, 0.62, 0.72, 0.82, 0.92] to within half a percent.
// ============================================================================
var ROOF_CURVE = { cx: 0.5118, cy: 0.3276, rise: 1, eave: 1, lift: 1 };

// The 举架 ladders are a narrow family. Every Qing one climbs from 五举 at the
// eave to roughly 九举 at the ridge, and the Song 举折 is gentler still, so the
// control points that reproduce a real section all sit in one small patch of
// the unit square. Outside it the shape stops being a roof.
var CURVE_LIMITS = {
  cxMin: 0.40, cxMax: 0.66,
  cyMin: 0.20, cyMax: 0.46,
  ratioMin: 0.45, ratioMax: 0.80
};

// Both the editor and the solver clamp through here, so the drawn curve and
// the built roof cannot disagree about what is reachable.
function clampRoofCurve(cx, cy) {
  var L = CURVE_LIMITS;
  cx = Math.min(L.cxMax, Math.max(L.cxMin, cx));
  var lo = Math.max(L.cyMin, cx * L.ratioMin);
  var hi = Math.max(lo, Math.min(L.cyMax, cx * L.ratioMax));
  return { cx: cx, cy: Math.min(hi, Math.max(lo, cy)) };
}

// Sampled profile, ordered ridge -> eave (x ascending 0 -> halfDepth). Kept for
// callers that want a polyline; the roof itself now uses roofProfileFn().
function solveRoofProfile(halfDepth, roofHeight, steps) {
  var h = roofProfileFn(roofHeight), n = Math.max(steps || 5, 24), pts = [];
  for (var i = 0; i <= n; i++) {
    var t = i / n;
    pts.push({ x: t * halfDepth, y: h(t) });
  }
  return pts;
}

function profileH(t, profile, halfDepth) {
  var tx = Math.min(1, Math.max(0, t)) * halfDepth;
  for (var i = 0; i < profile.length - 1; i++) {
    var a = profile[i], b = profile[i + 1];
    if (tx >= a.x && tx <= b.x) {
      var f = (tx - a.x) / (b.x - a.x || 1);
      return a.y + (b.y - a.y) * f;
    }
  }
  return profile[profile.length - 1].y;
}

// The exact section: solve the Bezier for the parameter at a given run and
// read its height. t = 0 at the ridge, 1 at the eave. Exact rather than
// interpolated so the slope has no facets for the light to catch -- a
// piecewise-linear 举架 shows every sample as a crease in raking sun.
function roofProfileFn(roofHeight) {
  var c = clampRoofCurve(ROOF_CURVE.cx, ROOF_CURVE.cy);
  var cx = c.cx, cy = c.cy, A = 1 - 2 * cx, B = 2 * cx;
  return function (t) {
    var X = 1 - Math.min(1, Math.max(0, t));
    var s;
    if (Math.abs(A) < 1e-6) s = X / B;
    else s = (-B + Math.sqrt(Math.max(0, B * B + 4 * A * X))) / (2 * A);
    s = Math.min(1, Math.max(0, s));
    return (2 * (1 - s) * s * cy + s * s) * roofHeight;
  };
}

// arc length measured up the slope from the eave, so tile courses start whole
// at the eave and the 滴水 line lands on a course boundary
function arcTable(h, run) {
  var N = 96, acc = new Float32Array(N + 1);
  acc[N] = 0;
  for (var i = N - 1; i >= 0; i--) {
    var t0 = i / N, t1 = (i + 1) / N;
    var dy = h(t0) - h(t1), dx = run / N;
    acc[i] = acc[i + 1] + Math.sqrt(dx * dx + dy * dy);
  }
  return function (t) {
    var f = Math.min(1, Math.max(0, t)) * N, i = Math.min(N - 1, Math.floor(f));
    return acc[i] + (acc[i + 1] - acc[i]) * (f - i);
  };
}

// ============================================================================
//  FACES — each slope is its own closed shell: tiled top, timber soffit under
//  it, and rims, so it exports as a solid and its tile texture can run the
//  right way. One continuous grid for the whole roof used to put the hip-end
//  tiles across the slope instead of down it.
//
//  F.world(t, a, out)  t 0 ridge/top -> 1 eave, a -1..1 across the face
//  F.lat(t, a)         the coordinate across the tile runs (crest every P)
//  F.arc(t)            distance up the slope from the eave
// ============================================================================
function buildFace(F, tileP, courseL, matTop, matUnder, soffitScale) {
  var segT = F.segT, segA = F.segA, nA = segA + 1, nT = segT + 1, N = nA * nT;
  var pos = [], nor = [], uv = [], idx = [];
  var P = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3();
  var dT = new THREE.Vector3(), dA = new THREE.Vector3(), nn = new THREE.Vector3();
  var t0 = F.t0, t1 = F.t1, thick = F.thick;
  var normals = [];

  function tAt(j) { return t0 + (t1 - t0) * j / segT; }
  for (var j = 0; j < nT; j++) {
    var t = tAt(j);
    for (var i = 0; i < nA; i++) {
      var a = -1 + 2 * i / segA;
      F.world(t, a, P);
      pos.push(P.x, P.y, P.z);
      // the normal of the surface itself, from the face's own mapping, so two
      // faces that meet along the 歇山 break agree exactly on the shading
      var et = (t1 - t0) * 0.3 / segT, ea = 0.6 / segA;
      F.world(Math.min(t1, t + et), a, P1); F.world(Math.max(t0, t - et), a, P2); dT.subVectors(P1, P2);
      F.world(t, Math.min(1, a + ea), P1); F.world(t, Math.max(-1, a - ea), P2); dA.subVectors(P1, P2);
      if (dA.lengthSq() < 1e-14) {
        var tt = Math.min(t1, t + (t1 - t0) / segT);
        F.world(tt, Math.min(1, a + ea), P1); F.world(tt, Math.max(-1, a - ea), P2); dA.subVectors(P1, P2);
      }
      nn.crossVectors(dA, dT);
      if (nn.y < 0) nn.negate();
      nn.normalize();
      normals.push(nn.x, nn.y, nn.z);
      nor.push(nn.x, nn.y, nn.z);
      uv.push(F.lat(t, a) / tileP + 0.5, F.arc(t) / courseL);
    }
  }
  // soffit: the same grid dropped by the shell thickness along the normal
  for (var k = 0; k < N; k++) {
    var nx = normals[k * 3], ny = normals[k * 3 + 1], nz = normals[k * 3 + 2];
    pos.push(pos[k * 3] - nx * thick, pos[k * 3 + 1] - ny * thick, pos[k * 3 + 2] - nz * thick);
    nor.push(-nx, -ny, -nz);
    uv.push(pos[k * 3] * soffitScale, pos[k * 3 + 2] * soffitScale);
  }

  // winding: decided from the first non-degenerate cell against its normal
  function V(q) { return new THREE.Vector3(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]); }
  var flip = false;
  for (var jj = 0; jj < segT; jj++) {
    var a0 = jj * nA + Math.floor(segA / 2), b0 = a0 + 1, c0 = a0 + nA;
    var cr = new THREE.Vector3().crossVectors(V(c0).sub(V(a0)), V(b0).sub(V(a0)));
    if (cr.lengthSq() > 1e-16) {
      flip = cr.dot(new THREE.Vector3(normals[a0 * 3], normals[a0 * 3 + 1], normals[a0 * 3 + 2])) < 0;
      break;
    }
  }
  var topCount = 0;
  for (var j2 = 0; j2 < segT; j2++) {
    for (var i2 = 0; i2 < segA; i2++) {
      var A = j2 * nA + i2, B = A + 1, Cq = A + nA, D = Cq + 1;
      if (!flip) idx.push(A, Cq, B, B, Cq, D); else idx.push(A, B, Cq, B, D, Cq);
    }
  }
  topCount = idx.length;
  for (var j3 = 0; j3 < segT; j3++) {
    for (var i3 = 0; i3 < segA; i3++) {
      var A2 = N + j3 * nA + i3, B2 = A2 + 1, C2 = A2 + nA, D2 = C2 + 1;
      if (!flip) idx.push(A2, B2, C2, B2, D2, C2); else idx.push(A2, C2, B2, B2, C2, D2);
    }
  }

  // rims, with their own vertices so the slope's normals stay clean
  var cen = new THREE.Vector3();
  F.world((t0 + t1) / 2, 0, cen);
  function rim(list) {
    for (var r = 0; r < list.length - 1; r++) {
      var ta = list[r], tb = list[r + 1];
      var q0 = V(ta), q1 = V(tb), q2 = V(tb + N), q3 = V(ta + N);
      var e1 = new THREE.Vector3().subVectors(q1, q0), e2 = new THREE.Vector3().subVectors(q3, q0);
      var fn = new THREE.Vector3().crossVectors(e1, e2);
      if (fn.lengthSq() < 1e-18) continue;
      fn.normalize();
      var mid = q0.clone().add(q2).multiplyScalar(0.5).sub(cen);
      var out = fn.dot(mid) >= 0;
      if (!out) fn.negate();
      var base = pos.length / 3;
      [q0, q1, q2, q3].forEach(function (q) { pos.push(q.x, q.y, q.z); nor.push(fn.x, fn.y, fn.z); uv.push(q.x * soffitScale + q.z * soffitScale, q.y * soffitScale); });
      if (out) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  var e;
  e = []; for (var i4 = 0; i4 < nA; i4++) e.push(i4); rim(e);                       // top edge
  e = []; for (var i5 = 0; i5 < nA; i5++) e.push(segT * nA + i5); rim(e);           // eave
  e = []; for (var j5 = 0; j5 < nT; j5++) e.push(j5 * nA); rim(e);                  // side a=-1
  e = []; for (var j6 = 0; j6 < nT; j6++) e.push(j6 * nA + segA); rim(e);           // side a=+1

  var geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.addGroup(0, topCount, 0);
  geo.addGroup(topCount, idx.length - topCount, 1);
  geo.computeBoundingSphere();
  var m = new THREE.Mesh(geo, [matTop, matUnder]);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.keep = true;
  return m;
}

// ============================================================================
//  RIDGES — swept along the true surface line, so a hip ridge follows the
//  concave 举架 curve instead of spanning it as a straight beam with daylight
//  under its middle.
// ============================================================================
// main-ridge section: 当沟 footing, 正通脊 body, a rounded 扣脊筒瓦 cap
function ridgeSection(w, h) {
  var a = w / 2, s = [];
  s.push([a, 0], [a, 0.16 * h], [a * 0.80, 0.20 * h], [a * 0.80, 0.70 * h],
         [a * 0.94, 0.74 * h], [a * 0.94, 0.82 * h], [a * 0.62, 0.84 * h]);
  for (var k = 1; k < 6; k++) {
    var ang = k / 6 * Math.PI;
    s.push([a * 0.62 * Math.cos(ang), 0.84 * h + 0.16 * h * Math.sin(ang)]);
  }
  s.push([-a * 0.62, 0.84 * h], [-a * 0.94, 0.82 * h], [-a * 0.94, 0.74 * h], [-a * 0.80, 0.70 * h],
         [-a * 0.80, 0.20 * h], [-a, 0.16 * h], [-a, 0]);
  // footing sits a little into the tiles so no hairline of sky shows under it
  return s.map(function (p) { return [p[0], p[1] - 0.06 * h]; });
}
function hipSection(w, h) {
  var a = w / 2, s = [[a, 0], [a, 0.55 * h], [a * 0.6, 0.62 * h]];
  for (var k = 1; k < 5; k++) {
    var ang = k / 5 * Math.PI;
    s.push([a * 0.6 * Math.cos(ang), 0.62 * h + 0.38 * h * Math.sin(ang)]);
  }
  s.push([-a * 0.6, 0.62 * h], [-a, 0.55 * h], [-a, 0]);
  return s.map(function (p) { return [p[0], p[1] - 0.08 * h]; });
}

function sampleLine(fn, n) {
  var pts = [];
  for (var i = 0; i <= n; i++) pts.push(fn(i / n, new THREE.Vector3()));
  return pts;
}

function ridgeMesh(path, section, mat) {
  var m = new THREE.Mesh(sweepGeometry(path, section), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// --------------------------------------------------------------- 正吻 dragon
// An extruded silhouette with a rolled tail and the 剑把 hilt standing out of
// its back: at roof distance it is the outline that reads, and the outline is
// what this gets right.
var _wenGeoCache = {};
function chiwenGeos(Hc) {
  var key = Hc.toFixed(5);
  if (_wenGeoCache[key]) return _wenGeoCache[key];
  var W = Hc * 0.82, D = Hc * 0.26;
  var P = [[0.06, 0], [1.0, 0], [1.0, 0.12], [0.82, 0.20], [1.0, 0.33], [1.03, 0.44], [0.84, 0.47],
           [0.72, 0.56], [0.70, 0.70], [0.79, 0.84], [0.70, 0.97], [0.50, 1.0], [0.30, 0.94],
           [0.18, 0.80], [0.25, 0.66], [0.12, 0.57], [0.21, 0.47], [0.06, 0.39], [0.15, 0.29], [0.04, 0.18]];
  var sh = new THREE.Shape();
  P.forEach(function (p, i) { if (i) sh.lineTo(p[0] * W, p[1] * Hc); else sh.moveTo(p[0] * W, p[1] * Hc); });
  sh.closePath();
  var body = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: true, bevelThickness: D * 0.18,
    bevelSize: Hc * 0.025, bevelSegments: 2, curveSegments: 4 });
  body.translate(0, 0, -D / 2);
  var curl = new THREE.TorusGeometry(Hc * 0.13, Hc * 0.045, 6, 16, Math.PI * 1.6);
  curl.rotateZ(-0.6);
  curl.translate(W * 0.47, Hc * 0.79, 0);
  var hilt = new THREE.BoxGeometry(Hc * 0.06, Hc * 0.30, Hc * 0.06);
  hilt.rotateZ(0.25);
  hilt.translate(W * 0.60, Hc * 1.02, 0);
  var back = new THREE.SphereGeometry(Hc * 0.07, 10, 8);
  back.translate(W * 0.30, Hc * 0.60, D * 0.62);
  return (_wenGeoCache[key] = { body: body, curl: curl, hilt: hilt, back: back, W: W });
}

function chiwen(Hc, mat, x, y, z, faceInward) {
  var g = chiwenGeos(Hc), grp = new THREE.Group();
  [g.body, g.curl, g.hilt, g.back].forEach(function (geo) {
    var m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m);
  });
  // local +X runs outer -> inner; turn so it points toward the ridge centre.
  // Rotations only, never a mirror -- a mirror inverts the normals.
  grp.position.set(x, y, z);
  grp.rotation.y = faceInward > 0 ? 0 : Math.PI;
  return grp;
}

// ============================================================================
//  脊兽 — THE RIDGE BEASTS
//  The file of small figures on each 垂脊/戗脊 is a rank statement, not an
//  ornament. 仙人骑凤 always leads, and behind him come 走兽 in odd numbers,
//  nine at the top of the scale. Only 太和殿 was ever granted ten -- so nine is
//  the ceiling here. The count is read off the 斗口 grade.
// ============================================================================
function beastCount(grade) {
  if (grade <= 1) return 9;
  if (grade <= 3) return 7;
  if (grade <= 5) return 5;
  if (grade <= 7) return 3;
  return 1;
}

// --------------------------------------------------------------- 走兽
// Two extruded side silhouettes, built once per size: a seated beast, and the
// 仙人骑凤 who always leads the file.
var _beastCache = {};
function beastGeos(h) {
  var key = h.toFixed(5);
  if (_beastCache[key]) return _beastCache[key];
  function ext(P, w, d) {
    var s = new THREE.Shape();
    P.forEach(function (p, i) { if (i) s.lineTo(p[0] * w, p[1] * h); else s.moveTo(p[0] * w, p[1] * h); });
    s.closePath();
    var g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: d * 0.12,
      bevelSize: h * 0.03, bevelSegments: 1, curveSegments: 3 });
    g.translate(-w * 0.5, 0, -d / 2);
    return g;
  }
  var beast = ext([[0.05, 0], [0.95, 0], [0.95, 0.08], [0.80, 0.10], [0.82, 0.40], [0.95, 0.55], [1.0, 0.66],
                   [0.92, 0.76], [0.80, 0.80], [0.74, 0.93], [0.66, 0.80], [0.58, 0.66], [0.40, 0.56],
                   [0.22, 0.52], [0.10, 0.64], [0.02, 0.58], [0.10, 0.40], [0.14, 0.22], [0.05, 0.10]], h * 0.9, h * 0.36);
  var bird = ext([[0.05, 0], [0.90, 0], [0.90, 0.10], [1.0, 0.30], [0.96, 0.50], [1.06, 0.62], [0.92, 0.66],
                  [0.84, 0.56], [0.70, 0.42], [0.40, 0.40], [0.10, 0.66], [0.0, 0.60], [0.08, 0.30], [0.05, 0.10]], h * 1.1, h * 0.30);
  var rider = new THREE.CylinderGeometry(h * 0.10, h * 0.14, h * 0.42, 8);
  rider.translate(h * 0.02, h * 0.62, 0);
  var head = new THREE.SphereGeometry(h * 0.10, 8, 6);
  head.translate(h * 0.02, h * 0.92, 0);
  var plinth = new THREE.BoxGeometry(h * 0.9, h * 0.12, h * 0.42);
  plinth.translate(0, -h * 0.03, 0);
  return (_beastCache[key] = { beast: beast, bird: bird, rider: rider, head: head, plinth: plinth });
}

// place the file of beasts along a ridge path, eave end first
function beastFile(path, ridgeTop, count, h, mat, group, guardian) {
  if (count <= 0 && !guardian) return;
  var G = beastGeos(h);
  // arc lengths from the eave end (the last point of path)
  var rev = path.slice().reverse(), acc = [0];
  for (var i = 1; i < rev.length; i++) acc.push(acc[i - 1] + rev[i].distanceTo(rev[i - 1]));
  var total = acc[acc.length - 1];
  function at(s) {
    s = Math.min(total, Math.max(0, s));
    for (var k = 1; k < acc.length; k++) {
      if (acc[k] >= s) {
        var f = (s - acc[k - 1]) / (acc[k] - acc[k - 1] || 1);
        return rev[k - 1].clone().lerp(rev[k], f);
      }
    }
    return rev[rev.length - 1].clone();
  }
  var step = Math.min(h * 1.25, total * 0.42 / Math.max(1, count + 1));
  var start = h * 0.75;
  var outward = new THREE.Vector3().subVectors(rev[0], rev[Math.min(rev.length - 1, 4)]).setY(0).normalize();
  var ang = Math.atan2(outward.z, outward.x);
  for (var n = 0; count > 0 && n <= count; n++) {
    var p = at(start + n * step);
    var b = new THREE.Group();
    var pieces = n === 0 ? [G.bird, G.rider, G.head, G.plinth] : [G.beast, G.plinth];
    pieces.forEach(function (geo) { var m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; b.add(m); });
    b.position.set(p.x, p.y + ridgeTop, p.z);
    b.rotation.y = -ang;          // local +X (the snout) out along the ridge
    group.add(b);
  }
  if (guardian) {
    // 垂兽 / 戗兽: the big head that closes the file
    var gp = at(count > 0 ? start + (count + 1.3) * step : h * 0.6);
    var gg = new THREE.Group();
    var big = beastGeos(h * 1.7);
    [big.beast, big.plinth].forEach(function (geo) { var m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; gg.add(m); });
    gg.position.set(gp.x, gp.y + ridgeTop * 0.6, gp.z);
    gg.rotation.y = -ang;
    group.add(gg);
  }
}

// ============================================================================
//  EAVE — 连檐, 瓦当 + 滴水, 飞椽 + 檐椽, 角梁 + 套兽
// ============================================================================
var _eaveGeo = null;
function eaveGeos() {
  if (_eaveGeo) return _eaveGeo;
  // unit-sized, scaled per instance
  var wadang = new THREE.CylinderGeometry(1, 1, 1, 10);       // axis Y
  var dishape = new THREE.Shape();
  dishape.moveTo(-0.5, 0); dishape.lineTo(0.5, 0);
  dishape.quadraticCurveTo(0.48, -0.42, 0.0, -0.78);
  dishape.quadraticCurveTo(-0.48, -0.42, -0.5, 0);
  var dishui = new THREE.ExtrudeGeometry(dishape, { depth: 1, bevelEnabled: false, curveSegments: 5 });
  dishui.translate(0, 0, -0.5);
  var rafter = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); // axis Y, unit length; ends are capped by the painted disc
  var fly = new THREE.BoxGeometry(1, 1, 1);
  var disc = new THREE.CylinderGeometry(1, 1, 1, 8);
  return (_eaveGeo = { wadang: wadang, dishui: dishui, rafter: rafter, fly: fly, disc: disc });
}

// Instance helper: position, direction (local +Y aligns to dir), up hint, scale
var _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function setAlong(im, i, pos, dir, sx, sy, sz, spin) {
  _q.setFromUnitVectors(_Y, dir.clone().normalize());
  if (spin) { var qs = new THREE.Quaternion().setFromAxisAngle(_Y, spin); _q.multiply(qs); }
  _s.set(sx, sy, sz);
  _m4.compose(pos, _q, _s);
  im.setMatrixAt(i, _m4);
}
// basis helper: local X -> lat, Y -> up, Z -> out
function setBasis(im, i, pos, lat, up, out, sx, sy, sz) {
  _m4.makeBasis(lat, up, out);
  _m4.scale(_s.set(sx, sy, sz));
  _m4.setPosition(pos);
  im.setMatrixAt(i, _m4);
}

function instanced(geo, mat, n) {
  var im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  im.count = n;
  im.castShadow = true; im.receiveShadow = true;
  return im;
}

// edges: [{ world(s, out) s in 0..1 along the eave, lat0, lat1 (lateral coord at
//           s=0/1), out: Vector3 outward horizontal, slope(s, out) down-slope dir,
//           trimStart, trimEnd (lateral margins to skip at corners) }]
function buildEaveTiles(edges, P, mats, group) {
  var G = eaveGeos();
  var r = P.tileP * 0.205, gap = P.tileP;
  var list = [], list2 = [];
  edges.forEach(function (E) {
    var L0 = E.lat0, L1 = E.lat1, span = L1 - L0;
    var kmin = Math.ceil((Math.min(L0, L1) + E.trim0) / gap), kmax = Math.floor((Math.max(L0, L1) - E.trim1) / gap);
    for (var k = kmin; k <= kmax; k++) {
      [0, 0.5].forEach(function (off, which) {
        var lat = (k + off) * gap;
        if (lat < Math.min(L0, L1) + E.trim0 || lat > Math.max(L0, L1) - E.trim1) return;
        var s = (lat - L0) / span;
        var p = E.world(s, new THREE.Vector3());
        var d = E.slope(s, new THREE.Vector3());
        (which ? list2 : list).push({ p: p, d: d, out: E.out });
      });
    }
  });
  var wd = instanced(G.wadang, mats.ridge, list.length);
  var ds = instanced(G.dishui, mats.ridge, list2.length);
  var up = new THREE.Vector3(), lat = new THREE.Vector3(), pos = new THREE.Vector3();
  list.forEach(function (it, i) {
    // the disc faces down the slope, its centre the height of the barrel crown
    pos.copy(it.p).addScaledVector(it.d, r * 0.15);
    pos.y += r * 0.72;
    setAlong(wd, i, pos, it.d, r, r * 0.32, r);
  });
  list2.forEach(function (it, i) {
    lat.crossVectors(_Y, it.out).normalize();
    var outD = it.d.clone(); outD.y *= 0.5; outD.normalize();
    up.crossVectors(outD, lat).normalize();
    if (up.y < 0) { up.negate(); lat.negate(); }
    pos.copy(it.p).addScaledVector(it.d, r * 0.10);
    pos.y += r * 0.30;
    setBasis(ds, i, pos, lat, up, outD, P.tileP * 0.56, P.tileP * 0.55, r * 0.22);
  });
  wd.instanceMatrix.needsUpdate = true; ds.instanceMatrix.needsUpdate = true;
  group.add(wd); group.add(ds);
}

// rafters under one eave run. `inner(s, out)` is where a rafter at s would
// land on the 挑檐桁 if it ran straight in; near the corners the run fans to
// the corner beam -- 翼角椽 -- which is the single detail that makes a Chinese
// corner look like one.
function buildRafters(runs, P, mats, group) {
  var G = eaveGeos();
  var items = [];
  runs.forEach(function (R) {
    var len = R.length, n = Math.max(2, Math.round(len / P.rafter.spacing));
    for (var i = 0; i <= n; i++) {
      var s = i / n;
      if (s < R.skip0 || s > 1 - R.skip1) continue;
      var O = R.outer(s, new THREE.Vector3());
      var I = R.inner(s, new THREE.Vector3());
      items.push({ O: O, I: I });
    }
  });
  var rr = P.rafter.r, fs = P.rafter.fly, flyLen = P.rafter.flyLen;
  var eaves = instanced(G.rafter, mats.rafter, items.length);
  var flys = instanced(G.fly, mats.rafter, items.length);
  var flyEnd = instanced(G.fly, mats.flyEnd, items.length);
  var eaveEnd = instanced(G.disc, mats.rafterEnd, items.length);
  var dir = new THREE.Vector3(), mid = new THREE.Vector3(), E = new THREE.Vector3(), lat = new THREE.Vector3(), up = new THREE.Vector3();
  items.forEach(function (it, i) {
    dir.subVectors(it.O, it.I);
    var L = dir.length(); dir.normalize();
    // 飞椽: the outer stretch, square, tight under the boards
    var fL = Math.min(flyLen * 1.3, L * 0.6);
    E.copy(it.O).addScaledVector(dir, -fL);
    lat.crossVectors(_Y, dir).normalize();
    up.crossVectors(dir, lat).normalize();
    mid.addVectors(it.O, E).multiplyScalar(0.5);
    mid.addScaledVector(up, -fs * 0.5);
    setBasis(flys, i, mid, lat, up, dir, fs, fs, fL);
    // painted end of the 飞椽: green, a hair proud of the timber
    var ep = it.O.clone().addScaledVector(up, -fs * 0.5).addScaledVector(dir, 0.002);
    setBasis(flyEnd, i, ep, lat, up, dir, fs * 1.02, fs * 1.02, fs * 0.08);
    // 檐椽: round, below the 飞椽, from the 桁 out to under the 飞椽's tail-end
    var eO = it.O.clone().addScaledVector(dir, -flyLen).addScaledVector(up, -fs - rr * 0.9);
    var eI = it.I.clone().addScaledVector(up, -fs - rr * 0.9);
    var ed = new THREE.Vector3().subVectors(eO, eI), eL = ed.length();
    mid.addVectors(eO, eI).multiplyScalar(0.5);
    setAlong(eaves, i, mid, ed, rr, eL, rr);
    var cp = eO.clone().addScaledVector(ed.normalize(), 0.002);
    setAlong(eaveEnd, i, cp, ed, rr * 1.02, fs * 0.08, rr * 1.02);
  });
  [eaves, flys, flyEnd, eaveEnd].forEach(function (im) { im.instanceMatrix.needsUpdate = true; group.add(im); });
}

// ============================================================================
//  THE HALL ROOF
// ============================================================================
function buildRoof(P) {
  var group = new THREE.Group();
  var HW = P.halfWidth, HD = P.halfDepth, hw = P.hw, hd = P.hd;
  var h = roofProfileFn(P.roofHeight);
  var up = P.upturn, chong = P.chong || 0, thick = P.shellThick;
  var tileP = P.tileP, courseL = P.courseL;
  var mats = P.mats;
  var soffitScale = 1;     // soffit UVs in world units; dress() sets the repeat

  function lift(x, z) {
    var xf = Math.min(1, Math.abs(x) / HW), zf = Math.min(1, Math.abs(z) / HD);
    return up * Math.pow(xf, 2.8) * Math.pow(zf, 2.8);
  }
  // 冲出: the corner also runs out in plan, so the eave line curves outward
  // toward each corner as well as up
  function warpInto(x, y, z, out) {
    var xf = Math.min(1, Math.abs(x) / HW), zf = Math.min(1, Math.abs(z) / HD);
    var wx = x + Math.sign(x) * chong * Math.pow(xf, 4) * Math.pow(zf, 3);
    var wz = z + Math.sign(z) * chong * Math.pow(zf, 4) * Math.pow(xf, 3);
    return out.set(wx, y, wz);
  }

  var R = {};
  var isWudian = P.roofType === 'wudian';
  var rhl, tBreak, gableHW, upHW;
  if (isWudian) {
    // 推山 (tuishan): each step above the eave step is reduced by 1/10 of its
    // own run, recursively -- this lengthens 正脊 beyond the naive 45-degree hip.
    var naiveRidge = Math.max(0.35, HW - HD);
    rhl = naiveRidge;
    if (P.tuishan) {
      var steps = 4, run = HD / steps, gained = 0, cur = run;
      for (var ts = 1; ts < steps; ts++) { cur = cur * 0.9; gained += (run - cur); }
      rhl = Math.min(HW * 0.92, naiveRidge + gained);
    }
    R.height = function (x, z) {
      var dz = Math.abs(z) / HD;
      var dx = Math.max(0, Math.abs(x) - rhl) / Math.max(HW - rhl, 1e-6);
      return h(Math.min(1, Math.max(dz, dx))) + lift(x, z);
    };
  } else {
    // 歇山: the gable plane is set back one 檩径 (收山) from the side purlin;
    // the front and back slopes run unbroken from ridge to eave, and overhang
    // the gable as 出山; below the break the sides become a hipped skirt.
    // Song 收山 is far deeper than Qing's single 檩径: the gable stands well in
    // from the end wall, and the skirt below it is correspondingly broad
    gableHW = Math.max(HW * 0.22, hw - (P.isSong ? Math.max(P.purlinDia, hd * 0.42) : P.purlinDia));
    upHW = Math.min(HW * 0.96, gableHW + P.purlinDia * 1.5);
    tBreak = Math.min(0.72, Math.max(0.30, 1 - (HW - gableHW) / HD));
    var span = HW - gableHW;
    // the skirt's own surface: a hip roof, so the lower of the two slopes. It
    // carries on under the 出山 overhang up to the foot of the gable.
    R.skirtHeight = function (x, z) {
      var ax = Math.abs(x), tf = Math.abs(z) / HD;
      var tsk = tBreak + Math.max(0, ax - gableHW) / span * (1 - tBreak);
      return h(Math.min(1, Math.max(tf, tsk))) + lift(x, z);
    };
    // the envelope: what you see from above -- the front slopes run on over
    // the gable as the 出山, everything else is the skirt
    R.height = function (x, z) {
      var ax = Math.abs(x), tf = Math.abs(z) / HD;
      if (ax <= gableHW || (tf <= tBreak && ax <= upHW)) return h(Math.min(1, tf)) + lift(x, z);
      return R.skirtHeight(x, z);
    };
  }
  R.point = function (x, z, out) { return warpInto(x, R.height(x, z), z, out); };
  var _pp = { x: 0, z: 0 };

  var arcFront = arcTable(h, HD);
  var segT = 34;

  function face(plan, t0, t1, segA, arc, latFn, hfn) {
    var H = hfn || R.height;
    return buildFace({
      t0: t0, t1: t1, segT: Math.max(6, Math.round(segT * (t1 - t0))), segA: segA, thick: thick,
      world: function (t, a, out) { plan(t, a, _pp); return warpInto(_pp.x, H(_pp.x, _pp.z), _pp.z, out); },
      lat: function (t, a) { plan(t, a, _pp); return latFn(_pp); },
      arc: arc
    }, tileP, courseL, mats.tile, mats.soffit, soffitScale);
  }
  var latX = function (p) { return p.x; }, latZ = function (p) { return p.z; };

  if (isWudian) {
    var arcHip = arcTable(h, HW - rhl);
    [1, -1].forEach(function (sg) {
      group.add(face(function (t, a, o) { o.x = a * (rhl + t * (HW - rhl)); o.z = sg * t * HD; }, 0, 1, 64, arcFront, latX));
      group.add(face(function (t, a, o) { o.x = sg * (rhl + t * (HW - rhl)); o.z = a * t * HD; }, 0, 1, 40, arcHip, latZ));
    });
  } else {
    var skirtRun = (HW - gableHW) / (1 - tBreak);
    var arcSkirt = arcTable(h, skirtRun);
    [1, -1].forEach(function (sg) {
      // upper front: ridge to the break, full 出山 width. Its columns across
      // the middle are exactly the lower face's, so the two meet vertex for
      // vertex along the break -- a T-junction there opens hairline cracks
      // that show the red soffit through the tiles.
      var KO = 8, KM = 64, NA = KM + 2 * KO;
      group.add(face(function (t, a, o) {
        var idx = (a + 1) / 2 * NA;
        if (idx <= KO) o.x = -upHW + idx * (upHW - gableHW) / KO;
        else if (idx >= KO + KM) o.x = gableHW + (idx - KO - KM) * (upHW - gableHW) / KO;
        else o.x = -gableHW + (idx - KO) * (2 * gableHW / KM);
        o.z = sg * t * HD;
      }, 0, tBreak, NA, arcFront, latX));
      // lower front: break to eave, widening along the hip line
      group.add(face(function (t, a, o) {
        o.x = a * (gableHW + (t - tBreak) / (1 - tBreak) * (HW - gableHW)); o.z = sg * t * HD;
      }, tBreak, 1, 64, arcFront, latX));
      // 撒头 skirt: from the foot of the gable down to the side eave
      group.add(face(function (t, a, o) {
        o.x = sg * (gableHW + (t - tBreak) / (1 - tBreak) * (HW - gableHW)); o.z = a * t * HD;
      }, tBreak, 1, 40, arcSkirt, latZ, R.skirtHeight));
    });
  }

  // ------------------------------------------------------------ ridges
  var Hr = P.ridgeH, Hh = Hr * 0.62;
  var ridgeTopY = R.height(0, 0);
  var mainHalf = isWudian ? rhl : upHW;
  var mainPath = sampleLine(function (s, o) { return o.set(-mainHalf + 2 * mainHalf * s, ridgeTopY, 0); }, 8);
  group.add(ridgeMesh(mainPath, ridgeSection(Hr * 0.52, Hr), mats.ridge));
  // 正吻 at each end, mouth on the ridge
  var Hc = Hr * 2.3;
  [1, -1].forEach(function (sg) {
    if (P.wen !== false) {
      // the mouth (inner edge of the silhouette) bites the end of the ridge
      var W = chiwenGeos(Hc).W;
      group.add(chiwen(Hc, mats.ridge, sg * (mainHalf + W * 0.82), ridgeTopY - Hr * 0.04, 0, -sg));
    } else {
      // 小式 carries no 吻兽: its 清水脊 ends in a 蝎子尾 flicking up and out
      var tail = new THREE.Mesh(new THREE.BoxGeometry(Hr * 1.3, Hr * 0.22, Hr * 0.3), mats.ridge);
      tail.position.set(sg * (mainHalf + Hr * 0.42), ridgeTopY + Hr * 0.95, 0);
      tail.rotation.z = sg * 0.62;
      tail.castShadow = true;
      group.add(tail);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(Hr * 0.5, Hr * 0.9, Hr * 0.5), mats.ridge);
      foot.position.set(sg * (mainHalf + Hr * 0.05), ridgeTopY + Hr * 0.35, 0);
      foot.castShadow = true;
      group.add(foot);
    }
  });

  var hipPaths = [];
  if (isWudian) {
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
      hipPaths.push(sampleLine(function (u, o) {
        var x = s[0] * (rhl + u * (HW - rhl)), z = s[1] * u * HD;
        return R.point(x, z, o);
      }, 28));
    });
  } else {
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
      // 戗脊 along the skirt's hip line, from where it leaves the 出山 overhang
      var x0 = upHW, x1 = HW;
      hipPaths.push(sampleLine(function (u, o) {
        var ax = x0 + u * (x1 - x0);
        var tz = tBreak + (ax - gableHW) / (HW - gableHW) * (1 - tBreak);
        return R.point(s[0] * ax, s[1] * tz * HD, o);
      }, 22));
      // 垂脊 down the gable edge, ridge to the break
      var gx = s[0] * (upHW - Hh * 0.18);
      var path = sampleLine(function (u, o) {
        var z = s[1] * u * tBreak * HD;
        return R.point(gx, z, o);
      }, 16);
      group.add(ridgeMesh(path, hipSection(Hh * 0.5, Hh), mats.ridge));
      // the 垂兽 that ends it (大式 only)
      var end = path[path.length - 1];
      if (P.wen !== false) beastFile([path[0], end], Hh * 0.88, 0, Hh * 0.7, mats.ridge, group, true);
    });
    // 博脊 along the foot of each gable
    [1, -1].forEach(function (sg) {
      var bz = tBreak * HD * 0.98;
      var bp = sampleLine(function (u, o) { return R.point(sg * gableHW, -bz + 2 * bz * u, o); }, 6);
      bp.forEach(function (p) { p.x -= sg * Hh * 0.05; });
      group.add(ridgeMesh(bp, hipSection(Hh * 0.36, Hh * 0.55), mats.ridge));
    });
  }
  hipPaths.forEach(function (path) {
    group.add(ridgeMesh(path, hipSection(Hh * 0.5, Hh), mats.ridge));
    beastFile(path, Hh * 0.88, P.beasts, Hh * 0.62, mats.ridge, group, P.beasts > 0);
  });

  // ------------------------------------------------- 山花 + 博缝 (歇山 only)
  if (!isWudian) {
    var zb = tBreak * HD, breakY = h(tBreak);
    [1, -1].forEach(function (sg) {
      // 山花板: the gable, its top following the underside of the roof
      var sh = new THREE.Shape(), N = 24;
      sh.moveTo(-zb, breakY - thick * 0.5);
      for (var i = 0; i <= N; i++) {
        var z = -zb + 2 * zb * i / N;
        sh.lineTo(z, h(Math.abs(z) / HD) - thick * 1.1);
      }
      sh.lineTo(zb, breakY - thick * 0.5);
      sh.closePath();
      var gT = Math.max(0.02, P.purlinDia * 0.25);
      var gg = new THREE.ExtrudeGeometry(sh, { depth: gT, bevelEnabled: false });
      gg.translate(0, 0, -gT / 2);
      var gm = new THREE.Mesh(gg, mats.gable);
      gm.rotation.y = sg * Math.PI / 2;
      gm.position.set(sg * gableHW, 0, 0);
      gm.castShadow = true; gm.receiveShadow = true;
      group.add(gm);
      // 绶带: the gilt ribbon-and-ring hung under the apex of every imperial gable
      var ringY = h(0) - thick - (h(0) - breakY) * 0.32;
      var ring = new THREE.Mesh(new THREE.TorusGeometry((h(0) - breakY) * 0.09, (h(0) - breakY) * 0.018, 6, 20), mats.gold);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(sg * (gableHW + gT * 0.7), ringY, 0);
      group.add(ring);
      // the ribbons: a pair hanging from the ring, splayed a little
      var ribL = (h(0) - breakY) * 0.30;
      [-1, 1].forEach(function (sd) {
        var rb = new THREE.Mesh(new THREE.BoxGeometry(gT * 0.4, ribL, (h(0) - breakY) * 0.035), mats.gold);
        rb.position.set(sg * (gableHW + gT * 0.7), ringY - (h(0) - breakY) * 0.09 - ribL / 2, sd * (h(0) - breakY) * 0.07);
        rb.rotation.x = sd * 0.22;
        group.add(rb);
      });
      // 博缝板: the bargeboard on the 出山 edge, gilt 梅花钉 studs along it
      var bh = P.purlinDia * 2.0, bt = P.purlinDia * 0.35;
      var bpath = sampleLine(function (u, o) {
        var z = -zb * 1.0 + 2 * zb * u;
        return R.point(sg * (upHW - bt * 0.4), z, o).add(new THREE.Vector3(0, -thick * 0.6, 0));
      }, 28);
      group.add(ridgeMesh(bpath, [[-bt / 2, -bh], [bt / 2, -bh], [bt / 2, 0], [-bt / 2, 0]], mats.fascia));
      var stud = new THREE.SphereGeometry(bt * 0.45, 8, 6);
      for (var si = 2; si < bpath.length - 2; si += 3) {
        var sp = bpath[si];
        [-0.35, 0.35].forEach(function (dy) {
          var st = new THREE.Mesh(stud, mats.gold);
          st.position.set(sp.x + sg * bt * 0.5, sp.y - bh * (0.5 + dy), sp.z);
          group.add(st);
        });
      }
    });
  }

  // ------------------------------------------------------------- eaves
  // the four eave runs, counter-clockwise from above, with their outward
  // normals and tangent frames
  var sides = [
    { out: new THREE.Vector3(0, 0, 1),  plan: function (s) { return { x: -HW + 2 * HW * s, z: HD }; },  lat0: -HW, lat1: HW, isFront: true },
    { out: new THREE.Vector3(1, 0, 0),  plan: function (s) { return { x: HW, z: HD - 2 * HD * s }; },   lat0: HD, lat1: -HD, isFront: false },
    { out: new THREE.Vector3(0, 0, -1), plan: function (s) { return { x: HW - 2 * HW * s, z: -HD }; },  lat0: HW, lat1: -HW, isFront: true },
    { out: new THREE.Vector3(-1, 0, 0), plan: function (s) { return { x: -HW, z: -HD + 2 * HD * s }; }, lat0: -HD, lat1: HD, isFront: false }
  ];
  var edges = sides.map(function (S) {
    return {
      out: S.out, lat0: S.lat0, lat1: S.lat1,
      trim0: S.isFront ? tileP * 0.2 : tileP * 0.9, trim1: S.isFront ? tileP * 0.2 : tileP * 0.9,
      world: function (s, o) { var p = S.plan(s); return R.point(p.x, p.z, o); },
      slope: function (s, o) {
        var p = S.plan(s), e = 0.02;
        var a = R.point(p.x - S.out.x * e, p.z - S.out.z * e, new THREE.Vector3());
        var b = R.point(p.x, p.z, new THREE.Vector3());
        return o.subVectors(b, a).normalize();
      }
    };
  });
  buildEaveTiles(edges, P, mats, group);

  // 连檐 + 瓦口: the fascia board under the tile edge, all the way round
  var fh = P.purlinDia * 0.9, fd = P.purlinDia * 0.5;
  sides.forEach(function (S) {
    var path = sampleLine(function (s, o) { var p = S.plan(s); R.point(p.x, p.z, o); o.y -= thick * 0.85; return o; }, 40);
    group.add(ridgeMesh(path, [[0, -fh], [fd, -fh], [fd, 0], [0, 0]], mats.fascia));
  });

  // rafters: inner ends on the 挑檐桁 line, fanning to the corner beam
  var tiaoX = hw + P.dgOut, tiaoZ = hd + P.dgOut;
  var cornerIn = new THREE.Vector3(tiaoX * 0.97, 0, tiaoZ * 0.97);
  function rafterRun(S) {
    var front = S.isFront;
    var halfLen = front ? HW : HD, innerHalf = front ? tiaoX : tiaoZ;
    return {
      length: 2 * halfLen, skip0: 0.004, skip1: 0.004,
      outer: function (s, o) {
        var p = S.plan(s);
        R.point(p.x, p.z, o);
        o.y -= thick;
        return o;
      },
      inner: function (s, o) {
        var p = S.plan(s);
        var lat = front ? p.x : p.z;
        var w = Math.min(1, Math.max(0, (Math.abs(lat) - innerHalf * 0.86) / (halfLen - innerHalf * 0.86)));
        w = w * w * (3 - 2 * w);
        var ix, iz;
        if (front) {
          ix = p.x * (1 - w) + Math.sign(p.x) * cornerIn.x * w;
          iz = Math.sign(p.z) * tiaoZ * (1 - w) + Math.sign(p.z) * cornerIn.z * w;
        } else {
          iz = p.z * (1 - w) + Math.sign(p.z) * cornerIn.z * w;
          ix = Math.sign(p.x) * tiaoX * (1 - w) + Math.sign(p.x) * cornerIn.x * w;
        }
        R.point(ix, iz, o);
        o.y -= thick;
        return o;
      }
    };
  }
  buildRafters(sides.map(rafterRun), P, mats, group);

  // 角梁 at each corner, with the glazed 套兽 capping its nose
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
    var O = R.point(s[0] * HW, s[1] * HD, new THREE.Vector3());
    var I = R.point(s[0] * cornerIn.x, s[1] * cornerIn.z, new THREE.Vector3());
    O.y -= thick; I.y -= thick;
    var d = new THREE.Vector3().subVectors(O, I), L = d.length();
    d.normalize();
    var lat = new THREE.Vector3().crossVectors(_Y, d).normalize();
    var upv = new THREE.Vector3().crossVectors(d, lat).normalize();
    var bw = P.rafter.r * 3.2, bh = P.rafter.r * 4.2;
    var beam = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, L * 1.04), mats.rafter);
    var mid = O.clone().add(I).multiplyScalar(0.5).addScaledVector(upv, -bh * 0.5);
    beam.position.copy(mid);
    beam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lat, upv, d));
    beam.castShadow = true; beam.receiveShadow = true;
    group.add(beam);
    // 套兽: a glazed beast head capping the beam's nose, looking out
    var tg = beastGeos(bh * 1.5);
    var tao = new THREE.Group();
    [tg.beast].forEach(function (geo) { var m = new THREE.Mesh(geo, mats.ridge); m.castShadow = true; m.receiveShadow = true; tao.add(m); });
    tao.position.copy(O).addScaledVector(d, bw * 0.2).addScaledVector(upv, -bh * 1.25);
    tao.rotation.y = -Math.atan2(d.z, d.x);
    group.add(tao);
  });

  group.userData.R = R;
  group.userData.h = h;
  return group;
}

// ============================================================================
//  POLYGONAL 攒尖 ROOF — one per pagoda storey. Same machinery: a closed shell
//  per side with tiles running down that side, swept corner ridges, a row of
//  瓦当/滴水 and 飞椽 round the eave.
// ============================================================================
function buildPolygonRoof(o) {
  // o: { R (circumradius at the eave), n, rise, upturn, chong, thick, tileP, courseL,
  //      mats, M, rafter, ridgeH, top (0..1 t where the roof starts; the storey above hides the rest) }
  var group = new THREE.Group();
  var n = o.n, Rr = o.R, h = roofProfileFn(o.rise);
  var apo = Rr * Math.cos(Math.PI / n);
  var arc = arcTable(h, apo);
  var soffitScale = 1;
  var corners = [];
  for (var k = 0; k < n; k++) {
    var th = (k / n) * Math.PI * 2 + Math.PI / n;    // flat side facing +z for even n
    corners.push(new THREE.Vector2(Math.cos(th) * Rr, Math.sin(th) * Rr));
  }
  function worldOn(k, t, a, out) {
    var c0 = corners[k], c1 = corners[(k + 1) % n];
    var f = (a + 1) / 2;
    var ex = c0.x + (c1.x - c0.x) * f, ez = c0.y + (c1.y - c0.y) * f;
    var x = ex * t, z = ez * t;
    var cp = Math.abs(a);
    var y = h(t) + o.upturn * Math.pow(cp, 2.6) * Math.pow(t, 2.8);
    var w = 1 + (o.chong / Rr) * Math.pow(cp, 4) * Math.pow(t, 3);
    return out.set(x * w, y, z * w);
  }
  var t0 = o.top || 0;
  for (var s = 0; s < n; s++) {
    (function (k) {
      var c0 = corners[k], c1 = corners[(k + 1) % n];
      var halfEdge = c0.distanceTo(c1) / 2;
      group.add(buildFace({
        t0: t0, t1: 1, segT: 20, segA: 24, thick: o.thick,
        world: function (t, a, out) { return worldOn(k, t, a, out); },
        lat: function (t, a) { return a * halfEdge * t; },
        arc: arc
      }, o.tileP, o.courseL, o.mats.tile, o.mats.soffit, soffitScale));
    })(s);
  }
  // corner ridges
  var Hh = o.ridgeH;
  var tr0 = Math.max(t0, 0.04);
  for (var c = 0; c < n; c++) {
    var path = sampleLine(function (u, out) { return worldOn(c, tr0 + (1 - tr0) * u, -1, out); }, 16);
    group.add(ridgeMesh(path, hipSection(Hh * 0.5, Hh), o.mats.ridge));
    if (o.beasts) beastFile(path, Hh * 0.88, o.beasts, Hh * 0.55, o.mats.ridge, group, false);
  }
  // eave tiles + fascia + flying rafters
  var edges = [], runs = [];
  for (var e = 0; e < n; e++) {
    (function (k) {
      var c0 = corners[k], c1 = corners[(k + 1) % n];
      var halfEdge = c0.distanceTo(c1) / 2;
      var mid = new THREE.Vector3((c0.x + c1.x) / 2, 0, (c0.y + c1.y) / 2);
      var out = mid.clone().normalize();
      edges.push({
        out: out, lat0: -halfEdge, lat1: halfEdge, trim0: o.tileP * 0.6, trim1: o.tileP * 0.6,
        world: function (s, w) { return worldOn(k, 1, s * 2 - 1, w); },
        slope: function (s, w) {
          var a = worldOn(k, 0.98, s * 2 - 1, new THREE.Vector3()), b = worldOn(k, 1, s * 2 - 1, new THREE.Vector3());
          return w.subVectors(b, a).normalize();
        }
      });
      var path = sampleLine(function (u, w) { worldOn(k, 1, u * 2 - 1, w); w.y -= o.thick * 0.85; return w; }, 16);
      var fh = o.thick * 1.1, fd = o.thick * 0.6;
      // corners run clockwise seen from above, so the sweep's lateral axis
      // points outward here: the board goes on the negative side
      group.add(ridgeMesh(path, [[-fd, -fh], [0, -fh], [0, 0], [-fd, 0]], o.mats.fascia));
      runs.push({
        length: halfEdge * 2, skip0: 0.03, skip1: 0.03,
        outer: function (s, w) { worldOn(k, 1, s * 2 - 1, w); w.y -= o.thick; return w; },
        inner: function (s, w) { worldOn(k, o.innerT || 0.78, (s * 2 - 1) * 0.92, w); w.y -= o.thick; return w; }
      });
    })(e);
  }
  buildEaveTiles(edges, o, o.mats, group);
  if (o.rafter) buildRafters(runs, o, o.mats, group);
  group.userData.h = h;
  return group;
}
