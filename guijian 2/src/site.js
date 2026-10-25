// ============================================================================
//  院 SITE — the courtyard the building stands in
//
//  A hall on an infinite grey plane reads as a model on a table. Put it in a
//  paved court, with a 御路 running to its steps and a palace wall at a
//  believable distance, and the eye has the scale it needs: the wall is six
//  and a half metres, the bricks are half a metre, so the hall is as big as it
//  is. None of this is exported -- it lives in siteGroup.
// ============================================================================
var SITE = { mode: 'court', visible: true, furnish: true, mats: null };

// A tiled texture repeats; a real court doesn't. Large-scale tone -- where it
// was re-laid, where water stands, where the dirt drifts against a wall -- is
// laid in as vertex colour over a subdivided plane, so the repeat disappears.
var _siteNoise = null;
function weatherPlane(geo, w, d, cx, cz, scale, amt, edgeFn) {
  if (!_siteNoise) _siteNoise = new TEXGEN.Fbm(777, 3, 5);
  var pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    // plane is built in XY, then laid flat: local y is world -z
    var x = pos.getX(i) + cx, z = -pos.getY(i) + cz;
    var f = _siteNoise.at(x / scale + 10, z / scale + 10);
    var k = 1 + amt * (f - 0.5) * 2;
    if (edgeFn) k *= edgeFn(x, z);
    col[i * 3] = k; col[i * 3 + 1] = k * 0.995; col[i * 3 + 2] = k * 0.985;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---------------------------------------------------------------------------
//  宫城 the palace city beyond the wall: rows of lesser halls on the same grid,
//  instanced (three draw calls for all of them) and left to the haze. A court
//  that opens onto an empty plain reads as a stage set; one that opens onto
//  more roofs reads as a place.
// ---------------------------------------------------------------------------
var _cityGeo = null;
function cityGeos() {
  if (_cityGeo) return _cityGeo;
  // unit 庑殿 roof over [-0.5,0.5]^2 as a height field: the concave 举架
  // section, a ridge along x, corners lifted -- at distance it is the curve
  // and the upturn that say "Chinese roof", not the tile count
  var N = 18, pos = [], idx = [], rr = 0.42;
  for (var j = 0; j <= N; j++) for (var i = 0; i <= N; i++) {
    var x = -1 + 2 * i / N, z = -1 + 2 * j / N;
    var t = Math.max(Math.abs(z), Math.max(0, Math.abs(x) - rr) / (1 - rr));
    var y = Math.pow(1 - Math.min(1, t), 1.7) + 0.16 * Math.pow(Math.abs(x), 4) * Math.pow(Math.abs(z), 4);
    pos.push(x * 0.5, y, z * 0.5);
  }
  for (var j2 = 0; j2 < N; j2++) for (var i2 = 0; i2 < N; i2++) {
    var a = j2 * (N + 1) + i2, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  var roof = new THREE.BufferGeometry();
  roof.setIndex(idx);
  roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roof.computeVertexNormals();
  var body = new THREE.BoxGeometry(1, 1, 1); body.translate(0, 0.5, 0);
  var base = new THREE.BoxGeometry(1, 1, 1); base.translate(0, 0.5, 0);
  return (_cityGeo = { roof: roof, body: body, base: base });
}

// a row of 槅扇 door leaves, as a hall front reads from across a court:
// red stiles and rails, the lattice panels warm where light comes through
var _cityDoors = null;
function cityDoorTexture() {
  if (_cityDoors) return _cityDoors;
  var c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  var x = c.getContext('2d');
  x.fillStyle = '#5a1d14'; x.fillRect(0, 0, 256, 64);
  var leaves = 12, lw = 256 / leaves;
  for (var i = 0; i < leaves; i++) {
    var lx = i * lw;
    x.fillStyle = '#c99a62'; x.fillRect(lx + 2.5, 6, lw - 5, 34);       // 槅心
    x.fillStyle = 'rgba(70,24,14,0.55)';
    for (var k = 0; k < 5; k++) x.fillRect(lx + 2.5, 8 + k * 7, lw - 5, 1.2);
    for (var k2 = 1; k2 < 3; k2++) x.fillRect(lx + 2.5 + k2 * (lw - 5) / 3, 6, 1.2, 34);
    x.fillStyle = '#6b2418'; x.fillRect(lx + 3, 44, lw - 6, 15);          // 裙板
  }
  _cityDoors = new THREE.CanvasTexture(c);
  _cityDoors.encoding = THREE.sRGBEncoding;
  _cityDoors.userData = { cached: true };
  return _cityDoors;
}

function buildCity(court, M, mats, g) {
  var G = cityGeos();
  var rnd = TEXGEN.rng(1407);
  var cell = Math.max(court.hx * 0.5, 18 * M);
  var spots = [];
  for (var gx = -7; gx <= 7; gx++) {
    for (var gz = -7; gz <= 7; gz++) {
      var cx = gx * cell, cz = gz * cell + (court.zf + court.zb) / 2;
      // keep clear of the court, with a street's width beyond its wall, and of
      // the axis in front of the gate
      var gap = cell * 1.2 + 10 * M;
      if (Math.abs(cx) < court.hx + gap && cz > court.zb - gap && cz < court.zf + gap) continue;
      if (Math.abs(cx) < cell * 0.8 && cz > court.zf) continue;
      if (rnd() < 0.3) continue;
      var w = cell * (0.40 + 0.25 * rnd()), d = cell * (0.22 + 0.10 * rnd());
      var h = (4.5 + 2.5 * rnd()) * M;
      spots.push({ x: cx + (rnd() - 0.5) * cell * 0.2, z: cz + (rnd() - 0.5) * cell * 0.2, w: w, d: d, h: h, b: (0.6 + 0.9 * rnd()) * M });
    }
  }
  var n = spots.length;
  var bodies = new THREE.InstancedMesh(G.body, mats.cityWall, n);
  var roofs = new THREE.InstancedMesh(G.roof, mats.cityRoof, n);
  var bases = new THREE.InstancedMesh(G.base, mats.cityBase, n);
  var eaves = new THREE.InstancedMesh(G.base, mats.cityEave, n);
  // a ridge along every roof, with a lift at each end where the 吻 sits
  var ridges = new THREE.InstancedMesh(G.base, mats.cityRoof, n * 3);
  var m4 = new THREE.Matrix4();
  spots.forEach(function (s, i) {
    m4.makeScale(s.w * 1.08, s.b, s.d * 1.25); m4.setPosition(s.x, 0, s.z); bases.setMatrixAt(i, m4);
    m4.makeScale(s.w, s.h, s.d); m4.setPosition(s.x, s.b, s.z); bodies.setMatrixAt(i, m4);
    // the band of shade under the eave, which is most of what makes a hall
    // read as a hall from a distance
    m4.makeScale(s.w * 1.01, s.h * 0.24, s.d * 1.01); m4.setPosition(s.x, s.b + s.h * 0.76, s.z); eaves.setMatrixAt(i, m4);
    m4.makeScale(s.w * 1.14, s.d * 0.40, s.d * 1.34); m4.setPosition(s.x, s.b + s.h, s.z); roofs.setMatrixAt(i, m4);
    var ry = s.b + s.h + s.d * 0.40 * 0.96, rh = Math.max(0.35 * M, s.d * 0.035);
    m4.makeScale(s.w * 1.14 * 0.42, rh, rh * 1.1); m4.setPosition(s.x, ry - rh * 0.4, s.z); ridges.setMatrixAt(i * 3, m4);
    [-1, 1].forEach(function (e, k) {
      m4.makeScale(rh * 1.2, rh * 2.4, rh * 1.3); m4.setPosition(s.x + e * s.w * 1.14 * 0.21, ry - rh * 0.4, s.z); ridges.setMatrixAt(i * 3 + 1 + k, m4);
    });
  });
  // r128 culls an InstancedMesh by its one template's bounds at the origin,
  // which would drop the whole city whenever the origin left the view
  [bodies, roofs, bases, eaves, ridges].forEach(function (im) { im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im); });

  // the 槅扇 front of each hall: a dark band of lattice by day; by night most
  // of them are lit from within, a few stay dark
  var win = new THREE.PlaneGeometry(1, 1);
  win.userData.ownUVs = true;
  var doors = cityDoorTexture();
  var litMat = lampMat(new THREE.MeshStandardMaterial({ color: 0xffffff, map: doors, emissiveMap: doors, roughness: 0.7 }), new THREE.Color(1.0, 0.62, 0.30), 0.55);
  var darkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: doors, roughness: 0.7 });
  var lit = [], dark = [];
  spots.forEach(function (s) { [1, -1].forEach(function (f) { (rnd() < 0.72 ? lit : dark).push({ s: s, f: f }); }); });
  [[lit, litMat], [dark, darkMat]].forEach(function (L) {
    if (!L[0].length) return;
    var im = new THREE.InstancedMesh(win, L[1], L[0].length);
    L[0].forEach(function (w, i) {
      var s = w.s;
      m4.makeRotationY(w.f > 0 ? 0 : Math.PI);
      m4.scale(new THREE.Vector3(s.w * 0.80, s.h * 0.46, 1));
      m4.setPosition(s.x, s.b + s.h * 0.40, s.z + w.f * (s.d / 2 + 0.02 * M));
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    g.add(im);
  });
}

function buildSite(info, mats) {
  var g = new THREE.Group();
  var M = info.M;
  var W = info.width;                        // building footprint width, scene units
  var court;
  if (info.type === 'pagoda') {
    var hx = Math.max(W * 2.4, 42 * M);
    court = { hx: hx, zf: hx, zb: -hx };
  } else {
    court = { hx: Math.max(W * 1.9, 30 * M), zf: info.frontZ + Math.max(W * 1.25, 30 * M), zb: -(info.depth / 2 + Math.max(W * 0.55, 18 * M)) };
  }
  var cw = court.hx * 2, cd = court.zf - court.zb, cz = (court.zf + court.zb) / 2;

  // open ground beyond, to the horizon
  var earthGeo = new THREE.PlaneGeometry(7000, 7000, 90, 90);
  weatherPlane(earthGeo, 7000, 7000, 0, 0, 400, 0.18);
  var earth = new THREE.Mesh(earthGeo, mats.earth);
  earth.rotation.x = -Math.PI / 2;
  earth.position.y = -0.02;
  earth.receiveShadow = true;
  earth.geometry.userData.ownUVs = true;
  // world-unit UVs on the giant plane, so the earth texture keeps real size
  var euv = earth.geometry.attributes.uv;
  for (var i = 0; i < euv.count; i++) euv.setXY(i, (euv.getX(i) - 0.5) * 7000, (euv.getY(i) - 0.5) * 7000);
  g.add(earth);

  var showWalls = SITE.mode === 'court';
  // inside the palace city the ground beyond the wall is paved as well
  if (showWalls) earth.material = mats.cityGround;
  // paving
  var paveGeo = new THREE.PlaneGeometry(cw, cd, 72, 72);
  // grime drifts against the foot of the walls and the platform
  weatherPlane(paveGeo, cw, cd, 0, cz, Math.max(cw, cd) * 0.35, 0.16, function (x, z) {
    var dw = Math.min(court.hx - Math.abs(x), court.zf - z, z - court.zb);
    var wallK = 0.82 + 0.18 * Math.min(1, dw / (6 * M));
    var bx = Math.max(0, Math.abs(x) - info.width / 2), bz = Math.max(0, Math.abs(z) - info.depth / 2);
    var db = Math.hypot(bx, bz);
    var baseK = 0.88 + 0.12 * Math.min(1, db / (3 * M));
    return wallK * baseK;
  });
  var pave = new THREE.Mesh(paveGeo, mats.paving);
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(0, 0, cz);
  pave.receiveShadow = true;
  g.add(pave);

  // 御路: a raised stone causeway from the foot of the steps to the gate
  if (info.type !== 'pagoda' && info.stepsHalfW) {
    var yw = info.stepsHalfW * 2 * 0.86, z0 = info.stepsFootZ, z1 = court.zf - 0.2 * M;
    if (z1 > z0) {
      var path = new THREE.Mesh(new THREE.BoxGeometry(yw, 0.06 * M, z1 - z0), mats.path);
      path.position.set(0, 0.03 * M, (z0 + z1) / 2);
      path.receiveShadow = true; path.castShadow = true;
      g.add(path);
      // kerb stones either side
      [-1, 1].forEach(function (s) {
        var k = new THREE.Mesh(new THREE.BoxGeometry(0.3 * M, 0.1 * M, z1 - z0), mats.path);
        k.position.set(s * (yw / 2 + 0.15 * M), 0.05 * M, (z0 + z1) / 2);
        k.receiveShadow = true; k.castShadow = true;
        g.add(k);
      });
    }
  }

  if (showWalls) {
    var wh = 6.5 * M, wt = 1.6 * M, dj = 1.3 * M, gateW = Math.max(5.5 * M, (info.stepsHalfW || 2 * M) * 2.4);
    function wall(len, x, z, alongX) {
      if (len <= 0) return;
      var sx = alongX ? len : wt, sz = alongX ? wt : len;
      var w1 = new THREE.Mesh(new THREE.BoxGeometry(sx, wh - dj, sz), mats.wall);
      w1.position.set(x, dj + (wh - dj) / 2, z);
      var w2 = new THREE.Mesh(new THREE.BoxGeometry(sx + (alongX ? 0 : 0.08 * M), dj, sz + (alongX ? 0.08 * M : 0)), mats.brick);
      w2.position.set(x, dj / 2, z);
      // 墙帽: a little glazed roof running along the top -- tiled slopes on a
      // red 冰盘檐, a rounded ridge -- swept along the wall
      var capW = wt * 0.5 + 0.35 * M, capH = 0.9 * M;
      var ext = alongX ? len / 2 + capW * 0.3 : len / 2 + capW * 0.3;
      var a0 = alongX ? new THREE.Vector3(x - ext, wh, z) : new THREE.Vector3(x, wh, z - ext);
      var a1 = alongX ? new THREE.Vector3(x + ext, wh, z) : new THREE.Vector3(x, wh, z + ext);
      var path = [a0, a1];
      var corn = new THREE.Mesh(sweepGeometry(path, [[-wt / 2 - 0.12 * M, 0], [wt / 2 + 0.12 * M, 0],
        [wt / 2 + 0.12 * M, 0.22 * M], [-wt / 2 - 0.12 * M, 0.22 * M]]), mats.wall);
      var slope = new THREE.Mesh(sweepGeometry(path, [[-capW, 0.16 * M], [capW, 0.16 * M], [capW, 0.26 * M],
        [0.12 * M, capH * 0.86], [-0.12 * M, capH * 0.86], [-capW, 0.26 * M]]), mats.capTile);
      var ridge = new THREE.Mesh(sweepGeometry(path, [[-0.2 * M, capH * 0.8], [0.2 * M, capH * 0.8], [0.16 * M, capH * 1.02],
        [0, capH * 1.08], [-0.16 * M, capH * 1.02]]), mats.cap);
      [w1, w2, corn, slope, ridge].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; g.add(m); });
    }
    var hx2 = court.hx, half = gateW / 2;
    wall(cd + wt, hx2 + wt / 2, cz, false);
    wall(cd + wt, -hx2 - wt / 2, cz, false);
    wall(cw + wt * 2, 0, court.zb - wt / 2, true);
    // front wall, split at the gate
    var seg = hx2 + wt - half;
    wall(seg, -(half + seg / 2), court.zf + wt / 2, true);
    wall(seg, (half + seg / 2), court.zf + wt / 2, true);
    // the gate: two red leaves studded with 9 x 9 gilt 门钉, under a lintel
    var dh = wh * 0.78;
    var lintel = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.4 * M, wh - dh, wt), mats.wall);
    lintel.position.set(0, dh + (wh - dh) / 2, court.zf + wt / 2);
    lintel.castShadow = true; lintel.receiveShadow = true;
    g.add(lintel);
    var capL = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.6 * M, 0.2 * M, wt * 1.55), mats.cap);
    capL.position.set(0, wh + 0.1 * M, court.zf + wt / 2);
    g.add(capL);
    [-1, 1].forEach(function (s) {
      var leaf = new THREE.Mesh(new THREE.BoxGeometry(half, dh, 0.18 * M), mats.door);
      leaf.position.set(s * half / 2, dh / 2, court.zf + wt * 0.3);
      leaf.castShadow = true; leaf.receiveShadow = true;
      g.add(leaf);
    });
    var stud = new THREE.SphereGeometry(0.07 * M, 8, 6);
    var studs = new THREE.InstancedMesh(stud, mats.gold, 2 * 81);
    studs.frustumCulled = false;
    var m4 = new THREE.Matrix4(), k = 0;
    [-1, 1].forEach(function (s) {
      for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) {
        var x = s * half / 2 + (c - 4) * half / 10.5, y = dh * (0.14 + 0.8 * r / 8);
        m4.makeTranslation(x, y, court.zf + wt * 0.3 - 0.1 * M);
        studs.setMatrixAt(k++, m4);
      }
    });
    studs.castShadow = true;
    g.add(studs);
  }

  if (showWalls) buildCity(court, M, mats, g);

  g.userData.court = court;
  return g;
}
