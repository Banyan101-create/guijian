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

function cornerProximity(n, theta) {
  var sector = (Math.PI * 2) / n;
  var a = ((theta % sector) + sector) % sector;
  var d = Math.min(a, sector - a) / (sector / 2);
  return 1 - d;
}

function profileFrac(u, profile) {
  var last = profile[profile.length-1];
  var span = profile[0].y - last.y || 1;
  var tx = u * (last.x - profile[0].x) + profile[0].x;
  for (var i = 0; i < profile.length-1; i++) {
    var a = profile[i], b = profile[i+1];
    if (tx >= a.x && tx <= b.x) {
      var f = (tx - a.x) / (b.x - a.x || 1);
      var y = a.y + (b.y - a.y) * f;
      return (profile[0].y - y) / span;
    }
  }
  return 1;
}

function buildPolygonRoof(R, n, rise, upturn, ribs, profile, mat, thickness) {
  var ribK = n * Math.max(3, Math.round((ribs||12) / 5));
  var segA = Math.max(n * 12, ribK * 3), segR = 14;
  var pos = [], idx = [], uvs = [];
  var nA = segA + 1;

  function hAt(u, theta) {
    var y = rise * (1 - profileFrac(u, profile));
    var cp = cornerProximity(n, theta);
    y += upturn * Math.pow(cp, 2.2) * Math.max(0, (u - 0.5) / 0.5);
    if (ribs > 0) {
      // tile rows radiate from the apex: one rib every few degrees, amplitude
      // scaled to the roof so it reads at any size
      var K = n * Math.max(3, Math.round(ribs / 5));
      var ribPhase = theta * K;
      y += R * 0.030 * Math.pow(0.5 + 0.5 * Math.cos(ribPhase), 0.45) * Math.min(1, u * 2.2);
    }
    return y;
  }

  for (var j = 0; j <= segR; j++) {
    var u = j / segR;
    for (var i = 0; i <= segA; i++) {
      var th = (i / segA) * Math.PI * 2;
      var rr = polyRadius(R, n, th) * u;
      pos.push(Math.cos(th) * rr, hAt(u, th), Math.sin(th) * rr);
      uvs.push(i / segA, u);
    }
  }
  var nVert = nA * (segR + 1);
  if (thickness > 0) {
    for (var j2 = 0; j2 <= segR; j2++)
      for (var i2 = 0; i2 <= segA; i2++) {
        var b = (j2 * nA + i2) * 3;
        pos.push(pos[b], pos[b+1] - thickness, pos[b+2]);
        uvs.push(i2 / segA, j2 / segR);
      }
  }
  for (var jj = 0; jj < segR; jj++)
    for (var ii = 0; ii < segA; ii++) {
      var a2 = jj*nA+ii, b2 = a2+1, c2 = a2+nA, d2 = c2+1;
      idx.push(a2, c2, b2, b2, c2, d2);
      if (thickness > 0) idx.push(a2+nVert, b2+nVert, c2+nVert, b2+nVert, d2+nVert, c2+nVert);
    }
  if (thickness > 0) {
    for (var e = 0; e < segA; e++) {
      var o0 = segR*nA + e, o1 = o0 + 1;
      idx.push(o0, o1, o0+nVert, o1, o1+nVert, o0+nVert);
    }
  }
  var geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  var m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildPagodaStorey(R, n, height, colDia, colMat, wallMat, railMat, withBalcony) {
  var g = new THREE.Group();
  var colGeo = new THREE.CylinderGeometry(colDia*0.46, colDia*0.5, height, 12);
  for (var k = 0; k < n; k++) {
    var th = (k / n) * Math.PI * 2;
    var x = Math.cos(th) * R, z = Math.sin(th) * R;
    var c = new THREE.Mesh(colGeo, colMat);
    c.position.set(x, height/2, z);
    c.castShadow = true; c.receiveShadow = true;
    g.add(c);
    var th2 = ((k+1) / n) * Math.PI * 2;
    var x2 = Math.cos(th2) * R, z2 = Math.sin(th2) * R;
    var mx = (x+x2)/2, mz = (z+z2)/2;
    var len = Math.sqrt((x2-x)*(x2-x) + (z2-z)*(z2-z)) * 0.9;
    var panel = new THREE.Mesh(new THREE.BoxGeometry(len, height*0.995, colDia*0.35), wallMat);
    panel.position.set(mx, height*0.4975, mz);
    panel.lookAt(new THREE.Vector3(mx*2, height*0.4975, mz*2));
    panel.castShadow = true; panel.receiveShadow = true;
    g.add(panel);

    // 槅扇 lattice window on each face, so storeys are not blank slabs
    var fr = colDia * 0.16;
    var winW = len * 0.62, winH = height * 0.52, winY = height * 0.56;
    var lat = new THREE.Group();
    var outward = new THREE.Vector3(mx*2, winY, mz*2);
    [[0, winH/2],[0, -winH/2]].forEach(function(o){
      var hb = new THREE.Mesh(new THREE.BoxGeometry(winW, fr, fr*1.4), railMat);
      hb.position.set(0, o[1], 0); lat.add(hb);
    });
    [[-winW/2],[winW/2]].forEach(function(o){
      var vb = new THREE.Mesh(new THREE.BoxGeometry(fr, winH, fr*1.4), railMat);
      vb.position.set(o[0], 0, 0); lat.add(vb);
    });
    for (var gx = 1; gx < 4; gx++) {
      var vm = new THREE.Mesh(new THREE.BoxGeometry(fr*0.5, winH*0.94, fr), railMat);
      vm.position.set(-winW/2 + (winW/4)*gx, 0, fr*0.2); lat.add(vm);
    }
    for (var gy = 1; gy < 5; gy++) {
      var hm = new THREE.Mesh(new THREE.BoxGeometry(winW*0.94, fr*0.5, fr), railMat);
      hm.position.set(0, -winH/2 + (winH/5)*gy, fr*0.2); lat.add(hm);
    }
    lat.position.set(mx*1.005, winY, mz*1.005);
    lat.lookAt(outward);
    lat.traverse(function(m){ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
    g.add(lat);
    // 額枋 head beam closing the top of each bay against the roof above
    var beam = new THREE.Mesh(new THREE.BoxGeometry(len*1.04, colDia*0.75, colDia*0.55), colMat);
    beam.position.set(mx, height - colDia*0.42, mz);
    beam.lookAt(new THREE.Vector3(mx*2, height - colDia*0.42, mz*2));
    beam.castShadow = true; beam.receiveShadow = true;
    g.add(beam);
    // 腰檐 sill band at the foot of each storey
    var sill = new THREE.Mesh(new THREE.BoxGeometry(len*1.04, colDia*0.5, colDia*0.6), colMat);
    sill.position.set(mx, colDia*0.3, mz);
    sill.lookAt(new THREE.Vector3(mx*2, colDia*0.3, mz*2));
    sill.castShadow = true; sill.receiveShadow = true;
    g.add(sill);
  }
  if (withBalcony) {
    var rr = R * 1.06, postH = height * 0.155;
    var postGeo = new THREE.BoxGeometry(colDia*0.72, postH, colDia*0.72);
    var steps = n * 2;
    for (var q = 0; q < steps; q++) {
      var th3 = (q / steps) * Math.PI * 2;
      var pr = polyRadius(rr, n, th3);
      var pst = new THREE.Mesh(postGeo, railMat);
      pst.position.set(Math.cos(th3)*pr, postH/2, Math.sin(th3)*pr);
      pst.rotation.y = -th3;
      pst.castShadow = true;
      g.add(pst);
    }
    // handrail + mid rail, plus a solid skirt board along the balcony edge
    [[postH*0.98, colDia*0.55], [postH*0.52, colDia*0.34], [postH*0.10, colDia*0.9]].forEach(function(cfg){
      for (var e2 = 0; e2 < n; e2++) {
        var a1 = (e2/n)*Math.PI*2, a2b = ((e2+1)/n)*Math.PI*2;
        var p1 = new THREE.Vector3(Math.cos(a1)*rr, cfg[0], Math.sin(a1)*rr);
        var p2 = new THREE.Vector3(Math.cos(a2b)*rr, cfg[0], Math.sin(a2b)*rr);
        var seg = new THREE.Mesh(
          new THREE.BoxGeometry(p1.distanceTo(p2)*1.02, cfg[1], colDia*0.42), railMat);
        seg.position.copy(p1).add(p2).multiplyScalar(0.5);
        seg.lookAt(p2); seg.rotateY(Math.PI/2);
        seg.castShadow = true; seg.receiveShadow = true;
        g.add(seg);
      }
    });
  }
  return g;
}

function buildFinial(R, height, mat, goldMat) {
  var g = new THREE.Group();
  var mast = new THREE.Mesh(new THREE.CylinderGeometry(R*0.06, R*0.08, height, 12), mat);
  mast.position.y = height/2;
  g.add(mast);
  var rings = 7;
  for (var i = 0; i < rings; i++) {
    var f = i / rings;
    var rad = R * 0.30 * (1 - f * 0.62);
    var d = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.01, rad), Math.max(0.005, R*0.035), 8, 20), goldMat);
    d.rotation.x = Math.PI/2;
    d.position.y = height * (0.22 + f * 0.55);
    g.add(d);
  }
  var bead = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.01, R*0.10), 16, 12), goldMat);
  bead.position.y = height * 0.94;
  g.add(bead);
  g.traverse(function(m){ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

function buildPagoda(D, scale, opts, mats) {
  var g = new THREE.Group();
  var n = opts.sides, storeys = opts.storeys;
  var dense = opts.style === 'miyan';
  // 密檐式 towers are markedly more slender than 楼阁式, with one tall base
  // storey then thin stacked eaves (嵩岳寺塔 ~40 m on a ~10 m base = 4:1).
  var R0 = (D.totalWidth * scale) / 2 * (dense ? 0.30 : 1.0);
  var storeyH = D.colH * scale * (dense ? 0.55 : 1.0);
  var profile = solveRoofProfile(Math.max(0.001, D.halfDepth * scale), 1.0, 5);
  var eaveOut = D.eaveOut * scale * (dense ? 0.5 : 1.0);
  var thick = Math.max(0.03, D.purlinDia * scale * 0.5);

  var y = 0, R = R0;
  for (var i = 0; i < storeys; i++) {
    var isFirst = (i === 0);
    var h = dense ? (isFirst ? storeyH * 5.0 : storeyH * 0.34) : storeyH;

    var body = buildPagodaStorey(R, n, h, D.colDia * scale,
      mats.wood, mats.wall, mats.dg, !dense && !isFirst);
    body.position.y = y;
    g.add(body);

    if (opts.dougong) {
      var unit = D.colDia * scale * 0.22;
      for (var k = 0; k < n * 3; k++) {
        var th = (k / (n*3)) * Math.PI * 2;
        var pr = polyRadius(R, n, th);
        var blk = new THREE.Mesh(new THREE.BoxGeometry(unit*1.6, unit*1.5, unit*1.6), mats.dg);
        blk.position.set(Math.cos(th)*pr, y + h + unit*0.7, Math.sin(th)*pr);
        blk.rotation.y = -th;
        blk.castShadow = true;
        g.add(blk);
      }
    }

    var tierRise = (dense ? 0.42 : 0.78) * storeyH;
    var roofY = y + h + (opts.dougong ? D.colDia*scale*0.4 : 0) - thick*0.5;
    var roof = buildPolygonRoof(R + eaveOut, n, tierRise,
      D.cornerRise * scale, opts.ribs, profile, mats.tile, thick);
    roof.position.y = roofY;
    g.add(roof);

    // pale eave band around each tier edge
    var er = R + eaveOut;
    for (var eb = 0; eb < n; eb++) {
      var b1 = (eb/n)*Math.PI*2, b2 = ((eb+1)/n)*Math.PI*2;
      var q1 = new THREE.Vector3(Math.cos(b1)*er, 0, Math.sin(b1)*er);
      var q2 = new THREE.Vector3(Math.cos(b2)*er, 0, Math.sin(b2)*er);
      var band = new THREE.Mesh(
        new THREE.BoxGeometry(q1.distanceTo(q2)*1.02, thick*1.9, thick*1.5), mats.trim);
      band.position.copy(q1).add(q2).multiplyScalar(0.5);
      band.position.y = roofY - thick*0.6;
      band.lookAt(new THREE.Vector3(q2.x, roofY - thick*0.6, q2.z));
      band.rotateY(Math.PI/2);
      band.castShadow = true; band.receiveShadow = true;
      g.add(band);
    }

    y += h + tierRise * (dense ? 0.70 : 0.62);
    R *= dense ? 0.982 : PAGODA_TAPER;   // dense-eave towers taper far more slowly
  }

  var capRise = storeyH * 1.05;
  var cap = buildPolygonRoof(R + eaveOut*0.7, n, capRise,
    D.cornerRise * scale * 0.8, opts.ribs, profile, mats.tile, thick);
  cap.position.y = y;
  g.add(cap);

  var fin = buildFinial(R, storeyH * 1.25, mats.trim, mats.gold);
  fin.position.y = y + capRise;
  g.add(fin);

  g.userData.totalHeight = y + capRise + storeyH * 1.25;
  return g;
}

