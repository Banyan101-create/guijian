//  PAGODA (塔) — polygonal 攒尖顶 tier roofs + storey stacking
//  Taper per storey from 应县木塔 measured 面阔: 968/927/883/842/798 cm
//  -> ratios 0.958 / 0.953 / 0.954 / 0.948, mean ~= 0.953
// ============================================================================
var PAGODA_TAPER = 0.953;

function polyRadius(R, n, theta) {
  var sector = (Math.PI * 2) / n;
  var a = ((theta % sector) + sector) % sector - sector / 2;
  return R * Math.cos(Math.PI / n) / Math.cos(a);
}

// One bay's 槅扇, built flat in local XY with +Z facing out, then oriented by
// the caller: frame, 菱花 lattice, dark glazing behind.
function pagodaScreen(w, h, mats) {
  var g = new THREE.Group();
  var fr = Math.min(w, h) * 0.06;
  var leaves = Math.max(2, 2 * Math.round(w / (h * 0.42) / 2));
  var leafW = w / leaves;
  var gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.glass);
  gl.position.z = -fr * 0.4;
  g.add(gl);
  var grid = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.82), mats.grid);
  grid.position.set(0, h * 0.04, fr * 0.2);
  g.add(grid);
  for (var s = 0; s <= leaves; s++)
    part(new THREE.BoxGeometry(fr, h, fr * 1.4), mats.lattice, -w / 2 + leafW * s, 0, fr * 0.5, 0, g);
  [-h / 2, h / 2, -h * 0.37].forEach(function (ry) {
    part(new THREE.BoxGeometry(w, fr, fr * 1.3), mats.lattice, 0, ry, fr * 0.5, 0, g);
  });
  part(new THREE.BoxGeometry(w, h * 0.13 - fr, fr * 0.6), mats.lattice, 0, -h * 0.435, 0, 0, g);
  return g;
}

function buildPagodaStorey(R, n, height, colDia, mats, withBalcony, M) {
  var g = new THREE.Group();
  var colGeo = new THREE.CylinderGeometry(colDia * 0.46, colDia * 0.5, height, 16);
  var wallT = colDia * 0.35;
  for (var k = 0; k < n; k++) {
    var th = (k / n) * Math.PI * 2 + Math.PI / n;
    var x = Math.cos(th) * R, z = Math.sin(th) * R;
    part(colGeo, mats.wood, x, height / 2, z, 0, g);
    var th2 = ((k + 1) / n) * Math.PI * 2 + Math.PI / n;
    var x2 = Math.cos(th2) * R, z2 = Math.sin(th2) * R;
    var mx = (x + x2) / 2, mz = (z + z2) / 2;
    var len = Math.sqrt((x2 - x) * (x2 - x) + (z2 - z) * (z2 - z));
    var face = Math.atan2(mx, mz);           // rotation that sends local +Z out through this side
    // the wall spans the whole chord, column centre to column centre, so no
    // slot opens at the corners
    var panel = new THREE.Mesh(new THREE.BoxGeometry(len, height * 0.995, wallT), mats.wall);
    panel.position.set(mx, height * 0.4975, mz);
    panel.rotation.y = face;
    panel.castShadow = true; panel.receiveShadow = true;
    g.add(panel);
    var clear = len - colDia;
    // a real window, not a storey-high hole: on a tall 密檐 base storey the
    // opening stays door-sized and sits low
    var winH = Math.min(height * 0.5, 2.8 * M), winY = Math.min(height * 0.52, winH / 2 + 0.9 * M);
    // 密檐 storeys above the first are only an eave deep; they carry blind walls
    if (clear > colDia * 0.5 && winH > colDia * 1.2) {
      var mlen = Math.sqrt(mx * mx + mz * mz) || 1;
      var out = wallT * 0.5 + 0.002;
      var scr = pagodaScreen(clear * 0.9, winH, mats);
      scr.position.set(mx + (mx / mlen) * out, winY, mz + (mz / mlen) * out);
      scr.rotation.y = face;
      g.add(scr);
    }
    // 額枋 head beam and 腰枋 sill band
    [[height - colDia * 0.42, colDia * 0.75, colDia * 0.55], [colDia * 0.3, colDia * 0.5, colDia * 0.6]].forEach(function (b) {
      var beam = new THREE.Mesh(new THREE.BoxGeometry(len * 1.02, b[1], b[2]), mats.beam);
      beam.position.set(mx, b[0], mz);
      beam.rotation.y = face;
      beam.castShadow = true; beam.receiveShadow = true;
      g.add(beam);
    });
  }
  return g;
}


