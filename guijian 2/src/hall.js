// ============================================================================
//  大殿 HALL — platform, columns, beams, brackets, walls, screens, steps
//
//  Units: everything structural is cut from the 斗口 (S.u is one 斗口 in scene
//  units). Everything a person touches -- a riser, a handrail, a door leaf --
//  is cut from metres (S.M is scene units per metre), because a step is 15 cm
//  whether the hall is a garden pavilion or the 太和殿.
// ============================================================================

// ----------------------------------------------------------------------------
//  台基 — a stack of tiers. 大式 tiers are 须弥座: the profile from 圭角 at the
//  foot, through 下枋, 下枭, the recessed 束腰, 上枭, to 上枋 at the top, in the
//  51-份 proportions of 清式营造则例. 小式 tiers are a plain 台明: 土衬 footing,
//  陡板 face, 阶条石 cap.
// ----------------------------------------------------------------------------
function ringGeometry(w, d, th, prof, M) {
  // prof: [[o, y]...] closed, o = outward offset (scene units), y in 0..th
  var pos = [], nor = [], uv = [], idx = [];
  var corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];     // front-left -> front-right -> back-right -> back-left
  var V = THREE.Vector3;
  for (var s = 0; s < 4; s++) {
    var c0 = corners[s], c1 = corners[(s + 1) % 4];
    var sideLen = (s % 2 === 0) ? 2 * w : 2 * d;
    for (var k = 0; k < prof.length; k++) {
      var p0 = prof[k], p1 = prof[(k + 1) % prof.length];
      var A = new V(c0[0] * (w + p0[0]), p0[1], c0[1] * (d + p0[0]));
      var B = new V(c1[0] * (w + p0[0]), p0[1], c1[1] * (d + p0[0]));
      var Cc = new V(c1[0] * (w + p1[0]), p1[1], c1[1] * (d + p1[0]));
      var D = new V(c0[0] * (w + p1[0]), p1[1], c0[1] * (d + p1[0]));
      var n = new V().crossVectors(new V().subVectors(B, A), new V().subVectors(D, A));
      if (n.lengthSq() < 1e-16) n.subVectors(Cc, A).cross(new V().subVectors(D, B));
      n.normalize();
      // outward test against the side's own outward direction
      var outDir = (s === 0) ? new V(0, 0, 1) : (s === 1) ? new V(1, 0, 0) : (s === 2) ? new V(0, 0, -1) : new V(-1, 0, 0);
      var mid = A.clone().add(Cc).multiplyScalar(0.5);
      var centreTest = n.dot(mid) > 0 || n.dot(outDir) > 0.2 || (Math.abs(n.y) > 0.5);
      var base = pos.length / 3;
      var vmin = Math.min(p0[1], p1[1]);
      [A, B, Cc, D].forEach(function (q, qi) {
        pos.push(q.x, q.y, q.z);
        var along = (qi === 0 || qi === 3) ? 0 : sideLen;
        uv.push(along, q.y + (qi < 2 ? 0 : 0));
      });
      // faces must point away from the solid's interior; for a ring that is
      // decided per profile edge: the edge normal in (o, y) space, lifted to 3D
      var eo = p1[0] - p0[0], ey = p1[1] - p0[1];
      var en = new V(outDir.x * ey, -eo, outDir.z * ey);     // rotate the (o,y) edge by -90
      if (n.dot(en) < 0) { idx.push(base, base + 2, base + 1, base, base + 3, base + 2); n.negate(); }
      else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      for (var q = 0; q < 4; q++) nor.push(n.x, n.y, n.z);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.userData.ownUVs = true;
  return g;
}

function buildBase(hw, hd, h, tiers, mats, opts) {
  opts = opts || {};
  var g = new THREE.Group();
  var mg = (opts.margin === undefined) ? 0.65 : opts.margin;
  var xumi = !!opts.xumi;
  var th = h / tiers;
  var y0 = 0;
  for (var i = 0; i < tiers; i++) {
    var shrink = i * mg * 0.34;
    var w = (hw + mg) - shrink, d = (hd + mg) - shrink;
    var D = Math.min(w, d) * 0.5;
    var prof;
    if (xumi) {
      // 圭角 10, 下枋 8, 下枭 7, 束腰 8, 上枭 7, 上枋 9 -- of 49 份
      var Y = [0, 10, 18, 25, 33, 40, 49].map(function (v) { return v / 49 * th; });
      var o = th;     // insets scale with the tier
      prof = [[0, Y[0]], [0, Y[1]], [-0.035 * o, Y[1]], [-0.035 * o, Y[2]], [-0.12 * o, Y[3]],
              [-0.15 * o, Y[3]], [-0.15 * o, Y[4]], [-0.12 * o, Y[4]], [-0.035 * o, Y[5]], [0.01 * o, Y[5]],
              [0.01 * o, Y[6]], [-D, Y[6]], [-D, Y[0]]];
    } else {
      prof = [[0.03 * th, 0], [0.03 * th, 0.10 * th], [0, 0.10 * th], [0, 0.86 * th],
              [0.02 * th, 0.86 * th], [0.02 * th, th], [-D, th], [-D, 0]];
    }
    var ring = new THREE.Mesh(ringGeometry(w, d, th, prof), mats.base);
    ring.position.y = y0;
    ring.castShadow = true; ring.receiveShadow = true;
    ring.userData.keep = false;
    g.add(ring);
    // the paved top: 阶条石 / 金砖, a hair above the ring so it owns the top
    var top = new THREE.Mesh(new THREE.BoxGeometry((w + (xumi ? 0.01 * th : 0.02 * th)) * 2, th * 0.04,
                                                  (d + (xumi ? 0.01 * th : 0.02 * th)) * 2), mats.paving);
    top.position.y = y0 + th - th * 0.02 + 0.0015;
    top.receiveShadow = true; top.castShadow = true;
    g.add(top);
    // the solid core, so the tier exports as filled stone rather than a shell
    var core = new THREE.Mesh(new THREE.BoxGeometry((w - D * 0.5) * 2, th * 0.96, (d - D * 0.5) * 2), mats.base);
    core.position.y = y0 + th * 0.48;
    core.castShadow = false; core.receiveShadow = false;
    g.add(core);
    g.userData.topHW = w; g.userData.topHD = d;
    g.userData.topY = y0 + th;
    g.userData.tierTop = th;
    y0 += th;
  }
  return g;
}

// 螭首: the dragon-head spout under every 望柱 of a 须弥座, corner ones twice the size
var _chiGeo = {};
function chishouGeo(L) {
  var k = L.toFixed(5);
  if (_chiGeo[k]) return _chiGeo[k];
  var s = new THREE.Shape();
  [[0, 0], [0.55, -0.02], [0.95, 0.06], [1.05, 0.22], [0.92, 0.36], [0.70, 0.40], [0.48, 0.50], [0.20, 0.56], [0, 0.6]]
    .forEach(function (p, i) { if (i) s.lineTo(p[0] * L, p[1] * L * 0.6); else s.moveTo(p[0] * L, p[1] * L * 0.6); });
  s.closePath();
  var w = L * 0.34;
  var gg = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: w * 0.15, bevelSize: L * 0.04, bevelSegments: 2 });
  gg.translate(0, 0, -w / 2);
  return (_chiGeo[k] = gg);
}
function addChishou(group, posts, base, hw, hd, mat, M) {
  var y = base.userData.topY - base.userData.tierTop * 0.11;
  posts.forEach(function (p) {
    var corner = p.corner;
    var L = (corner ? 1.1 : 0.65) * M;
    var geo = chishouGeo(L);
    var m = new THREE.Mesh(geo, mat);
    var ang;
    if (corner) ang = Math.atan2(Math.sign(p.z), Math.sign(p.x));
    else if (Math.abs(Math.abs(p.z) - hd) < 1e-3) ang = Math.atan2(Math.sign(p.z), 0);
    else ang = Math.atan2(0, Math.sign(p.x));
    var ox = Math.cos(ang), oz = Math.sin(ang);
    m.position.set(p.x + ox * 0.0 + (corner ? ox * 0 : 0), y - L * 0.18, p.z);
    // start just inside the 上枋 face and run outward
    var face = corner ? Math.SQRT2 : 1;
    m.position.x = (Math.abs(p.x) >= hw - 1e-3 ? Math.sign(p.x) * hw : p.x) - ox * L * 0.15 * face;
    m.position.z = (Math.abs(p.z) >= hd - 1e-3 ? Math.sign(p.z) * hd : p.z) - oz * L * 0.15 * face;
    m.rotation.y = -ang;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  });
}

