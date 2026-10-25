// ============================================================================
//  殿 ONE HALL — platform, columns, walls, lattice, steps, balustrade,
//  brackets and roof, from a set of 斗口-derived dimensions. The main hall is
//  built by this, and so are the courtyard's side halls, so a 配殿 is a real
//  building at its own rank rather than a box with a roof on it.
//
//  P: { D, scale, M, isDaShi, isSong, roofType, grade, grade3, caihua, railing,
//       shengqi, cejiao, tuishan, nBeasts, colours, tileM, ridgeM, yulu }
// ============================================================================
function buildHall(P, mats) {
  var g = new THREE.Group();
  var D = P.D, scale = P.scale, M = P.M, u = scale;
  var isDaShi = P.isDaShi, isSong = P.isSong, grade = P.grade, grade3 = P.grade3;
  var hw = (D.totalWidth * scale) / 2;
  var hd = (D.totalDepth * scale) / 2;
  var baseH = D.baseH * scale;
  var dgSteps = isDaShi ? (grade <= 3 ? 4 : grade <= 7 ? 3 : 2) : 0;
  var dgOut = 3 * u * dgSteps;
  var eaveOut = D.eaveOut * scale * ROOF_CURVE.eave + dgOut;
  var roofRise = D.roofRise * scale * ROOF_CURVE.rise;
  var upturn = D.cornerRise * scale * ROOF_CURVE.lift;
  var tileM = P.tileM, ridgeM = P.ridgeM, nBeasts = P.nBeasts;
  var roofType = P.roofType;
  var useShengqi = P.shengqi, useCejiao = P.cejiao, useTuishan = P.tuishan;
  var thick = Math.max(0.04, D.purlinDia * scale * 0.5);
  var rafter = { spacing: 3 * u, r: 0.75 * u, fly: 1.5 * u, flyLen: 7 * u };

  // --------------------------------------------------------------- 台基
  var base = buildBase(hw, hd, baseH, 2, mats, { margin: Math.min(0.75, eaveOut * 0.72), xumi: isDaShi });
  g.add(base);

  var floor = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.02 * M, hd * 2), mats.floor);
  floor.position.y = baseH + 0.01 * M;
  floor.receiveShadow = true;
  g.add(floor);

  var colR = D.colDia * scale / 2;
  var S = { D: D, scale: scale, M: M, u: u };
  var columns = buildColumns(S, baseH, mats, {
    shengqi: useShengqi, cejiao: useCejiao, daShi: isDaShi,
    caihua: P.caihua, grade: grade3, colours: P.colours
  });
  g.add(columns);
  var colTop = columns.userData.colTop, beamBottom = columns.userData.beamBottom;
  g.add(buildWalls(hw, hd, baseH, beamBottom, mats, colR));
  g.add(buildLattice(S, hd, baseH, beamBottom, mats, colR, { rich: grade3 !== 'sushi' }));

  // 踏跺 as wide as the 明间, its top tread flush with the platform edge
  var bays = D.bayWidths.length;
  var stepHalf = (D.bayWidths[(bays - 1) / 2] * scale) / 2 - colR;
  var steps = buildSteps(stepHalf, baseH, mats, M, { yulu: P.yulu });
  steps.position.z = base.userData.topHD;
  g.add(steps);

  var rail = null;
  if (P.railing) {
    var rx = base.userData.topHW - 0.28 * M, rz = base.userData.topHD - 0.28 * M;
    var gapHalf = stepHalf + 0.42 * M;
    rail = buildBalustrade(rx, rz, baseH, mats, M, [-gapHalf, gapHalf]);
    g.add(rail);
    if (isDaShi) addChishou(g, rail.userData.posts, base, rx, rz, mats.plinth, M);
  }

  // -------------------------------------------------- 斗栱 / 檩 and the roof
  var purlinTop;
  if (isDaShi) {
    var dg = buildDougong(S, colTop, mats, dgSteps);
    g.add(dg);
    purlinTop = dg.userData.top;
  } else {
    // 小式: the 檐檩 sits straight on the columns over a 垫板
    var rp = D.purlinDia * scale / 2;
    [[0, hd, hw * 2 + rp * 2, true], [0, -hd, hw * 2 + rp * 2, true], [hw, 0, hd * 2 + rp * 2, false], [-hw, 0, hd * 2 + rp * 2, false]].forEach(function (b) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(rp, rp, b[2], 16), mats.beam);
      if (b[3]) c.rotation.z = Math.PI / 2; else c.rotation.x = Math.PI / 2;
      c.position.set(b[0], colTop + rp * 1.4, b[1]);
      c.castShadow = true; c.receiveShadow = true;
      g.add(c);
    });
    purlinTop = colTop + rp * 2.4;
  }

  var roof = buildRoof({
    halfWidth: hw + eaveOut, halfDepth: hd + eaveOut, hw: hw, hd: hd, dgOut: isDaShi ? dgOut : D.purlinDia * scale * 0.5,
    roofHeight: roofRise, upturn: upturn, chong: D.cornerOut * scale * ROOF_CURVE.lift,
    roofType: roofType, isSong: isSong, tuishan: useTuishan, purlinDia: D.purlinDia * scale,
    shellThick: thick, tileP: tileM * M, courseL: tileM * M * 0.92, ridgeH: ridgeM * M,
    beasts: nBeasts, rafter: rafter, M: M, mats: mats, wen: isDaShi
  });
  // seat the roof so its boards rest on the rafters, and the rafters on the
  // 挑檐桁: the eave edge then falls below the purlin, as a real one does
  var R = roof.userData.R;
  var tiaoZ = hd + (isDaShi ? dgOut : 0);
  var rafterDepth = rafter.fly + rafter.r * 2;
  var roofY = purlinTop + rafterDepth - (R.height(0, tiaoZ) - thick);
  roof.position.y = roofY;
  g.add(roof);

  // close the band between the bracket tops and the roof boards on the
  // column line, so no daylight shows through under the eave
  var soffitAtCol = roofY + R.height(0, hd) - thick;
  var fh = soffitAtCol - (purlinTop - 2 * u) + 0.02;
  if (fh > 0) {
    var ft = u * 1.2, fy = purlinTop - 2 * u + fh / 2;
    [[0, hd, hw * 2, ft], [0, -hd, hw * 2, ft], [hw, 0, ft, hd * 2], [-hw, 0, ft, hd * 2]].forEach(function (b) {
      part(new THREE.BoxGeometry(b[2], fh, b[3]), mats.board, b[0], fy, b[1], 0, g);
    });
  }


  var topY = roofY + R.height(0, 0) + ridgeM * M * 2.4;
  // where lanterns hang: under the front eave, one at every front column,
  // halfway out to the eave edge, from the underside of the roof
  var xs = bayAxes(D, scale), lampZ = hd + eaveOut * 0.42, lamps = [];
  xs.forEach(function (x) {
    lamps.push({ x: x, z: lampZ, y: roofY + R.height(x, lampZ) - thick * 1.5 });
  });
  return {
    group: g, hw: hw, hd: hd, baseH: baseH, base: base, steps: steps, stepHalf: stepHalf, rail: rail,
    colTop: colTop, colR: colR, roofY: roofY, R: R, topY: topY, eaveOut: eaveOut, thick: thick,
    lamps: lamps, beamBottom: beamBottom
  };
}
