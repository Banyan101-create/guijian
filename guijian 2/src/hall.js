function buildBase(hw, hd, h, tiers, mat, trimMat) {
  var g = new THREE.Group();
  for (var i = 0; i < tiers; i++) {
    var shrink = i * 0.22;
    var w = (hw + 0.65) - shrink, d = (hd + 0.65) - shrink;
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
  }
  return g;
}

function buildColumns(D, scale, baseH, mat, beamMat, plinthMat, useShengqi, useCejiao) {
  var g = new THREE.Group();
  var colH = D.colH * scale, r = (D.colDia * scale) / 2;
  var topR = (D.colTopDia * scale) / 2;                       // 收分 entasis
  var hw = (D.totalWidth * scale) / 2, hd = (D.totalDepth * scale) / 2;

  // column x positions from the real bay widths, not even division
  var xs = [-hw], acc = -hw;
  for (var i = 0; i < D.bayWidths.length; i++) { acc += D.bayWidths[i] * scale; xs.push(acc); }

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

      var geo = new THREE.CylinderGeometry(topR, r, h, 14);
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x, baseH + h/2, z);

      // 侧脚: columns lean inward, 1/100 front-back and 8/1000 side
      if (useCejiao) {
        m.rotation.z =  (x > 0 ? -1 : 1) * D.cejiao.side  * (Math.abs(x) > 1e-6 ? 1 : 0);
        m.rotation.x =  (z > 0 ?  1 : -1) * D.cejiao.front * (Math.abs(z) > 1e-6 ? 1 : 0);
      }
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);

      var pl = new THREE.Mesh(new THREE.CylinderGeometry(r*1.75, r*1.95, r*1.1, 16), plinthMat);
      pl.position.set(x, baseH + r*0.55, z);
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
  g.userData.xs = xs; g.userData.zs = zs;
  return g;
}

// 斗拱 dougong bracket band under the eave
function buildDougong(hw, hd, y, mat) {
  var g = new THREE.Group();
  var unit = 0.13;
  var blockGeo = new THREE.BoxGeometry(unit*1.5, unit*0.55, unit*1.5);
  var armGeo = new THREE.BoxGeometry(unit*3.4, unit*0.42, unit*0.6);
  var armGeoZ = new THREE.BoxGeometry(unit*0.6, unit*0.42, unit*3.4);
  var spacing = unit * 5.2;

  function bracketAt(x, z, rotY) {
    var b = new THREE.Group();
    var d0 = new THREE.Mesh(blockGeo, mat);
    b.add(d0);
    for (var lvl = 1; lvl <= 2; lvl++) {
      var arm = new THREE.Mesh(rotY ? armGeoZ : armGeo, mat);
      arm.position.y = lvl * unit * 0.62;
      arm.scale.setScalar(1 + lvl*0.16);
      b.add(arm);
      var blk = new THREE.Mesh(blockGeo, mat);
      blk.position.y = lvl * unit * 0.62 + unit*0.3;
      blk.scale.setScalar(0.85);
      b.add(blk);
    }
    b.position.set(x, y, z);
    b.traverse(function(m){ if(m.isMesh){ m.castShadow = true; } });
    return b;
  }

  g.userData.height = 2 * unit * 0.62 + unit * 0.3 + unit * 0.275;
  var nx = Math.max(3, Math.floor((hw*2) / spacing));
  var nz = Math.max(2, Math.floor((hd*2) / spacing));
  for (var i = 0; i <= nx; i++) {
    var x = -hw + (i/nx) * hw*2;
    g.add(bracketAt(x, hd, false));
    g.add(bracketAt(x, -hd, false));
  }
  for (var k = 1; k < nz; k++) {
    var z = -hd + (k/nz) * hd*2;
    g.add(bracketAt(hw, z, true));
    g.add(bracketAt(-hw, z, true));
  }
  return g;
}