// ----------------------------------------------------------------------------
//  栏杆 — 望柱 and 寻杖栏板, round the top tier, open at the steps. Sized in
//  metres: 栏板 about 0.9 m, 望柱 about 1.45 m with its head, 1.3 m apart.
// ----------------------------------------------------------------------------
var _railGeos = {};
function railGeos(M) {
  var key = M.toFixed(6);
  if (_railGeos[key]) return _railGeos[key];
  var postW = 0.20 * M, postH = 1.05 * M;
  var head = latheGeo([[0.11, 0], [0.12, 0.04], [0.09, 0.07], [0.12, 0.13], [0.135, 0.2], [0.12, 0.28],
                       [0.08, 0.33], [0.05, 0.38], [0.0001, 0.40]].map(function (p) { return [p[0] * M, p[1] * M]; }), 12);
  var vase = latheGeo([[0.04, 0], [0.065, 0.06], [0.07, 0.12], [0.045, 0.2], [0.03, 0.25], [0.05, 0.3], [0.06, 0.35]]
    .map(function (p) { return [p[0] * M, p[1] * M]; }), 10);
  return (_railGeos[key] = {
    postW: postW, postH: postH, head: head, vase: vase,
    post: new THREE.BoxGeometry(postW, postH, postW),
    collar: new THREE.BoxGeometry(postW * 1.12, 0.05 * M, postW * 1.12)
  });
}

