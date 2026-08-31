// ============================================================================
//  屋顶坡面 ROOF SECTION
//  The 坡面 curve editor drives this. The profile is a quadratic Bezier from
//  eave to ridge over the unit square; `cx`/`cy` are its control point, and the
//  three multipliers scale the dimensions constants.js derived.
//
//  The defaults reproduce the Qing 举架 coefficient ladder
//  [0.5, 0.62, 0.72, 0.82, 0.92] to within half a percent, so an untouched
//  curve builds exactly the roof this generator built before the editor
//  existed. Everything else in the file reads the profile through profileH(),
//  which needs x strictly ascending -- hence the clamps: x(t) stays monotonic
//  only while cx is inside (0, 1), and y likewise for cy.
// ============================================================================
var ROOF_CURVE = { cx: 0.5118, cy: 0.3276, rise: 1, eave: 1, lift: 1 };

function solveRoofProfile(halfDepth, roofHeight, steps) {
  var cx = Math.min(0.95, Math.max(0.05, ROOF_CURVE.cx));
  var cy = Math.min(0.95, Math.max(0.00, ROOF_CURVE.cy));
  // sample finer than the old five-step ladder: the curve is now continuous and
  // can be bent hard, and profileH() only interpolates linearly between samples
  var n = Math.max(steps || 5, 12);
  var pts = [];
  for (var i = 0; i <= n; i++) {
    var t = i / n, mt = 1 - t;
    pts.push({ x: 2 * mt * t * cx + t * t,
               y: 2 * mt * t * cy + t * t });
  }
  // same contract as before: ordered ridge -> eave, x ascending 0 -> halfDepth,
  // y descending roofHeight -> 0
  return pts.map(function (p) {
    return { x: halfDepth - p.x * halfDepth, y: p.y * roofHeight };
  }).reverse();
}

function profileH(t, profile, halfDepth) {
  var tx = Math.min(1, Math.max(0, t)) * halfDepth;
  for (var i = 0; i < profile.length-1; i++) {
    var a = profile[i], b = profile[i+1];
    if (tx >= a.x && tx <= b.x) {
      var f = (tx - a.x) / (b.x - a.x || 1);
      return a.y + (b.y - a.y) * f;
    }
  }
  return profile[profile.length-1].y;
}

function cornerLift(t, xf, zf, upturn) {
  return upturn * (xf * zf) * Math.max(0, (t - 0.5) / 0.5);
}

