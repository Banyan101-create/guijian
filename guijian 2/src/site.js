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


  g.userData.court = court;
  return g;
}