function buildBalustrade(hw, hd, y, mats, M, gap) {
  var g = new THREE.Group();
  var G = railGeos(M);
  var spacing = 1.3 * M;
  var posts = [], seen = {};
  function addPost(x, z, corner) {
    var k = x.toFixed(4) + ',' + z.toFixed(4);
    if (seen[k]) return;
    seen[k] = true;
    posts.push({ x: x, z: z, corner: corner });
    part(G.post, mats.stone, x, y + G.postH / 2, z, 0, g);
    part(G.collar, mats.stone, x, y + G.postH + 0.025 * M, z, 0, g);
    part(G.head, mats.stone, x, y + G.postH + 0.05 * M, z, 0, g);
  }
  function panel(ax, az, bx, bz) {
    var len = Math.hypot(bx - ax, bz - az);
    var n = Math.max(1, Math.round(len / spacing));
    var along = Math.atan2(bz - az, bx - ax);
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      addPost(ax + (bx - ax) * f, az + (bz - az) * f, false);
    }
    for (var j = 0; j < n; j++) {
      var f0 = j / n, f1 = (j + 1) / n, cx = ax + (bx - ax) * (f0 + f1) / 2, cz = az + (bz - az) * (f0 + f1) / 2;
      var pl = len / n - G.postW;
      if (pl <= 0) continue;
      var grp = new THREE.Group();
      grp.position.set(cx, y, cz);
      grp.rotation.y = -along;
      // 地栿 sill, 华板 lower panel with a raised 盒子, three 净瓶, 寻杖 rail
      part(new THREE.BoxGeometry(pl, 0.10 * M, 0.26 * M), mats.stone, 0, 0.05 * M, 0, 0, grp);
      part(new THREE.BoxGeometry(pl, 0.40 * M, 0.12 * M), mats.stone, 0, 0.30 * M, 0, 0, grp);
      part(new THREE.BoxGeometry(pl * 0.82, 0.26 * M, 0.14 * M), mats.stone, 0, 0.30 * M, 0, 0, grp);
      part(new THREE.BoxGeometry(pl, 0.05 * M, 0.13 * M), mats.stone, 0, 0.525 * M, 0, 0, grp);
      [-0.3, 0, 0.3].forEach(function (k) { part(G.vase, mats.stone, k * pl, 0.55 * M, 0, 0, grp); });
      part(new THREE.BoxGeometry(pl, 0.09 * M, 0.11 * M), mats.stone, 0, 0.94 * M, 0, 0, grp);
      g.add(grp);
    }
  }
  var X = hw, Z = hd;
  addPost(X, Z, true); addPost(-X, Z, true); addPost(X, -Z, true); addPost(-X, -Z, true);
  panel(X, Z, X, -Z);          // right side
  panel(X, -Z, -X, -Z);        // back
  panel(-X, -Z, -X, Z);        // left side
  if (gap) {
    panel(-X, Z, gap[0], Z);
    panel(gap[1], Z, X, Z);
  } else panel(-X, Z, X, Z);
  g.userData.posts = posts;
  return g;
}

// ----------------------------------------------------------------------------
//  踏跺 — real risers: about 15 cm high, 32 cm deep, however big the hall.
//  垂带 cheeks either side; on an imperial hall the middle third is the 御路,
//  a carved slab no one walked on.
// ----------------------------------------------------------------------------
function buildSteps(halfW, baseH, mats, M, opts) {
  opts = opts || {};
  var g = new THREE.Group();
  var riser = 0.15 * M, tread = 0.32 * M;
  var n = Math.max(2, Math.round(baseH / riser));
  var rh = baseH / n;
  var run = tread * n;
  var cheekW = 0.42 * M;
  for (var i = 0; i < n; i++) {
    var h = rh * (i + 1);
    // each step is a full block down to the ground, so the flight is solid
    var st = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, h, tread), mats.step);
    st.position.set(0, h / 2, tread * (n - i - 0.5));
    st.castShadow = true; st.receiveShadow = true;
    g.add(st);
  }
  // 垂带: sloping cheeks, square-ended at the foot
  var shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(run + cheekW * 0.6, 0);
  shape.lineTo(run + cheekW * 0.6, rh * 0.9);
  shape.lineTo(run, rh * 1.1);
  shape.lineTo(0, baseH + rh * 0.35);
  shape.lineTo(0, 0);
  var eg = new THREE.ExtrudeGeometry(shape, { depth: cheekW, bevelEnabled: false });
  [-1, 1].forEach(function (sd) {
    var ch = new THREE.Mesh(eg, mats.stone);
    // extrude runs along local +X; -90 deg about Y sends it to world +Z
    ch.rotation.y = -Math.PI / 2;
    ch.position.set(sd * (halfW + cheekW / 2) + cheekW / 2, 0, 0);
    ch.castShadow = true; ch.receiveShadow = true;
    g.add(ch);
  });
  if (opts.yulu) {
    var yw = halfW * 0.62;
    var len = Math.hypot(run, baseH);
    var slab = new THREE.Mesh(new THREE.BoxGeometry(yw, 0.16 * M, len * 1.02), mats.relief);
    slab.position.set(0, baseH / 2 + 0.05 * M, run / 2);
    slab.rotation.x = Math.atan2(baseH, run);
    slab.castShadow = true; slab.receiveShadow = true;
    g.add(slab);
  }
  g.userData.run = run;
  return g;
}

// Column centrelines from the real 斗口 bay widths. Everything that has to line
// up with a bay -- columns, 槅扇, 斗栱, 彩画 -- must read its positions from here.
function bayAxes(D, scale) {
  var xs = [-(D.totalWidth * scale) / 2], acc = xs[0];
  for (var i = 0; i < D.bayWidths.length; i++) { acc += D.bayWidths[i] * scale; xs.push(acc); }
  return xs;
}
function depthAxes(D, scale) {
  var hd = (D.totalDepth * scale) / 2;
  var zs = [-hd], zacc = -hd;
  for (var k = D.stepRuns.length - 1; k >= 0; k--) { zacc += D.stepRuns[k] * scale; zs.push(zacc); }
  for (var k2 = 0; k2 < D.stepRuns.length; k2++) { zacc += D.stepRuns[k2] * scale; zs.push(zacc); }
  return zs;
}