function makeSurface(o) {
  var geo = new THREE.BufferGeometry();
  var pos = [], idx = [], uvs = [];
  var nx = o.segX + 1, nz = o.segZ + 1;
  var thick = o.thickness || 0;

  for (var j = 0; j <= o.segZ; j++) {
    var v = j / o.segZ;
    var z = o.halfDepth - v * 2 * o.halfDepth;
    var t = Math.min(1, Math.abs(z) / o.halfDepth);
    var bx = o.boundary(t);
    for (var i = 0; i <= o.segX; i++) {
      var u = i / o.segX;
      var xr = -o.halfWidth + u * 2 * o.halfWidth;
      var x = Math.max(-bx, Math.min(bx, xr));
      pos.push(x, o.height(x, z, t, bx), z);
      uvs.push(u, v);
    }
  }
  var nVert = nx * nz;

  if (thick > 0) {
    for (var j2 = 0; j2 <= o.segZ; j2++) {
      for (var i2 = 0; i2 <= o.segX; i2++) {
        var base = (j2 * nx + i2) * 3;
        pos.push(pos[base], pos[base+1] - thick, pos[base+2]);
        uvs.push(i2/o.segX, j2/o.segZ);
      }
    }
  }

  for (var jj = 0; jj < o.segZ; jj++) {
    for (var ii = 0; ii < o.segX; ii++) {
      var a = jj*nx+ii, b = a+1, c = a+nx, d = c+1;
      idx.push(a, c, b, b, c, d);
      if (thick > 0) {
        var a2 = a+nVert, b2 = b+nVert, c2 = c+nVert, d2 = d+nVert;
        idx.push(a2, b2, c2, b2, d2, c2);
      }
    }
  }

  if (thick > 0) {
    // stitch the four border rims so the shell is closed
    for (var i3 = 0; i3 < o.segX; i3++) {
      var f0 = i3, f1 = i3+1;
      idx.push(f0, f1, f0+nVert, f1, f1+nVert, f0+nVert);
      var k0 = o.segZ*nx + i3, k1 = k0+1;
      idx.push(k1, k0, k0+nVert, k1, k0+nVert, k1+nVert);
    }
    for (var j3 = 0; j3 < o.segZ; j3++) {
      var l0 = j3*nx, l1 = l0+nx;
      idx.push(l1, l0, l0+nVert, l1, l0+nVert, l1+nVert);
      var r0 = j3*nx + o.segX, r1 = r0+nx;
      idx.push(r0, r1, r0+nVert, r1, r1+nVert, r0+nVert);
    }
  }

  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// tile corrugation: ribs run down the slope, so ripple varies across the slope
function tileRib(coord, ribCount, span, amp) {
  if (ribCount <= 0) return 0;
  var period = (2 * span) / ribCount;
  var phase = (coord / period) * Math.PI * 2;
  var c = 0.5 + 0.5 * Math.cos(phase);
  // sharpen: rounded pan tiles with a defined valley between each rib
  return amp * Math.pow(c, 0.4);
}

function ridgeBeam(len, thick, mat, ornament) {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.BoxGeometry(len, thick*1.5, thick), mat);
  g.add(body);
  var cap = new THREE.Mesh(new THREE.BoxGeometry(len, thick*0.5, thick*1.5), mat);
  cap.position.y = thick*0.9;
  g.add(cap);
  if (ornament) {
    // 鸱吻 owl-tail finial: an S-curved silhouette extruded to give it real form
    var sh = new THREE.Shape();
    var u = thick;
    sh.moveTo(0, 0);
    sh.lineTo(u*1.5, 0);
    sh.quadraticCurveTo(u*2.3, u*1.1, u*1.75, u*2.2);
    sh.quadraticCurveTo(u*1.45, u*3.0, u*0.6, u*3.25);
    sh.quadraticCurveTo(u*1.15, u*2.35, u*0.85, u*1.75);
    sh.quadraticCurveTo(u*0.55, u*1.15, 0, u*1.0);
    sh.lineTo(0, 0);
    var eg = new THREE.ExtrudeGeometry(sh, { depth: u*0.95, bevelEnabled:true,
      bevelThickness: u*0.09, bevelSize: u*0.08, bevelSegments: 2, curveSegments: 10 });
    eg.translate(0, 0, -u*0.475);
    [-1, 1].forEach(function(sd){
      var o = new THREE.Mesh(eg, mat);
      if (sd < 0) o.rotation.y = Math.PI;   // rotate, never mirror: mirroring inverts normals
      o.position.set(sd * len/2, thick*0.35, 0);
      o.castShadow = true; o.receiveShadow = true;
      g.add(o);
    });
  }
  g.traverse(function(m){ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// 垂脊/戗脊 hip ridges running down the diagonal hip lines
function hipRidges(cornerPts, apexY, mat, thick) {
  var g = new THREE.Group();
  cornerPts.forEach(function(c){
    var dir = new THREE.Vector3(c.x - c.ax, c.y - c.ay, c.z - c.az);
    var len = dir.length();
    if (len < 0.05) return;
    var box = new THREE.Mesh(new THREE.BoxGeometry(thick*1.15, thick*1.5, len), mat);
    var mid = new THREE.Vector3((c.x+c.ax)/2, (c.y+c.ay)/2 + thick*0.5, (c.z+c.az)/2);
    box.position.copy(mid);
    box.lookAt(new THREE.Vector3(c.x, c.y + thick*0.5, c.z));
    box.castShadow = true; box.receiveShadow = true;
    g.add(box);
  });
  return g;
}

// ---- eave assembly: 椽子 rafters, 飞椽 flying rafters, 瓦当 tile caps, pale trim band ----
function buildEaveAssembly(hw, hd, heightFn, rafterMat, trimMat, capMat, spacing) {
  var g = new THREE.Group();
  var samples = [];
  var stepsX = Math.max(6, Math.round((hw*2) / spacing));
  var stepsZ = Math.max(4, Math.round((hd*2) / spacing));

  function push(x, z, nx, nz) {
    samples.push({ x:x, z:z, nx:nx, nz:nz, y:heightFn(x, z) });
  }
  for (var i = 0; i <= stepsX; i++) { var x = -hw + (i/stepsX)*hw*2; push(x, hd, 0, 1); }
  for (var k = 1; k <= stepsZ; k++) { var z = hd - (k/stepsZ)*hd*2; push(hw, z, 1, 0); }
  for (var i2 = stepsX; i2 >= 0; i2--) { var x2 = -hw + (i2/stepsX)*hw*2; push(x2, -hd, 0, -1); }
  for (var k2 = 1; k2 < stepsZ; k2++) { var z2 = -hd + (k2/stepsZ)*hd*2; push(-hw, z2, -1, 0); }

  // pale trim band: a closed prism ring (4 verts per sample) so it is a solid,
  // not a double-sided sheet. A doubled-winding sheet is non-manifold.
  var pos = [], idx = [];
  var bandH = 0.105, bandT = 0.045;
  var N = samples.length;
  for (var s0 = 0; s0 < N; s0++) {
    var p0 = samples[s0];
    var ox = p0.nx * bandT, oz = p0.nz * bandT;
    var yT = p0.y + 0.010, yB = yT - bandH;
    pos.push(p0.x + ox, yT, p0.z + oz);   // outer top
    pos.push(p0.x + ox, yB, p0.z + oz);   // outer bottom
    pos.push(p0.x - ox, yB, p0.z - oz);   // inner bottom
    pos.push(p0.x - ox, yT, p0.z - oz);   // inner top
  }
  function quad(a,b,c,d){ idx.push(a,b,c, a,c,d); }
  for (var s1 = 0; s1 < N; s1++) {
    var A = s1*4, B = ((s1+1) % N)*4;
    quad(A+0, A+1, B+1, B+0);   // outer face
    quad(B+3, B+2, A+2, A+3);   // inner face
    quad(A+3, A+0, B+0, B+3);   // top
    quad(A+1, A+2, B+2, B+1);   // bottom
  }
  var bandGeo = new THREE.BufferGeometry();
  bandGeo.setIndex(idx);
  bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bandGeo.computeVertexNormals();
  var band = new THREE.Mesh(bandGeo, trimMat);
  band.castShadow = true; band.receiveShadow = true;
  g.add(band);

  // rafters + flying rafters, instanced
  var rl = 0.30, rr = 0.042;
  var rafterGeo = new THREE.CylinderGeometry(rr, rr, rl, 8);
  rafterGeo.rotateX(Math.PI/2);
  var flyGeo = new THREE.BoxGeometry(rr*1.5, rr*1.5, rl*0.62);
  var capGeo = new THREE.CylinderGeometry(rr*1.15, rr*1.15, 0.03, 12);
  capGeo.rotateX(Math.PI/2);

  var n = samples.length;
  var rafters = new THREE.InstancedMesh(rafterGeo, rafterMat, n);
  var flyers  = new THREE.InstancedMesh(flyGeo, rafterMat, n);
  var caps    = new THREE.InstancedMesh(capGeo, capMat, n);
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  var up = new THREE.Vector3(0,1,0);

  for (var s2 = 0; s2 < n; s2++) {
    var p = samples[s2];
    var ang = Math.atan2(p.nx, p.nz);
    e.set(0.26, ang, 0, 'YXZ');
    q.setFromEuler(e);
    var sc = new THREE.Vector3(1,1,1);

    m4.compose(new THREE.Vector3(p.x - p.nx*rl*0.62, p.y - 0.038, p.z - p.nz*rl*0.62), q, sc);
    rafters.setMatrixAt(s2, m4);

    e.set(0.10, ang, 0, 'YXZ'); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(p.x - p.nx*rl*0.22, p.y - 0.014, p.z - p.nz*rl*0.22), q, sc);
    flyers.setMatrixAt(s2, m4);

    e.set(0, ang, 0, 'YXZ'); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(p.x - p.nx*0.015, p.y - 0.006, p.z - p.nz*0.015), q, sc);
    caps.setMatrixAt(s2, m4);
  }
  [rafters, flyers, caps].forEach(function(im){
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    g.add(im);
  });
  return g;
}

// The shell's own corrugation is the source of truth for tile spacing. The
// texture carries 8 barrels x 6 courses, so repeating it ribCount/8 across the
// surface lands every painted barrel exactly on a modelled rib -- and the two
// crests coincide, because both peak at the centre of the span. Leave the two
// counts unrelated (the old fixed 6 x 3) and they beat against each other into
// moire, which is what a tiled roof must never do.
function tileMatFor(mat, ribCount, courses) {
  if (!mat.map || ribCount <= 0) return mat;
  var m = mat.clone();
  m.map = mat.map.clone(); m.map.needsUpdate = true;
  m.map.repeat.set(ribCount / 8, courses / 6);
  if (mat.normalMap) {
    m.normalMap = mat.normalMap.clone(); m.normalMap.needsUpdate = true;
    m.normalMap.repeat.copy(m.map.repeat);
  }
  return m;
}

function buildRoof(P) {
  var group = new THREE.Group();
  var halfWidth = P.halfWidth, halfDepth = P.halfDepth;
  var profile = solveRoofProfile(halfDepth, P.roofHeight, 5);
  var mat = P.tileMat, wallMat = P.gableMat, trimMat = P.trimMat;
  var ribs = P.ribs, ribAmp = 0.075;
  var segX = ribs > 0 ? Math.max(60, ribs * 3) : 32;

  // a 筒瓦 is roughly 2.2 times longer than it is wide, so derive the course
  // count from the barrel width the rib count implies
  function coursesFor(ribCount, spanHalfW, slopeRun) {
    if (ribCount <= 0) return 6;
    return Math.max(4, Math.round(slopeRun / ((2 * spanHalfW / ribCount) * 2.2)));
  }
  // v runs across both slopes, so the run is the full depth, not the half
  var fullRun = 2 * Math.sqrt(halfDepth*halfDepth + P.roofHeight*P.roofHeight);

  if (P.roofType === 'wudian') {
    // 推山 (tuishan): each step above the eave step is reduced by 1/10 of its
    // own run, recursively -- this lengthens 正脊 beyond the naive 45-degree hip.
    var naiveRidge = Math.max(0.35, halfWidth - halfDepth);
    var ridgeHalfLen = naiveRidge;
    if (P.tuishan) {
      var steps = 4, run = halfDepth / steps, gained = 0, cur = run;
      for (var ts = 1; ts < steps; ts++) { cur = cur * 0.9; gained += (run - cur); }
      ridgeHalfLen = Math.min(halfWidth * 0.92, naiveRidge + gained);
    }
    var boundary = function(t){ return halfWidth; };
    var geo = makeSurface({
      segX: segX, segZ: 40, halfWidth: halfWidth, halfDepth: halfDepth,
      thickness: P.shellThick,
      boundary: boundary,
      height: function(x, z, t, bx) {
        var dz = Math.abs(z) / halfDepth;
        var dx = Math.max(0, Math.abs(x) - ridgeHalfLen) / Math.max(halfWidth - ridgeHalfLen, 1e-6);
        var hipDom = dx > dz;
        var tEff = Math.min(1, Math.max(dz, dx));
        var y = profileH(tEff, profile, halfDepth);
        y += cornerLift(tEff, Math.abs(x)/halfWidth, dz, P.upturn);
        y += tileRib(hipDom ? z : x, ribs, hipDom ? halfDepth : halfWidth, ribAmp);
        return y;
      }
    });
    var m = new THREE.Mesh(geo, tileMatFor(mat, ribs, coursesFor(ribs, halfWidth, fullRun)));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    var rb = ridgeBeam(ridgeHalfLen*2 + 0.2, 0.11, trimMat, true);
    var apexY = profileH(0, profile, halfDepth);
    rb.position.set(0, apexY + 0.09, 0);
    group.add(rb);
    var eaveY0 = profileH(1, profile, halfDepth);
    var cps = [];
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(function(s){
      cps.push({ ax: s[0]*ridgeHalfLen, ay: apexY, az: 0,
                 x: s[0]*halfWidth, y: eaveY0 + P.upturn, z: s[1]*halfDepth });
    });
    group.add(hipRidges(cps, apexY, trimMat, 0.1));
    group.add(buildEaveAssembly(halfWidth, halfDepth, function(x,z){
      var dz = Math.abs(z)/halfDepth;
      var dx = Math.max(0, Math.abs(x)-ridgeHalfLen)/Math.max(halfWidth-ridgeHalfLen,1e-6);
      var tE = Math.min(1, Math.max(dz,dx));
      return profileH(tE, profile, halfDepth) + cornerLift(tE, Math.abs(x)/halfWidth, dz, P.upturn) - P.shellThick;
    }, P.rafterMat, P.eaveTrimMat, P.capMat, 0.30));
    return group;
  }

  // ---- 歇山顶 xieshan ----
  // derive the gable break from the 收山 gable plane rather than a magic fraction
  var tBreak = P.purlinDia
    ? Math.min(0.78, Math.max(0.35, 1 - (halfDepth * 0.55 + P.purlinDia) / halfDepth))
    : 1 - P.gableFrac;
  // 收山 (shoushan): Qing recedes the gable plane one 檩径 from the side
  // purlin centreline, rather than an arbitrary fraction of the width.
  var gableHW = P.purlinDia
    ? Math.max(halfWidth * 0.22, halfWidth - halfDepth * 0.55 - P.purlinDia)
    : halfWidth * (0.30 + 0.25 * P.gableFrac);
  var skirtTopY = profileH(tBreak, profile, halfDepth);
  var gableWallH = 0.0;
  var ridgeY = profileH(0, profile, halfDepth);

  var lowerBoundary = function(t) { return halfWidth; };
  var lowerGeo = makeSurface({
    segX: segX, segZ: 44, halfWidth: halfWidth, halfDepth: halfDepth,
    thickness: P.shellThick,
    boundary: lowerBoundary,
    height: function(x, z, t, bx) {
      var gz = tBreak * halfDepth;
      var dx = Math.max(0, Math.abs(x) - gableHW) / Math.max(halfWidth - gableHW, 1e-6);
      var dz = Math.max(0, Math.abs(z) - gz) / Math.max(halfDepth - gz, 1e-6);
      if (dx <= 0 && dz <= 0) return skirtTopY;
      var hipDom = dx > dz;
      var f = Math.min(1, Math.max(dx, dz));
      var tEff = tBreak + f * (1 - tBreak);
      var y = profileH(tEff, profile, halfDepth);
      y += cornerLift(tEff, Math.abs(x)/halfWidth, Math.abs(z)/halfDepth, P.upturn);
      y += tileRib(hipDom ? z : x, ribs, hipDom ? halfDepth : halfWidth, ribAmp);
      return y;
    }
  });
  var lower = new THREE.Mesh(lowerGeo, tileMatFor(mat, ribs, coursesFor(ribs, halfWidth, fullRun)));
  lower.castShadow = true; lower.receiveShadow = true;
  group.add(lower);

  var upHD = tBreak * halfDepth * 1.10;
  var upHW = gableHW * 1.10;
  var upBase = skirtTopY - 0.05;
  var upperGeo = makeSurface({
    segX: Math.max(40, Math.round(ribs*1.6)), segZ: 30, halfWidth: upHW, halfDepth: upHD,
    thickness: P.shellThick,
    boundary: function(){ return upHW; },
    height: function(x, z, t, bx) {
      var tt = Math.min(1, Math.abs(z) / upHD);
      var span = ridgeY - skirtTopY;
      var y = upBase + span * (1 - Math.pow(tt, 1.35));
      y += cornerLift(tt, bx > 0 ? Math.abs(x)/bx : 0, tt, P.upturn * 0.5);
      y += tileRib(x, Math.round(ribs*0.55), upHW, ribAmp);
      return y;
    }
  });
  // the upper roof is modelled with 0.55 of the rib count over a shorter span
  var upRibs = Math.round(ribs * 0.55);
  var upper = new THREE.Mesh(upperGeo,
    tileMatFor(mat, upRibs, coursesFor(upRibs, upHW, 2 * (ridgeY - skirtTopY + upHD))));
  upper.castShadow = true; upper.receiveShadow = true;
  group.add(upper);

  // 山花 gable end walls
  [1, -1].forEach(function(side){
    var shape = new THREE.Shape();
    shape.moveTo(-upHD, 0);
    shape.lineTo(upHD, 0);
    shape.lineTo(0, (ridgeY - skirtTopY) + gableWallH);
    shape.lineTo(-upHD, 0);
    var gGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
    gGeo.translate(0, 0, -0.035);
    var gm = new THREE.Mesh(gGeo, wallMat);
    gm.rotation.y = side * Math.PI/2;
    gm.position.set(side * gableHW * 0.985, skirtTopY - 0.012, 0);
    gm.castShadow = true; gm.receiveShadow = true;
    group.add(gm);
  });

  // main ridge 正脊
  var rb2 = ridgeBeam(upHW*2 + 0.15, 0.1, trimMat, true);
  rb2.position.set(0, upBase + (ridgeY - skirtTopY) + 0.08, 0);
  group.add(rb2);

  // 戗脊 hip ridges on the lower skirt: gable corner -> eave corner
  var eaveY1 = profileH(1, profile, halfDepth);
  var scps = [];
  [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(function(s){
    scps.push({ ax: s[0]*gableHW, ay: skirtTopY, az: s[1]*upHD,
                x: s[0]*halfWidth, y: eaveY1 + P.upturn, z: s[1]*halfDepth });
  });
  group.add(hipRidges(scps, skirtTopY, trimMat, 0.09));

  // 垂脊 on the upper gabled roof, ridge end down to its own eave corners
  var upRidgeY = upBase + (ridgeY - skirtTopY);
  var ucps = [];
  [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(function(s){
    ucps.push({ ax: s[0]*upHW, ay: upRidgeY, az: 0,
                x: s[0]*upHW, y: upBase + P.upturn*0.5, z: s[1]*upHD });
  });
  group.add(hipRidges(ucps, upRidgeY, trimMat, 0.075));

  group.add(buildEaveAssembly(halfWidth, halfDepth, function(x,z){
    var gz = tBreak * halfDepth;
    var dx = Math.max(0, Math.abs(x)-gableHW)/Math.max(halfWidth-gableHW,1e-6);
    var dz = Math.max(0, Math.abs(z)-gz)/Math.max(halfDepth-gz,1e-6);
    var f = Math.min(1, Math.max(dx,dz));
    var tE = tBreak + f*(1-tBreak);
    return profileH(tE, profile, halfDepth)
         + cornerLift(tE, Math.abs(x)/halfWidth, Math.abs(z)/halfDepth, P.upturn) - P.shellThick;
  }, P.rafterMat, P.eaveTrimMat, P.capMat, 0.30));

  group.add(buildEaveAssembly(upHW, upHD, function(x,z){
    var tt = Math.min(1, Math.abs(z)/upHD);
    var span = ridgeY - skirtTopY;
    return upBase + span*(1-Math.pow(tt,1.35))
         + cornerLift(tt, Math.abs(x)/upHW, tt, P.upturn*0.5) - P.shellThick;
  }, P.rafterMat, P.eaveTrimMat, P.capMat, 0.32));

  return group;
}


// ============================================================================