// A convex n-gon prism standing on y0. ExtrudeGeometry lays its UVs out in world
// units, which is what the world-scaled textures expect, and the shape's
// corners are placed exactly where the columns' are.
function polyPrism(R, n, y0, h, mat, g) {
  var shape = new THREE.Shape();
  for (var k = 0; k < n; k++) {
    var th = (k / n) * Math.PI * 2 + Math.PI / n;
    var px = Math.cos(th) * R, py = -Math.sin(th) * R;
    if (k === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  }
  shape.closePath();
  var geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return part(geo, mat, 0, y0, 0, 0, g);
}

// 勾栏: a lacquered timber balustrade. 地栿 sill, 华板 panel with a gilt-edged
// raised centre, 步步锦 lattice between two rails, 盆唇 and 寻杖 above, and a
// 望柱 with a lotus head at every bay. The lattice is cut out, so you see
// through it the way you do through the real thing.
function buildPagodaRail(R, n, mats, M) {
  var g = new THREE.Group();
  var G = railGeos(M);
  var postW = 0.2 * M, postH = 1.05 * M;
  var lattice = mats.railGrid || mats.grid;
  var seen = {};
  function post(x, z) {
    var k = x.toFixed(3) + ',' + z.toFixed(3);
    if (seen[k]) return;
    seen[k] = true;
    part(G.post, mats.wood, x, postH / 2, z, 0, g);
    part(G.collar, mats.gold, x, postH + 0.025 * M, z, 0, g);
    part(G.head, mats.wood, x, postH + 0.05 * M, z, 0, g);
  }
  for (var e = 0; e < n; e++) {
    var a1 = (e / n) * Math.PI * 2 + Math.PI / n, a2 = ((e + 1) / n) * Math.PI * 2 + Math.PI / n;
    var p1 = new THREE.Vector3(Math.cos(a1) * R, 0, Math.sin(a1) * R);
    var p2 = new THREE.Vector3(Math.cos(a2) * R, 0, Math.sin(a2) * R);
    var L = p1.distanceTo(p2), np = Math.max(2, Math.round(L / (1.5 * M)));
    var ang = Math.atan2(p2.z - p1.z, p2.x - p1.x);
    for (var q = 0; q <= np; q++) {
      var f = q / np;
      post(p1.x + (p2.x - p1.x) * f, p1.z + (p2.z - p1.z) * f);
    }
    for (var j = 0; j < np; j++) {
      var cf = (j + 0.5) / np;
      var pl = L / np - postW;
      if (pl <= 0) continue;
      var grp = new THREE.Group();
      grp.position.set(p1.x + (p2.x - p1.x) * cf, 0, p1.z + (p2.z - p1.z) * cf);
      grp.rotation.y = -ang;
      part(new THREE.BoxGeometry(pl + postW * 0.5, 0.09 * M, 0.26 * M), mats.beam, 0, 0.045 * M, 0, 0, grp);          // 地栿
      part(new THREE.BoxGeometry(pl, 0.34 * M, 0.07 * M), mats.board, 0, 0.26 * M, 0, 0, grp);                         // 华板
      part(new THREE.BoxGeometry(pl * 0.86, 0.25 * M, 0.012 * M), mats.gold, 0, 0.26 * M, 0.04 * M, 0, grp);           // gilt edging
      part(new THREE.BoxGeometry(pl * 0.80, 0.19 * M, 0.02 * M), mats.beam, 0, 0.26 * M, 0.046 * M, 0, grp);           // raised centre
      part(new THREE.BoxGeometry(pl, 0.05 * M, 0.09 * M), mats.wood, 0, 0.465 * M, 0, 0, grp);                         // lower rail
      var lat = new THREE.Mesh(new THREE.PlaneGeometry(pl, 0.38 * M), lattice);                                         // 步步锦
      lat.position.set(0, 0.68 * M, 0);
      lat.receiveShadow = true; lat.castShadow = true;
      grp.add(lat);
      part(new THREE.BoxGeometry(pl, 0.05 * M, 0.12 * M), mats.wood, 0, 0.90 * M, 0, 0, grp);                          // 盆唇
      part(new THREE.BoxGeometry(pl, 0.08 * M, 0.10 * M), mats.wood, 0, 0.99 * M, 0, 0, grp);                          // 寻杖
      g.add(grp);
    }
  }
  return g;
}

// 平坐: the storey above does not stand on the roof below, it stands on a deck
// carried by a short, solid layer of its own: a walled drum rising out of the
// roof, a band of brackets under the deck edge, then the deck and its
// balustrade. That is what fills the gap between floors.
function buildPingzuo(R, n, y, prev, o) {
  var g = new THREE.Group(), M = o.M, mats = o.mats;
  var hfn = roofProfileFn(prev.rise);
  var Rp = R * (o.dense ? 0.995 : 0.97);
  var td = Math.min(1, Rp / prev.Rr);
  var yLow = prev.roofY + hfn(td) - o.thick * 2.4;
  if (o.dense) {
    polyPrism(Rp, n, yLow, Math.max(0.01, y - yLow), mats.wall, g);
    return g;
  }
  var deckT = 0.34 * M, slabT = 0.04 * M;
  var u = o.u, steps = 2;
  var bandH = o.dougong ? (2 * u + (steps + 1) * 2 * u + 2 * u) : 0.5 * M;
  var yTop = y - deckT - bandH;
  if (yTop < yLow + 0.4 * M) yLow = yTop - 0.4 * M;
  var rDeck = R * 1.14;
  // drum, with 枋 bands where it meets the roof and the brackets
  polyPrism(Rp, n, yLow, yTop - yLow, mats.wall, g);
  polyPrism(Rp * 1.012, n, yTop - 0.42 * M, 0.42 * M, mats.beam, g);
  // posts at each corner and mid-face, proud of the wall; raised panels between
  var colD = o.colDia * 0.85, visLow = yLow + o.thick * 3.0;
  var postGeo = new THREE.CylinderGeometry(colD * 0.46, colD * 0.5, yTop - yLow, 14);
  var apo = Rp * Math.cos(Math.PI / n);
  for (var k = 0; k < n; k++) {
    var th = (k / n) * Math.PI * 2 + Math.PI / n;
    part(postGeo, mats.wood, Math.cos(th) * Rp, (yLow + yTop) / 2, Math.sin(th) * Rp, 0, g);
    var thm = th + Math.PI / n;
    part(postGeo, mats.wood, Math.cos(thm) * (apo + colD * 0.2), (yLow + yTop) / 2, Math.sin(thm) * (apo + colD * 0.2), 0, g);
    var len = 2 * Rp * Math.sin(Math.PI / n);
    var ph = (yTop - 0.42 * M) - visLow;
    if (ph > 0.9 * M) {
      var cx = Math.cos(thm) * (apo + 0.02 * M), cz = Math.sin(thm) * (apo + 0.02 * M);
      var ry = Math.atan2(cx, cz);
      var py = visLow + ph / 2 + 0.05 * M;
      [-1, 1].forEach(function (sd) {
        var off = sd * len * 0.25;
        var px = cx + Math.cos(ry) * off, pz = cz - Math.sin(ry) * off;
        var pw = len * 0.38, phh = Math.min(ph * 0.72, 2.4 * M);
        part(new THREE.BoxGeometry(pw, phh, 0.07 * M), mats.beam, px, py, pz, ry, g);
        part(new THREE.BoxGeometry(pw * 0.88, phh * 0.86, 0.09 * M), mats.gold, px, py, pz, ry, g);
        part(new THREE.BoxGeometry(pw * 0.84, phh * 0.82, 0.10 * M), mats.board, px, py, pz, ry, g);
      });
    }
  }
  // the brackets that carry the deck, with their backing board
  if (o.dougong) {
    var tpl = dougongTemplate(u, steps, false);
    var per = 3;
    for (var s = 0; s < n * per; s++) {
      var ths = (s / (n * per)) * Math.PI * 2 + Math.PI / n;
      var pr = polyRadius(Rp, n, ths - Math.PI / n);
      var set = new THREE.Group();
      set.position.set(Math.cos(ths) * pr, yTop, Math.sin(ths) * pr);
      set.rotation.y = Math.atan2(Math.cos(ths), Math.sin(ths));
      var even = s % 2 === 0;
      tpl.forEach(function (pp) {
        part(pp.geo, pp.alt ? (even ? mats.dgB : mats.dg) : (even ? mats.dg : mats.dgB), pp.x, pp.y, pp.z, 0, set);
      });
      g.add(set);
    }
    polyPrism(Rp * 1.02, n, yTop, bandH, mats.board, g);
  } else {
    polyPrism(Rp * 1.04, n, yTop, bandH * 0.5, mats.beam, g);
    polyPrism(Rp * 1.09, n, yTop + bandH * 0.5, bandH * 0.5, mats.beam, g);
  }
  // the deck: a painted edge beam, planks on top
  polyPrism(rDeck, n, y - deckT, deckT - slabT, mats.beam, g);
  polyPrism(rDeck * 0.995, n, y - slabT, slabT, mats.deck || mats.board, g);
  var rail = buildPagodaRail(R * 1.07, n, mats, M);
  rail.position.y = y;
  g.add(rail);
  return g;
}

function buildFinial(R, height, mat, goldMat) {
  var g = new THREE.Group();
  // 覆钵 the inverted bowl, then the 相轮 rings on the mast, then the 宝珠
  part(latheGeo([[R * 0.42, 0], [R * 0.44, height * 0.04], [R * 0.36, height * 0.12], [R * 0.16, height * 0.16], [R * 0.08, height * 0.17]]), mat, 0, 0, 0, 0, g);
  part(new THREE.CylinderGeometry(R * 0.05, R * 0.07, height, 12), goldMat, 0, height / 2, 0, 0, g);
  var rings = 7;
  for (var i = 0; i < rings; i++) {
    var f = i / rings;
    var rad = R * 0.30 * (1 - f * 0.62);
    var d = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.01, rad), Math.max(0.005, R * 0.035), 8, 24), goldMat);
    d.rotation.x = Math.PI / 2;
    d.position.y = height * (0.24 + f * 0.52);
    d.castShadow = true;
    g.add(d);
  }
  part(new THREE.SphereGeometry(Math.max(0.01, R * 0.10), 18, 14), goldMat, 0, height * 0.86, 0, 0, g);
  part(latheGeo([[R * 0.001, 0], [R * 0.06, height * 0.02], [R * 0.05, height * 0.07], [R * 0.001, height * 0.12]]), goldMat, 0, height * 0.9, 0, 0, g);
  return g;
}