// ----------------------------------------------------------------------------
//  柱, 额枋, 彩画, 雀替
// ----------------------------------------------------------------------------
function paintedPlane(w, h, tex, group, x, y, z, ry) {
  var mat = PAINT_MATS[tex.uuid];
  if (!mat) {
    mat = PAINT_MATS[tex.uuid] = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.78, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
  }
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.geometry.userData.ownUVs = true;
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  group.add(m);
  return m;
}
var PAINT_MATS = {};

function buildColumns(S, baseH, mats, opts) {
  var D = S.D, scale = S.scale, u = S.u;
  var g = new THREE.Group();
  var colH = D.colH * scale, r = (D.colDia * scale) / 2;
  var topR = (D.colTopDia * scale) / 2;
  var hw = (D.totalWidth * scale) / 2, hd = (D.totalDepth * scale) / 2;
  var xs = bayAxes(D, scale), zs = depthAxes(D, scale);

  var mid = (xs.length - 1) / 2;
  xs.forEach(function (x, xi) {
    zs.forEach(function (z, zi) {
      var edge = (xi === 0 || xi === xs.length - 1 || zi === 0 || zi === zs.length - 1);
      if (!edge) return;
      // 生起: columns rise progressively toward the corners
      var rise = opts.shengqi ? D.shengqi * scale * (Math.abs(xi - mid) / Math.max(mid, 1)) : 0;
      var h = colH + rise;
      var m = new THREE.Mesh(new THREE.CylinderGeometry(topR, r, h, 28), mats.column);
      m.position.set(x, baseH + h / 2, z);
      // 侧脚: columns lean inward, 1/100 front-back and 8/1000 side
      if (opts.cejiao) {
        m.rotation.z = (x > 0 ? -1 : 1) * D.cejiao.side * (Math.abs(x) > 1e-6 ? 1 : 0);
        m.rotation.x = (z > 0 ? 1 : -1) * D.cejiao.front * (Math.abs(z) > 1e-6 ? 1 : 0);
      }
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      // 柱础: a square 础石 slab with the 古镜 drum on it
      var ps = new THREE.Mesh(new THREE.BoxGeometry(r * 4.0, r * 0.35, r * 4.0), mats.plinth);
      ps.position.set(x, baseH + r * 0.175 - 0.002, z);
      ps.castShadow = true; ps.receiveShadow = true;
      g.add(ps);
      var pl = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.32, r * 1.7, r * 0.55, 28), mats.plinth);
      pl.position.set(x, baseH + r * 0.35 + r * 0.275, z);
      pl.castShadow = true; pl.receiveShadow = true;
      g.add(pl);
    });
  });

  // 额枋: on a 大式 hall the 大额枋 sits flush with the column tops, 由额垫板
  // and 小额枋 below it; on a 小式 hall a single 檐枋.
  var colTop = baseH + colH;
  var beams = opts.daShi
    ? [{ h: 6.6 * u, t: 5.4 * u, kind: 'beam' }, { h: 2.0 * u, t: 1.2 * u, kind: 'board' }, { h: 4.8 * u, t: 4.0 * u, kind: 'small' }]
    : [{ h: 4.8 * u, t: 3.8 * u, kind: 'beam' }];
  var y = colTop;
  var tiers = [];
  beams.forEach(function (b) { tiers.push({ top: y, h: b.h, t: b.t, kind: b.kind }); y -= b.h; });
  var beamBottom = y;
  tiers.forEach(function (b) {
    var mat = b.kind === 'board' ? mats.board : mats.beam;
    [zs[0], zs[zs.length - 1]].forEach(function (z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + r * 0.6, b.h, b.t), mat);
      m.position.set(0, b.top - b.h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    });
    [xs[0], xs[xs.length - 1]].forEach(function (x) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(b.t, b.h, hd * 2 + r * 0.6), mat);
      m.position.set(x, b.top - b.h / 2, 0); m.castShadow = true; m.receiveShadow = true; g.add(m);
    });
  });

  // 彩画, painted bay by bay on the outward face of each member
  if (opts.caihua) {
    var cols = opts.colours;
    function runs(axes, fixed, isX, outSign) {
      for (var b = 0; b < axes.length - 1; b++) {
        var a0 = axes[b] + r * 0.98, a1 = axes[b + 1] - r * 0.98, L = a1 - a0, c = (a0 + a1) / 2;
        if (L <= r) continue;
        tiers.forEach(function (t, ti) {
          var tex = TEXGEN.caihuaTexture({
            grade: opts.grade, kind: t.kind, len: L / t.h,
            qing: cols.qing, lv: cols.lv, red: cols.red,
            // 青绿相间: neighbouring bays swap, and the 大 and 小额枋 of one bay swap
            swap: ((b + ti) % 2) === 1
          });
          var off = t.t / 2 + 0.0012;
          var yy = t.top - t.h / 2;
          if (isX) paintedPlane(L, t.h * 0.98, tex, g, fixed + outSign * off, yy, c, outSign * Math.PI / 2);
          else paintedPlane(L, t.h * 0.98, tex, g, c, yy, fixed + outSign * off, outSign > 0 ? 0 : Math.PI);
        });
      }
    }
    runs(xs, zs[zs.length - 1], false, 1);
    runs(xs, zs[0], false, -1);
    runs(zs, xs[xs.length - 1], true, 1);
    runs(zs, xs[0], true, -1);
  }

  // 雀替: the scrolled bracket under the beam where it lands on a column
  var qH = 4.2 * u, qT = 2.4 * u, yQ = beamBottom;
  function quetiGeo(len) {
    var s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(len, 0);
    s.lineTo(len, -qH * 0.18);
    s.quadraticCurveTo(len * 0.62, -qH * 0.22, len * 0.42, -qH * 0.5);
    s.quadraticCurveTo(len * 0.30, -qH * 0.72, len * 0.16, -qH * 0.66);
    s.quadraticCurveTo(len * 0.06, -qH * 0.95, 0, -qH);
    s.lineTo(0, 0);
    var eg = new THREE.ExtrudeGeometry(s, { depth: qT, bevelEnabled: true, bevelThickness: qT * 0.08, bevelSize: qT * 0.08, bevelSegments: 1 });
    eg.translate(0, 0, -qT / 2);
    return eg;
  }
  function addQueti(len, px, pz, dir, alongZ) {
    if (len <= 1e-4) return;
    var m = new THREE.Mesh(quetiGeo(len), mats.queti);
    m.position.set(px, yQ, pz);
    if (alongZ) m.rotation.y = (dir > 0) ? -Math.PI / 2 : Math.PI / 2;
    else if (dir < 0) m.rotation.y = Math.PI;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  [zs[0], zs[zs.length - 1]].forEach(function (z) {
    for (var qi = 0; qi < xs.length - 1; qi++) {
      var L = Math.min((xs[qi + 1] - xs[qi]) * 0.22, qH * 2.2);
      addQueti(L, xs[qi] + r * 0.5, z, 1, false);
      addQueti(L, xs[qi + 1] - r * 0.5, z, -1, false);
    }
  });
  [xs[0], xs[xs.length - 1]].forEach(function (x) {
    for (var qj = 0; qj < zs.length - 1; qj++) {
      var L2 = Math.min((zs[qj + 1] - zs[qj]) * 0.22, qH * 2.2);
      addQueti(L2, x, zs[qj] + r * 0.5, 1, true);
      addQueti(L2, x, zs[qj + 1] - r * 0.5, -1, true);
    }
  });

  g.userData.xs = xs; g.userData.zs = zs;
  g.userData.colTop = colTop; g.userData.beamBottom = beamBottom;
  return g;
}

