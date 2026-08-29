// margin is the apron the 台明 projects beyond the columns; it has to scale
// with the building or a slender 密檐 tower ends up on a plinth four times its
// own width.
function buildBase(hw, hd, h, tiers, mat, trimMat, margin) {
  var g = new THREE.Group();
  // NB: not `m` -- the tier mesh below already claims that name, and `var` is
  // function-scoped, so the second tier would multiply by a Mesh and go NaN.
  var mg = (margin === undefined) ? 0.65 : margin;
  for (var i = 0; i < tiers; i++) {
    var shrink = i * mg * 0.34;
    var w = (hw + mg) - shrink, d = (hd + mg) - shrink;
    var th = h / tiers;
    var m = new THREE.Mesh(new THREE.BoxGeometry(w*2, th*0.82, d*2), mat);
    m.position.y = i*th + th*0.41;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    // moulding cap for each tier (须弥座 profile hint)
    var cap = new THREE.Mesh(new THREE.BoxGeometry(w*2 + 0.12, th*0.18, d*2 + 0.12), trimMat);
    cap.position.y = i*th + th*0.91;
    cap.castShadow = true; cap.receiveShadow = true;
    g.add(cap);
    // the last tier wins: this is the surface the columns and balustrade sit on
    g.userData.topHW = w; g.userData.topHD = d;
  }
  return g;
}

// Column centrelines from the real 斗口 bay widths. Everything that has to line
// up with a bay -- columns, 槅扇, 斗栱 -- must read its positions from here.
function bayAxes(D, scale) {
  var xs = [-(D.totalWidth * scale) / 2], acc = xs[0];
  for (var i = 0; i < D.bayWidths.length; i++) { acc += D.bayWidths[i] * scale; xs.push(acc); }
  return xs;
}

function buildColumns(D, scale, baseH, mat, beamMat, plinthMat, useShengqi, useCejiao) {
  var g = new THREE.Group();
  var colH = D.colH * scale, r = (D.colDia * scale) / 2;
  var topR = (D.colTopDia * scale) / 2;                       // 收分 entasis
  var hw = (D.totalWidth * scale) / 2, hd = (D.totalDepth * scale) / 2;

  var xs = bayAxes(D, scale);

  // depth positions from the 步架 step runs
  var zs = [-hd], zacc = -hd;
  for (var k = D.stepRuns.length - 1; k >= 0; k--) { zacc += D.stepRuns[k] * scale; zs.push(zacc); }
  for (var k2 = 0; k2 < D.stepRuns.length; k2++) { zacc += D.stepRuns[k2] * scale; zs.push(zacc); }

  var mid = (xs.length - 1) / 2;
  xs.forEach(function(x, xi) {
    zs.forEach(function(z, zi) {
      var edge = (xi === 0 || xi === xs.length-1 || zi === 0 || zi === zs.length-1);
      if (!edge) return;

      // 生起: columns rise progressively toward the corners
      var rise = useShengqi ? D.shengqi * scale * (Math.abs(xi - mid) / Math.max(mid,1)) : 0;
      var h = colH + rise;

      var geo = new THREE.CylinderGeometry(topR, r, h, 24);
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x, baseH + h/2, z);

      // 侧脚: columns lean inward, 1/100 front-back and 8/1000 side
      if (useCejiao) {
        m.rotation.z =  (x > 0 ? -1 : 1) * D.cejiao.side  * (Math.abs(x) > 1e-6 ? 1 : 0);
        m.rotation.x =  (z > 0 ?  1 : -1) * D.cejiao.front * (Math.abs(z) > 1e-6 ? 1 : 0);
      }
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);

      // 柱础: a square 础石 slab carrying the 鼓镜 drum, not a bare cone
      var ps = new THREE.Mesh(new THREE.BoxGeometry(r*4.0, r*0.55, r*4.0), plinthMat);
      ps.position.set(x, baseH + r*0.275, z);
      ps.castShadow = true; ps.receiveShadow = true;
      g.add(ps);
      var pl = new THREE.Mesh(new THREE.CylinderGeometry(r*1.75, r*1.95, r*1.1, 24), plinthMat);
      pl.position.set(x, baseH + r*1.10, z);
      pl.castShadow = true; pl.receiveShadow = true;
      g.add(pl);
    });
  });

  // 额枋 head tie-beams, sized on the module (10:8 section)
  var bh = D.colDia * scale * 0.8, bt = bh * 0.8;
  var yTop = baseH + colH - bh*0.7;
  [zs[0], zs[zs.length-1]].forEach(function(z){
    var b = new THREE.Mesh(new THREE.BoxGeometry(hw*2, bh, bt), beamMat);
    b.position.set(0, yTop, z); b.castShadow = true; g.add(b);
  });
  [xs[0], xs[xs.length-1]].forEach(function(x){
    var b = new THREE.Mesh(new THREE.BoxGeometry(bt, bh, hd*2), beamMat);
    b.position.set(x, yTop, 0); b.castShadow = true; g.add(b);
  });

  // 雀替: the scrolled bracket stiffening each 额枋 where it lands on a column.
  // Every Qing hall carries them, and without them the beam meets the column as
  // a bare butt joint -- the single detail whose absence reads as "plain box".
  var qH = bh * 1.25, qT = bt * 0.6, yQ = yTop - bh * 0.5;
  function quetiGeo(len) {
    var s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(len, 0);
    s.lineTo(len, -qH * 0.20);
    s.quadraticCurveTo(len * 0.52, -qH * 0.26, len * 0.34, -qH * 0.66);
    s.quadraticCurveTo(len * 0.18, -qH, 0, -qH);
    s.lineTo(0, 0);
    var eg = new THREE.ExtrudeGeometry(s, { depth: qT, bevelEnabled: false });
    eg.translate(0, 0, -qT / 2);
    return eg;
  }
  // local +X is the direction the bracket reaches into the bay; -90 deg about Y
  // sends it to +Z, +90 to -Z, 180 to -X
  function addQueti(len, px, pz, dir, alongZ) {
    if (len <= 1e-4) return;
    var m = new THREE.Mesh(quetiGeo(len), beamMat);
    m.position.set(px, yQ, pz);
    if (alongZ) m.rotation.y = (dir > 0) ? -Math.PI/2 : Math.PI/2;
    else if (dir < 0) m.rotation.y = Math.PI;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  [zs[0], zs[zs.length-1]].forEach(function(z){
    for (var qi = 0; qi < xs.length - 1; qi++) {
      var L = Math.min((xs[qi+1] - xs[qi]) * 0.20, qH * 1.7);
      addQueti(L, xs[qi],   z,  1, false);
      addQueti(L, xs[qi+1], z, -1, false);
    }
  });
  [xs[0], xs[xs.length-1]].forEach(function(x){
    for (var qj = 0; qj < zs.length - 1; qj++) {
      var L2 = Math.min((zs[qj+1] - zs[qj]) * 0.20, qH * 1.7);
      addQueti(L2, x, zs[qj],    1, true);
      addQueti(L2, x, zs[qj+1], -1, true);
    }
  });

  g.userData.xs = xs; g.userData.zs = zs;
  return g;
}