function buildWalls(hw, hd, baseH, colH, mat, colR) {
  var g = new THREE.Group();
  // sit flush against the column centreline so no gap opens between wall and column
  var wh = colH * 0.82, t = 0.09, inset = (colR || 0.08) * 0.5;
  var back = new THREE.Mesh(new THREE.BoxGeometry((hw-inset)*2, wh, t), mat);
  back.position.set(0, baseH + wh/2, -(hd-inset));
  g.add(back);
  [-1, 1].forEach(function(s){
    var side = new THREE.Mesh(new THREE.BoxGeometry(t, wh, (hd-inset)*2), mat);
    side.position.set(s*(hw-inset), baseH + wh/2, 0);
    g.add(side);
  });
  g.traverse(function(m){ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// 槅扇 lattice door/window screens across the front bays
function buildLattice(hw, hd, baseH, colH, bays, frameMat, paperMat, colR) {
  var g = new THREE.Group();
  var inset = (colR || 0.08) * 0.5;
  var z = hd - inset;
  var wh = colH * 0.78;
  var y0 = baseH;
  var span = (hw - inset) * 2;
  var bayW = span / (bays - 1);
  var panelW = bayW * 0.86;
  var fr = 0.035;

  var centre = Math.floor((bays - 1) / 2);
  for (var b = 0; b < bays - 1; b++) {
    var cx = -(hw - inset) + bayW * (b + 0.5);
    var isDoor = (b === centre) || (bays >= 7 && Math.abs(b - centre) === 1);
    // paper/screen backing
    var back = new THREE.Mesh(new THREE.BoxGeometry(panelW, wh, 0.02), paperMat);
    back.position.set(cx, y0 + wh/2, z);
    g.add(back);
    // outer frame
    [[0, wh/2],[0, -wh/2]].forEach(function(o){
      var h = new THREE.Mesh(new THREE.BoxGeometry(panelW, fr*1.6, fr*2.2), frameMat);
      h.position.set(cx + o[0], y0 + wh/2 + o[1], z);
      g.add(h);
    });
    [[-panelW/2, 0],[panelW/2, 0]].forEach(function(o){
      var vb = new THREE.Mesh(new THREE.BoxGeometry(fr*1.6, wh, fr*2.2), frameMat);
      vb.position.set(cx + o[0], y0 + wh/2, z);
      g.add(vb);
    });
    // doors run their lattice much lower than windows
    var gridTop = y0 + wh*0.97, gridBot = y0 + (isDoor ? wh*0.20 : wh*0.34);
    var cols = 5, rows = 7;
    for (var c = 1; c < cols; c++) {
      var vx = cx - panelW/2 + (panelW/cols)*c;
      var vm = new THREE.Mesh(new THREE.BoxGeometry(fr*0.75, gridTop-gridBot, fr*1.5), frameMat);
      vm.position.set(vx, (gridTop+gridBot)/2, z + 0.006);
      g.add(vm);
    }
    for (var rr = 1; rr < rows; rr++) {
      var hy = gridBot + ((gridTop-gridBot)/rows)*rr;
      var hm = new THREE.Mesh(new THREE.BoxGeometry(panelW, fr*0.75, fr*1.5), frameMat);
      hm.position.set(cx, hy, z + 0.006);
      g.add(hm);
    }
    if (isDoor) {
      // central meeting stile between the door leaves
      var stile = new THREE.Mesh(new THREE.BoxGeometry(fr*2.0, wh, fr*2.6), frameMat);
      stile.position.set(cx, y0 + wh/2, z + 0.008);
      g.add(stile);
      var kick = new THREE.Mesh(new THREE.BoxGeometry(panelW*0.94, wh*0.15, fr*2.4), frameMat);
      kick.position.set(cx, y0 + wh*0.085, z + 0.004);
      g.add(kick);
    } else {
      var apron = new THREE.Mesh(new THREE.BoxGeometry(panelW*0.94, wh*0.28, fr*2.4), frameMat);
      apron.position.set(cx, y0 + wh*0.17, z + 0.004);
      g.add(apron);
    }
  }
  g.traverse(function(m){ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// 踏跺 front steps
function buildSteps(hw, baseH, tiers, mat, cheekMat) {
  var g = new THREE.Group();
  var n = Math.max(3, Math.round(baseH / 0.15));
  var w = Math.min(hw * 0.55, 1.9);
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
    ch.rotation.y = Math.PI/2;
    // extrude runs along +Z then rotates to -X, so shift by the extrude depth
    ch.position.set(sd * (w + 0.08) + 0.08, 0, 0);
    ch.castShadow = true; ch.receiveShadow = true;
    g.add(ch);
  });
  return g;
}