// ----------------------------------------------------------------------------
//  斗栱 — 踩 by 踩. Each set steps out 3 斗口 per 拽架: 翘 for the first,
//  昂 above, 耍头 on top, with 瓜栱 / 万栱 / 厢栱 crossing the arms at every
//  step and 升 / 十八斗 carrying them. Continuous 正心枋, 拽枋 and 挑檐枋 tie
//  the sets together and the 挑檐桁 they carry is where the rafters land.
//  Sets sit on the column centrelines (柱头科) and divide each bay into whole
//  攒当 of about 11 斗口 -- by bay, so the unequal 明间 / 次间 / 梢间 widths
//  are honoured instead of dividing the facade evenly.
// ----------------------------------------------------------------------------
function dougongTemplate(u, steps, corner) {
  // returns [{ geo, x, y, z, ry, alt }] in set-local coordinates (z outward)
  var P = [];
  function box(w, h, d, x, y, z, alt) { P.push({ geo: new THREE.BoxGeometry(w, h, d), x: x, y: y, z: z, alt: alt }); }
  function dou(w, h, d, x, y, z, alt) {
    // 斗 and 升: square mouth on a tapered foot
    P.push({ geo: new THREE.BoxGeometry(w, h * 0.6, d), x: x, y: y + h * 0.2, z: z, alt: alt });
    P.push({ geo: frustumGeo(w * 0.98, w * 0.72, h * 0.4), x: x, y: y - h * 0.3, z: z, alt: alt });
  }
  // 坐斗
  dou(3 * u, 2 * u, 3 * u, 0, u, 0, true);
  var y0 = 2 * u;                         // top of the 坐斗
  var lay = function (k) { return y0 + k * 2 * u; };
  for (var k = 0; k <= steps; k++) {
    var yb = lay(k);
    // the arm reaching out of the wall plane, one 拽架 further each layer
    var reach = 3 * u * Math.min(k + 1, steps);
    var isTop = k === steps;
    if (!isTop) {
      if (k === 0) box(u, 2 * u, reach + 2.2 * u, 0, yb + u, (reach - 2.2 * u) / 2 + 0.9 * u, false);
      else {
        // 昂: a beak dropping out and down past the step it serves
        var s = new THREE.Shape(), z0 = -2.2 * u, z1 = reach;
        s.moveTo(z0, 0); s.lineTo(z1 - 0.3 * u, 0); s.lineTo(z1 + 1.9 * u, -1.15 * u);
        s.lineTo(z1 + 2.35 * u, -1.0 * u); s.lineTo(z1 + 0.9 * u, 2 * u); s.lineTo(z0, 2 * u); s.closePath();
        var eg = new THREE.ExtrudeGeometry(s, { depth: u, bevelEnabled: false });
        eg.translate(0, 0, -u / 2);
        eg.rotateY(-Math.PI / 2);          // shape x -> set z
        P.push({ geo: eg, x: 0, y: yb, z: 0, alt: false });
      }
    } else {
      // 耍头 with its 蚂蚱头 cut end, the top of the stack
      var s2 = new THREE.Shape(), r0 = -2.2 * u, r1 = 3 * u * steps + 2.6 * u;
      s2.moveTo(r0, 0); s2.lineTo(r1 - 1.1 * u, 0); s2.lineTo(r1, 0.7 * u); s2.lineTo(r1 - 0.25 * u, 2 * u);
      s2.lineTo(r0, 2 * u); s2.closePath();
      var eg2 = new THREE.ExtrudeGeometry(s2, { depth: u, bevelEnabled: false });
      eg2.translate(0, 0, -u / 2);
      eg2.rotateY(-Math.PI / 2);
      P.push({ geo: eg2, x: 0, y: yb, z: 0, alt: false });
    }
    // crossing 栱 at each step this layer reaches
    for (var j = 0; j <= Math.min(k, steps); j++) {
      var z = 3 * u * j;
      var len = 0;
      if (j === 0) len = k === 0 ? 6.2 * u : k === 1 ? 9.2 * u : 0;          // 正心瓜栱 / 正心万栱
      else if (j === steps) len = (k === steps) ? 7.2 * u : (k === j ? 6.2 * u : 0);   // 厢栱 on the outermost
      else len = (k === j) ? 6.2 * u : (k === j + 1) ? 9.2 * u : 0;          // 单才瓜栱 / 万栱
      if (!len) continue;
      var th = j === 0 ? 1.24 * u : u;
      box(len, 1.4 * u, th, 0, yb + 0.7 * u, z, false);
      // 升 at both ends of the 栱
      [-1, 1].forEach(function (sd) {
        dou(1.3 * u, u, 1.6 * u, sd * (len / 2 - 0.75 * u), yb + 1.4 * u + 0.5 * u, z, true);
      });
    }
    // 十八斗 on the arm at each step it carries
    if (k < steps) dou(1.8 * u, u, 1.5 * u, 0, yb + 2 * u + 0.5 * u, 3 * u * (k + 1), true);
  }
  if (corner) {
    // 角科: a 斜昂 along the diagonal, longer by root two
    var dl = 3 * u * steps * Math.SQRT2 + 3.2 * u;
    var sd2 = new THREE.Shape();
    sd2.moveTo(-2 * u, 0); sd2.lineTo(dl - 0.4 * u, 0); sd2.lineTo(dl + 1.8 * u, -1.2 * u);
    sd2.lineTo(dl + 2.2 * u, -1.0 * u); sd2.lineTo(dl + 0.8 * u, 2 * u); sd2.lineTo(-2 * u, 2 * u); sd2.closePath();
    var dg = new THREE.ExtrudeGeometry(sd2, { depth: 1.2 * u, bevelEnabled: false });
    dg.translate(0, 0, -0.6 * u);
    dg.rotateY(-Math.PI / 4);              // shape x -> the diagonal between +x and +z
    P.push({ geo: dg, x: 0, y: lay(steps - 1), z: 0, alt: false });
  }
  return P;
}