// 斗栱 bracket band under the eave. Every dimension is cut from 斗口 (dk), which
// is what makes the arms clear each other: the longest is 9.4 斗口 inside a 攒当
// of 11. Sizing them off an arbitrary unit is what turns the band into mush.
function buildDougong(hw, hd, y, mat, dk) {
  var g = new THREE.Group();
  var u = dk || 0.026;
  var spacing = 11 * u;                                   // 攒当
  var tiers = 3, tierH = 3.6 * u;                         // 12 斗口 total, per 大式
  var seatGeo = new THREE.BoxGeometry(3.2*u, 2*u, 3.2*u); // 坐斗
  var capGeo  = new THREE.BoxGeometry(1.8*u, 1.0*u, 1.8*u); // 升
  var armX = [], armZ = [], armLen = [];
  for (var t = 0; t < tiers; t++) {
    armLen.push((6.2 + t * 1.6) * u);                     // 瓜栱 → 万栱 → 厢栱
    armX.push(new THREE.BoxGeometry(armLen[t], 1.4*u, 1.25*u));
    armZ.push(new THREE.BoxGeometry(1.25*u, 1.4*u, armLen[t]));
  }

  function bracketAt(x, z, rotY) {
    var b = new THREE.Group();
    var seat = new THREE.Mesh(seatGeo, mat);
    seat.position.y = u;
    b.add(seat);
    for (var t = 0; t < tiers; t++) {
      var yt = 2*u + t * tierH;
      var arm = new THREE.Mesh(rotY ? armZ[t] : armX[t], mat);
      arm.position.y = yt + 0.7*u;
      b.add(arm);
      var reach = armLen[t] / 2 - 0.9*u;
      [-reach, 0, reach].forEach(function(o){
        var c = new THREE.Mesh(capGeo, mat);
        c.position.set(rotY ? 0 : o, yt + 1.9*u, rotY ? o : 0);
        b.add(c);
      });
    }
    b.position.set(x, y, z);
    b.traverse(function(m){ if(m.isMesh){ m.castShadow = true; } });
    return b;
  }

  g.userData.height = 2*u + (tiers - 1) * tierH + 2.4*u;

  // 垫栱板: the boards closing the space between bracket sets. Leave them out
  // and the band is a row of holes you can see the sky through.
  var bandH = g.userData.height;
  var boardX = new THREE.BoxGeometry(hw*2, bandH, 1.2*u);
  var boardZ = new THREE.BoxGeometry(1.2*u, bandH, hd*2);
  [hd, -hd].forEach(function(bz){
    var m = new THREE.Mesh(boardX, mat);
    m.position.set(0, y + bandH/2, bz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  });
  [hw, -hw].forEach(function(bx){
    var m = new THREE.Mesh(boardZ, mat);
    m.position.set(bx, y + bandH/2, 0);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  });

  // one bracket per 攒当, so the 柱头科 land on the column centrelines
  var nx = Math.max(2, Math.round((hw*2) / spacing));
  var nz = Math.max(2, Math.round((hd*2) / spacing));
  for (var i = 0; i <= nx; i++) {
    var bx = -hw + (i/nx) * hw*2;
    g.add(bracketAt(bx, hd, false));
    g.add(bracketAt(bx, -hd, false));
  }
  for (var k = 1; k < nz; k++) {
    var bz = -hd + (k/nz) * hd*2;
    g.add(bracketAt(hw, bz, true));
    g.add(bracketAt(-hw, bz, true));
  }
  return g;
}

function buildWalls(hw, hd, baseH, colH, mat, colR, lowMat) {
  var g = new THREE.Group();
  // sit flush against the column centreline so no gap opens between wall and column,
  // and run right up to the underside of the 额枋 (which buildColumns puts at
  // colH - 1.2 * beam height, beam height being 0.8 * column diameter)
  var r = colR || 0.08;
  var wh = colH - r * 1.92, t = 0.09, inset = r * 0.5;
  var back = new THREE.Mesh(new THREE.BoxGeometry((hw-inset)*2, wh, t), mat);
  back.position.set(0, baseH + wh/2, -(hd-inset));
  g.add(back);
  [-1, 1].forEach(function(s){
    var side = new THREE.Mesh(new THREE.BoxGeometry(t, wh, (hd-inset)*2), mat);
    side.position.set(s*(hw-inset), baseH + wh/2, 0);
    g.add(side);
  });

  // 下碱: the masonry course the plaster wall stands on, set slightly proud.
  // A hall wall that runs plaster straight down to the platform reads as a slab.
  if (lowMat) {
    var dj = wh * 0.22, dt = t * 1.7;
    var bl = new THREE.Mesh(new THREE.BoxGeometry((hw-inset)*2, dj, dt), lowMat);
    bl.position.set(0, baseH + dj/2, -(hd-inset));
    g.add(bl);
    [-1, 1].forEach(function(s){
      var sl = new THREE.Mesh(new THREE.BoxGeometry(dt, dj, (hd-inset)*2), lowMat);
      sl.position.set(s*(hw-inset), baseH + dj/2, 0);
      g.add(sl);
    });
  }
  g.traverse(function(m){ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// 槅扇 door/window screens: one set per structural bay, filling the clear opening
// between that bay's two columns. Bay widths are unequal (77 斗口 at the 明间,
// -11 per bay outward), so the layout has to come off bayAxes, never off an even
// division of the facade.
function buildLattice(D, scale, hd, baseH, colH, frameMat, paperMat, colR) {
  var g = new THREE.Group();
  var xs = bayAxes(D, scale);
  var bays = xs.length - 1;
  var r = colR || 0.08;
  var z = hd - r * 0.5;                       // set behind the column centreline
  var y0 = baseH;
  var top = y0 + colH - r * 1.92;             // underside of the 额枋
  var fr = 0.035;
  var leafTarget = colH * 0.22;               // nominal 槅扇 leaf width
  var cellTarget = colH * 0.075;              // nominal lattice cell, kept constant
  var centre = (bays - 1) / 2;

  for (var b = 0; b < bays; b++) {
    // clear opening: column face to column face
    var x0 = xs[b] + r, x1 = xs[b + 1] - r, cx = (x0 + x1) / 2;
    var clear = x1 - x0;
    if (clear < fr * 6) continue;

    // even leaf count so the meeting stile lands on the bay centreline
    var leaves = Math.max(2, 2 * Math.round(clear / leafTarget / 2));
    var leafW = clear / leaves;

    // 明间 (and its neighbours on a wide hall) are doors; the rest are 槛窗
    var isDoor = Math.abs(b - centre) <= (bays >= 7 ? 1 : 0);
    var bot = y0 + (top - y0) * (isDoor ? 0.0 : 0.34);
    var paneH = top - bot;

    // 槛墙 low wall carrying the window bays
    if (!isDoor) {
      var sill = new THREE.Mesh(new THREE.BoxGeometry(clear, bot - y0, fr * 2.6), frameMat);
      sill.position.set(cx, (y0 + bot) / 2, z);
      sill.receiveShadow = true;
      g.add(sill);
    }

    // 裙板 skirt fills the bottom third of a door leaf; a window is glazed throughout
    var gridBot = bot + paneH * (isDoor ? 0.36 : 0.10);
    var gridTop = top - paneH * 0.10;
    var cols = Math.max(2, Math.round(leafW / cellTarget));
    var cell = leafW / cols;
    var rows = Math.max(2, Math.round((gridTop - gridBot) / cell));

    for (var L = 0; L < leaves; L++) {
      var lx = x0 + leafW * (L + 0.5);

      var back = new THREE.Mesh(new THREE.BoxGeometry(leafW, paneH, 0.02), paperMat);
      back.position.set(lx, (bot + top) / 2, z);
      g.add(back);

      if (isDoor) {
        var skirt = new THREE.Mesh(
          new THREE.BoxGeometry(leafW, gridBot - bot, fr * 2.4), frameMat);
        skirt.position.set(lx, (bot + gridBot) / 2, z + 0.004);
        g.add(skirt);
      }

      // muntins sized off cellTarget so the cells stay square and the same size
      // in every bay, however wide that bay's leaves came out
      for (var c = 1; c < cols; c++) {
        var vm = new THREE.Mesh(
          new THREE.BoxGeometry(fr * 0.75, gridTop - gridBot, fr * 1.5), frameMat);
        vm.position.set(lx - leafW / 2 + cell * c, (gridTop + gridBot) / 2, z + 0.006);
        g.add(vm);
      }
      for (var rr = 1; rr < rows; rr++) {
        var hm = new THREE.Mesh(new THREE.BoxGeometry(leafW, fr * 0.75, fr * 1.5), frameMat);
        hm.position.set(lx, gridBot + ((gridTop - gridBot) / rows) * rr, z + 0.006);
        g.add(hm);
      }
    }

    // 边梃 stile on every leaf edge, the middle one doubled as the meeting stile
    for (var s = 0; s <= leaves; s++) {
      var st = new THREE.Mesh(
        new THREE.BoxGeometry(fr * (s === leaves / 2 ? 2.0 : 1.6), paneH, fr * 2.4), frameMat);
      st.position.set(x0 + leafW * s, (bot + top) / 2, z + 0.008);
      g.add(st);
    }
    // 抹头 rails run the full opening
    [bot, gridBot, gridTop, top].forEach(function(ry){
      var rl = new THREE.Mesh(new THREE.BoxGeometry(clear, fr * 1.6, fr * 2.2), frameMat);
      rl.position.set(cx, ry, z + 0.007);
      g.add(rl);
    });
  }

  g.traverse(function(m){ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// 踏跺 front steps
function buildSteps(halfW, baseH, tiers, mat, cheekMat) {
  var g = new THREE.Group();
  var n = Math.max(3, Math.round(baseH / 0.15));
  var w = halfW;
  var depthEach = 0.24;
  var runTotal = depthEach * n;
  for (var i = 0; i < n; i++) {
    var h = baseH * ((i+1)/n);
    var st = new THREE.Mesh(new THREE.BoxGeometry(w*2, h, depthEach), mat);
    st.position.set(0, h/2, depthEach * (n - i - 0.5));
    st.castShadow = true; st.receiveShadow = true;
    g.add(st);
  }
  // 垂带 sloping side cheeks flanking the flight
  var shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(runTotal, 0);
  shape.lineTo(runTotal, baseH * 0.30);
  shape.lineTo(0, baseH * 1.04);
  shape.lineTo(0, 0);
  var eg = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled:false });
  [-1, 1].forEach(function(sd){
    var ch = new THREE.Mesh(eg, cheekMat);
    // extrude runs along local +X; -90 deg about Y sends it to world +Z, out in
    // front with the flight. +90 sends it to -Z, i.e. buried in the platform.
    ch.rotation.y = -Math.PI/2;
    // the 0.16 of extrude depth lands on -X of the origin, so shift it back
    ch.position.set(sd * (w + 0.08) + 0.08, 0, 0);
    ch.castShadow = true; ch.receiveShadow = true;
    g.add(ch);
  });
  return g;
}