function buildPagoda(D, scale, opts, mats, env) {
  // env: { M, u, tileP, courseL, ridgeH }
  var g = new THREE.Group();
  var n = opts.sides, storeys = opts.storeys;
  var dense = opts.style === 'miyan';
  // 密檐式 towers are markedly more slender than 楼阁式, with one tall base
  // storey then thin stacked eaves (嵩岳寺塔 ~40 m on a ~10 m base = 4:1).
  var R0 = (D.totalWidth * scale) / 2 * (dense ? 0.30 : 1.0);
  var storeyH = D.colH * scale * (dense ? 0.55 : 1.0);
  var eaveOut = D.eaveOut * scale * ROOF_CURVE.eave * (dense ? 0.5 : 1.0);
  var thick = Math.max(0.03, D.purlinDia * scale * 0.45);
  var u = D.dgUnit * scale;
  var steps = dense ? 1 : 2;
  var dgH = opts.dougong ? (2 * u + (steps + 1) * 2 * u + 2 * u) : 0;
  var colDia = D.colDia * scale;
  // rafters at one and a half times the hall spacing: at pagoda distance the
  // eye reads the rhythm, not the count, and it halves the instance load
  var rafter = { spacing: 4.5 * u, r: 0.75 * u, fly: 1.5 * u, flyLen: 7 * u * (dense ? 0.5 : 1) };

  var y = 0, R = R0, prev = null;
  for (var i = 0; i < storeys; i++) {
    var isFirst = (i === 0);
    var h = dense ? (isFirst ? storeyH * 5.0 : storeyH * 0.34) : storeyH;

    if (prev) {
      g.add(buildPingzuo(R, n, y, prev, { dense: dense, dougong: opts.dougong, u: u, colDia: colDia, thick: thick, M: env.M, mats: mats }));
    }
    var body = buildPagodaStorey(R, n, h, colDia, mats, false, env.M);
    body.position.y = y;
    g.add(body);

    if (opts.dougong) {
      // bracket sets at every corner and two between, facing out
      var tpl = dougongTemplate(u, steps, false);
      var per = 3;
      for (var k = 0; k < n * per; k++) {
        var th = (k / (n * per)) * Math.PI * 2 + Math.PI / n;
        var pr = polyRadius(R, n, th - Math.PI / n);
        var set = new THREE.Group();
        set.position.set(Math.cos(th) * pr, y + h, Math.sin(th) * pr);
        set.rotation.y = Math.atan2(Math.cos(th), Math.sin(th));
        var even = k % 2 === 0;
        tpl.forEach(function (pp) {
          part(pp.geo, pp.alt ? (even ? mats.dgB : mats.dg) : (even ? mats.dg : mats.dgB), pp.x, pp.y, pp.z, 0, set);
        });
        g.add(set);
      }
      // 垫栱板 ring behind them
      for (var e = 0; e < n; e++) {
        var a1 = (e / n) * Math.PI * 2 + Math.PI / n, a2 = ((e + 1) / n) * Math.PI * 2 + Math.PI / n;
        var L = 2 * R * Math.sin(Math.PI / n);
        var mid = new THREE.Vector3((Math.cos(a1) + Math.cos(a2)) / 2 * R, 0, (Math.sin(a1) + Math.sin(a2)) / 2 * R);
        var b = new THREE.Mesh(new THREE.BoxGeometry(L, dgH * 0.8, u * 0.5), mats.board);
        b.position.set(mid.x * 0.985, y + h + dgH * 0.4, mid.z * 0.985);
        b.rotation.y = Math.atan2(mid.x, mid.z);
        b.castShadow = true; b.receiveShadow = true;
        g.add(b);
      }
    }

    var tierRise = (dense ? 0.42 : 0.78) * storeyH;
    var Rr = R + eaveOut + (opts.dougong ? 3 * u * steps : 0);
    var roofY = y + h + dgH - thick * 0.2;
    // the storey above hides the middle of this roof: build only the ring
    // that shows, which also keeps the two from z-fighting
    var nextR = R * (dense ? 0.982 : PAGODA_TAPER);
    var t0 = Math.max(0, (nextR * 0.92) / Rr);
    var roof = buildPolygonRoof({
      R: Rr, n: n, rise: tierRise, upturn: D.cornerRise * scale * ROOF_CURVE.lift, chong: 4.5 * u,
      thick: thick, tileP: env.tileP, courseL: env.courseL, mats: mats, M: env.M,
      rafter: rafter, ridgeH: env.ridgeH * 0.7, top: t0, innerT: Math.max(t0 + 0.05, R / Rr * 0.98),
      beasts: opts.beasts && !dense ? 3 : 0
    });
    roof.position.y = roofY;
    g.add(roof);

    prev = { Rr: Rr, roofY: roofY, rise: tierRise };
    y += h + dgH + tierRise * (dense ? 0.70 : 0.62);
    R = nextR;
  }

  var capRise = storeyH * 1.05;
  var capR = R + eaveOut * 0.8;
  var cap = buildPolygonRoof({
    R: capR, n: n, rise: capRise, upturn: D.cornerRise * scale * ROOF_CURVE.lift * 0.8, chong: 4.5 * u,
    thick: thick, tileP: env.tileP, courseL: env.courseL, mats: mats, M: env.M,
    rafter: rafter, ridgeH: env.ridgeH * 0.7, top: 0, innerT: 0.78, beasts: 0
  });
  cap.position.y = y;
  g.add(cap);

  var fin = buildFinial(R, storeyH * 1.35, mats.ridge, mats.gold);
  fin.position.y = y + capRise - thick * 0.5;
  g.add(fin);

  g.userData.totalHeight = y + capRise + storeyH * 1.35;
  g.userData.baseRadius = R0;
  return g;
}