function buildDougong(S, colTop, mats, steps) {
  var D = S.D, scale = S.scale, u = S.u;
  var g = new THREE.Group();
  var hw = (D.totalWidth * scale) / 2, hd = (D.totalDepth * scale) / 2;
  var xs = bayAxes(D, scale), zs = depthAxes(D, scale);
  // 平板枋: the plate the sets stand on
  var pbH = 2 * u, pbW = 3.5 * u;
  [[0, hd, hw * 2 + pbW, pbW], [0, -hd, hw * 2 + pbW, pbW]].forEach(function (b) {
    part(new THREE.BoxGeometry(b[2], pbH, b[3]), mats.plate, b[0], colTop + pbH / 2, b[1], 0, g);
  });
  [[hw, 0], [-hw, 0]].forEach(function (b) {
    part(new THREE.BoxGeometry(pbW, pbH, hd * 2 + pbW), mats.plate, b[0], colTop + pbH / 2, b[1], 0, g);
  });
  var base = colTop + pbH;
  var tpl = dougongTemplate(u, steps, false);
  var tplCorner = dougongTemplate(u, steps, true);
  var parity = 0;
  function place(x, z, ry, P) {
    var grp = new THREE.Group();
    grp.position.set(x, base, z);
    grp.rotation.y = ry;
    var even = (parity++ % 2) === 0;
    P.forEach(function (pp) {
      // 青绿: arms and blocks swap colours set to set
      var mat = pp.alt ? (even ? mats.dgB : mats.dgA) : (even ? mats.dgA : mats.dgB);
      part(pp.geo, mat, pp.x, pp.y, pp.z, pp.ry || 0, grp);
    });
    g.add(grp);
  }
  // rotation that sends set-local +z to the side's outward normal
  var RY = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };
  var zan = 11 * u;
  function along(axes, cb) {
    for (var b = 0; b < axes.length - 1; b++) {
      var L = axes[b + 1] - axes[b], n = Math.max(1, Math.round(L / zan));
      for (var i = (b === 0 ? 1 : 0); i < n; i++) cb(axes[b] + L * i / n);
    }
  }
  along(xs, function (x) { place(x, hd, RY.front, tpl); place(x, -hd, RY.back, tpl); });
  along(zs, function (z) { place(hw, z, RY.right, tpl); place(-hw, z, RY.left, tpl); });
  // 角科 at the four corners: the set for both faces plus the diagonal 昂
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
    var x = s[0] * hw, z = s[1] * hd;
    var ryF = s[1] > 0 ? RY.front : RY.back, ryS = s[0] > 0 ? RY.right : RY.left;
    place(x, z, ryF, tpl);
    place(x, z, ryS, tpl.filter(function (p) { return p.geo.parameters === undefined || p.y > 2 * u; }));
    // the diagonal: tplCorner's last part points between local +x and +z
    var diag = tplCorner[tplCorner.length - 1];
    var grp = new THREE.Group();
    grp.position.set(x, base, z);
    // local diagonal is (+x,+z) at 45 deg; rotate to this corner
    grp.rotation.y = s[0] > 0 ? (s[1] > 0 ? 0 : Math.PI / 2) : (s[1] > 0 ? -Math.PI / 2 : Math.PI);
    part(diag.geo, mats.dgA, diag.x, diag.y, diag.z, 0, grp);
    g.add(grp);
  });

  // continuous members: 正心枋 on the wall plane, 拽枋 at each inner step,
  // 挑檐枋 + 挑檐桁 at the outermost
  var top = base + 2 * u + (steps + 1) * 2 * u;
  var zx = 3 * u * steps;
  function ring(offset, y0, h, t, mat) {
    part(new THREE.BoxGeometry((hw + offset) * 2 + t, h, t), mat, 0, y0 + h / 2, hd + offset, 0, g);
    part(new THREE.BoxGeometry((hw + offset) * 2 + t, h, t), mat, 0, y0 + h / 2, -(hd + offset), 0, g);
    part(new THREE.BoxGeometry(t, h, (hd + offset) * 2 + t), mat, hw + offset, y0 + h / 2, 0, 0, g);
    part(new THREE.BoxGeometry(t, h, (hd + offset) * 2 + t), mat, -(hw + offset), y0 + h / 2, 0, 0, g);
  }
  // 正心枋 from the 正心万栱 up to the top
  ring(0, base + 2 * u + 4 * u, top - (base + 2 * u + 4 * u), 1.24 * u, mats.dgA);
  for (var j = 1; j < steps; j++) ring(3 * u * j, base + 2 * u + (j + 2) * 2 * u - 0.6 * u, 2 * u, u, mats.dgB);
  ring(zx, top - 2 * u, 2 * u, u, mats.dgA);
  // 挑檐桁 -- round, on the 挑檐枋
  var rP = 1.5 * u;
  [[0, hd + zx, hw + zx, true], [0, -(hd + zx), hw + zx, true], [hw + zx, 0, hd + zx, false], [-(hw + zx), 0, hd + zx, false]].forEach(function (b) {
    var c = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, b[2] * 2 + rP * 2, 14), mats.dgA);
    if (b[3]) c.rotation.z = Math.PI / 2; else c.rotation.x = Math.PI / 2;
    c.position.set(b[0], top + rP * 0.9, b[1]);
    c.castShadow = true; c.receiveShadow = true;
    g.add(c);
  });
  // 垫栱板: red boards closing the wall plane between the sets
  var bh = 6 * u;
  ring(-0.7 * u, base + 2 * u, bh, 0.35 * u, mats.board);

  g.userData.base = base;
  g.userData.top = top + rP * 1.8;             // top of the 挑檐桁
  g.userData.out = zx;
  return g;
}

// ----------------------------------------------------------------------------
//  墙 — red 灰 walls on a grey-brick 下碱 a third of the column high
// ----------------------------------------------------------------------------
function buildWalls(hw, hd, baseH, wallTop, mats, colR, opts) {
  var g = new THREE.Group();
  var r = colR || 0.08;
  var wh = wallTop - baseH, t = r * 1.3, inset = r * 0.15;
  var dj = (opts && opts.dijian) || wh * 0.33;
  var dt = t * 1.18;
  function wall(w, d, x, z) {
    part(new THREE.BoxGeometry(w, wh - dj, d), mats.wall, x, baseH + dj + (wh - dj) / 2, z, 0, g);
    part(new THREE.BoxGeometry(w + (w > d ? 0 : dt - t), dj, d + (d > w ? 0 : dt - t)), mats.dijian, x, baseH + dj / 2, z, 0, g);
  }
  wall((hw - inset) * 2, t, 0, -(hd - inset));
  [-1, 1].forEach(function (s) { wall(t, (hd - inset) * 2, s * (hw - inset), 0); });
  return g;
}

// ----------------------------------------------------------------------------
//  槅扇 — one set per bay, filling the clear opening between the 抱框 posts.
//  五抹头 doors: 下绦环板, 裙板, 中绦环板, 槅心, 上绦环板, with a 横披 transom
//  above the 中槛. Outer bays are 槛窗 on a brick 槛墙. The 槅心 is the 菱花
//  lattice texture, cut out, with dark glazing behind -- which is how a hall
//  front actually reads in daylight: gilt lattice over a dark interior.
// ----------------------------------------------------------------------------
function buildLattice(S, hd, baseH, topY, mats, colR, opts) {
  var D = S.D, scale = S.scale, M = S.M;
  var g = new THREE.Group();
  var xs = bayAxes(D, scale);
  var bays = xs.length - 1;
  var r = colR || 0.08;
  var z = hd - r * 0.15;
  var fr = 0.085 * M;                       // stile / rail width
  var depth = 0.07 * M;
  var centre = (bays - 1) / 2;
  var y0 = baseH;
  var sill = 0.22 * M;                      // 下槛
  var top = topY;
  var opening = top - y0;
  var transom = Math.min(opening * 0.2, 1.1 * M);
  var midRail = top - transom;              // 中槛

  function frame(w, h, x, y) { part(new THREE.BoxGeometry(w, h, depth), mats.frame, x, y, z + depth * 0.1, 0, g); }
  function grid(w, h, x, y) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.grid);
    m.position.set(x, y, z + depth * 0.05);
    m.castShadow = false; m.receiveShadow = true;
    g.add(m);
    var gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.glass);
    gl.position.set(x, y, z - depth * 0.3);
    gl.receiveShadow = true;
    g.add(gl);
  }
  function panel(w, h, x, y, rich) {
    part(new THREE.BoxGeometry(w, h, depth * 0.6), mats.frame, x, y, z - depth * 0.1, 0, g);
    if (rich) {
      // gilt edging round a raised centre: the carved 裙板 of a palace door
      part(new THREE.BoxGeometry(w * 0.84, h * 0.76, depth * 0.08), mats.gold, x, y, z + depth * 0.22, 0, g);
      part(new THREE.BoxGeometry(w * 0.76, h * 0.62, depth * 0.1), mats.frame, x, y, z + depth * 0.25, 0, g);
    }
  }

  for (var b = 0; b < bays; b++) {
    var x0 = xs[b] + r * 0.95, x1 = xs[b + 1] - r * 0.95;
    var bw = 0.12 * M;                      // 抱框
    frame(bw, opening, x0 + bw / 2, y0 + opening / 2);
    frame(bw, opening, x1 - bw / 2, y0 + opening / 2);
    x0 += bw; x1 -= bw;
    var clear = x1 - x0, cx = (x0 + x1) / 2;
    if (clear < fr * 6) continue;
    frame(clear, fr * 1.4, cx, top - fr * 0.7);          // 上槛
    frame(clear, fr * 1.3, cx, midRail);                 // 中槛
    // 横披: fixed lattice over the doors
    var tH = top - fr * 1.4 - (midRail + fr * 0.65);
    var tn = Math.max(1, Math.round(clear / (1.1 * M)));
    for (var ti = 0; ti < tn; ti++) {
      var tw = clear / tn, tx = x0 + tw * (ti + 0.5);
      grid(tw - fr, tH - fr * 0.2, tx, midRail + fr * 0.65 + tH / 2);
      if (ti) frame(fr, tH, x0 + tw * ti, midRail + fr * 0.65 + tH / 2);
    }

    var isDoor = Math.abs(b - centre) <= (bays >= 7 ? 1 : 0) || bays <= 3;
    var lowY = y0 + sill;
    frame(clear, sill, cx, y0 + sill / 2);              // 下槛
    var leafTop = midRail - fr * 0.65;
    var lowTop = lowY;
    if (!isDoor) {
      // 槛墙 brick under the 槛窗
      var kq = (leafTop - lowY) * 0.36;
      part(new THREE.BoxGeometry(clear, kq, depth * 2.2), mats.dijian, cx, lowY + kq / 2, z - depth * 0.3, 0, g);
      frame(clear, fr, cx, lowY + kq + fr / 2);          // 榻板 / 风槛
      lowTop = lowY + kq + fr;
    }
    var Hl = leafTop - lowTop;
    var leaves = Math.max(2, 2 * Math.round(clear / (0.95 * M) / 2));
    var lw = clear / leaves;
    for (var L = 0; L < leaves; L++) {
      var lx = x0 + lw * (L + 0.5);
      // rails: fractions of the leaf height, bottom to top
      var rails = isDoor ? [0, 0.07, 0.31, 0.38, 0.93, 1.0] : [0, 0.11, 0.89, 1.0];
      var bands = isDoor
        ? [['p', 0, 0.07], ['q', 0.07, 0.31], ['p', 0.31, 0.38], ['g', 0.38, 0.93], ['p', 0.93, 1.0]]
        : [['p', 0, 0.11], ['g', 0.11, 0.89], ['p', 0.89, 1.0]];
      bands.forEach(function (bd) {
        var ya = lowTop + bd[1] * Hl + fr / 2, yb = lowTop + bd[2] * Hl - fr / 2;
        var hh = yb - ya;
        if (hh <= 0) return;
        if (bd[0] === 'g') grid(lw - fr, hh, lx, (ya + yb) / 2);
        else panel(lw - fr, hh, lx, (ya + yb) / 2, bd[0] === 'q' && opts.rich);
      });
      rails.forEach(function (f) { frame(lw, fr, lx, lowTop + f * Hl); });
      frame(fr, Hl, x0 + lw * L + fr / 2, lowTop + Hl / 2);
      frame(fr, Hl, x0 + lw * (L + 1) - fr / 2, lowTop + Hl / 2);
      // 面叶: gilt hinge plates on the stiles of a palace door
      if (opts.rich && isDoor) {
        [0.31, 0.38, 0.93].forEach(function (f) {
          part(new THREE.BoxGeometry(fr * 1.6, fr * 1.2, depth * 0.3), mats.gold, x0 + lw * (L + 1) - fr / 2, lowTop + f * Hl, z + depth * 0.62, 0, g);
        });
      }
    }
  }
  return g;
}
