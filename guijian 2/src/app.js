// Every rebuild allocates fresh geometries and materials. Detaching the old
// group leaves every one of them on the GPU -- drag a slider for a minute and
// that is thousands of orphaned buffers. Free them here. Textures that came
// out of the cache (texRepeat, lattice, 彩画) are shared across rebuilds and
// are released by the cache itself, never here.
function disposeGroup(root) {
  var geos = [], mats = [];
  root.traverse(function (o) {
    if (!o.isMesh) return;
    if (geos.indexOf(o.geometry) < 0) geos.push(o.geometry);
    var mm = Array.isArray(o.material) ? o.material : [o.material];
    for (var i = 0; i < mm.length; i++)
      if (mm[i] && mats.indexOf(mm[i]) < 0) mats.push(mm[i]);
  });
  for (var g = 0; g < geos.length; g++) geos[g].dispose();
  var MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap'];
  for (var k = 0; k < mats.length; k++) {
    if (mats[k].userData && mats[k].userData.shared) continue;
    for (var j = 0; j < MAPS.length; j++) {
      var t = mats[k][MAPS[j]];
      if (t && t.dispose && !(t.userData && t.userData.cached)) t.dispose();
    }
    mats[k].dispose();
  }
}

// ui.js registers here rather than relying on listener ordering, so the control
// surface always re-reads the state the model settled on.
var REBUILD_HOOKS = [];
// ...and a pre-pass, for state the geometry itself reads (the 坡面 curve).
var REBUILD_PRE = [];

function rebuild() {
  for (var p = 0; p < REBUILD_PRE.length; p++) REBUILD_PRE[p]();
  buildModel();
  for (var i = 0; i < REBUILD_HOOKS.length; i++) REBUILD_HOOKS[i]();
}

// the 彩画 materials are keyed by texture and reused across rebuilds
function sharedPaintMats() {
  Object.keys(PAINT_MATS).forEach(function (k) { PAINT_MATS[k].userData.shared = true; });
}

function buildModel() {
  [buildingGroup, siteGroup].forEach(function (grp) {
    while (grp.children.length) {
      var stale = grp.children[0];
      grp.remove(stale);
      disposeGroup(stale);
    }
  });

  var grade   = parseInt(document.getElementById('doukou').value);
  var bays    = parseInt(document.getElementById('bays').value);
  var purlins = parseInt(document.getElementById('purlins').value);
  var isDaShi = document.getElementById('classType').value === 'da';
  var isSong  = document.getElementById('period').value === 'song';
  var roofType = document.getElementById('roofType').value;
  var tileScale = val('tileScale') / 100;
  var useTuishan  = val('tuishan') > 0.5;
  var useShengqi  = val('shengqi') > 0.5 && isSong;
  var useCejiao   = val('cejiao') > 0.5;
  var grade3 = document.getElementById('caihuaType').value;

  var D = deriveDimensions(grade, bays, purlins, isDaShi, isSong);

  // scale 斗口 units into a comfortable scene size; M converts real metres
  var scale = 9.0 / D.totalWidth;
  var mPerDk = D.doukouCun * 3.2 / 100;      // 1 寸 = 3.2 cm
  var M = scale / mPerDk;                    // scene units per metre
  var u = scale;                             // one 斗口 in scene units

  var hw = (D.totalWidth * scale) / 2;
  var hd = (D.totalDepth * scale) / 2;
  var colH = D.colH * scale;
  var baseH = D.baseH * scale;
  // 踩: the bracket rank follows the building's -- 九踩 on the greatest halls,
  // 七踩, then 五踩
  var dgSteps = isDaShi ? (grade <= 3 ? 4 : grade <= 7 ? 3 : 2) : 0;
  var dgOut = 3 * u * dgSteps;
  // 上檐出 is measured from the 挑檐桁, so on a bracketed hall the 拽架 add to it
  var eaveOut = D.eaveOut * scale * ROOF_CURVE.eave + dgOut;
  var roofRise = D.roofRise * scale * ROOF_CURVE.rise;
  var upturn = D.cornerRise * scale * ROOF_CURVE.lift;
  // 瓦垄: tile size follows the building's rank (larger 样 on larger halls)
  var tileM = (0.18 + 0.05 * D.doukouCun) * tileScale;
  var ridgeM = 0.55 + 0.12 * D.doukouCun;

  var isPagoda = document.getElementById('buildingType').value === 'pagoda';
  var Me = isPagoda ? M * 0.62 : M;          // the pagoda is built at 0.62 of the hall's scale

  document.getElementById('dkOut').textContent = grade + '等 (' + D.doukouCun + '寸)';
  document.getElementById('bayOut').textContent = bays;
  document.getElementById('plOut').textContent = purlins;
  document.getElementById('tOut').textContent = Math.round(tileM * 100) + ' cm';
  document.getElementById('tsOut').textContent = useTuishan ? 'on' : 'off';
  document.getElementById('sqOut').textContent = isSong ? (useShengqi ? 'on' : 'off') : 'Qing: n/a';
  document.getElementById('cjOut').textContent = useCejiao ? 'on' : 'off';
  document.getElementById('rlOut').textContent = val('railing') > 0.5 ? 'on' : 'off';
  // 吻兽 are an official-style privilege: a 小式 roof carries none
  var nBeasts = (val('beasts') > 0.5 && isDaShi) ? beastCount(grade) : 0;
  document.getElementById('chOut').textContent = val('caihua') > 0.5 ? 'on' : 'off';
  document.getElementById('jsOut').textContent = !isDaShi ? '小式: n/a' : nBeasts ? nBeasts + '兽 + 仙人' : 'off';

  // ------------------------------------------------------------ materials
  function col(id) { return document.getElementById(id).value; }
  var cRoof = col('roofColor'), cTrim = col('trimColor'), cWood = col('woodColor'),
      cBeam = col('beamColor'), cCaihua = col('caihuaColor'), cDg = col('dgColor'),
      cWall = col('wallColor'), cLattice = col('latticeColor'), cBase = col('baseColor'),
      cRail = col('railColor');
  function std(hex, o) {
    var m = new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.8, metalness: 0 });
    if (o) Object.keys(o).forEach(function (k) { m[k] = o[k]; });
    return m;
  }
  var tileSet = TEXGEN.sets.tile;
  // 琉璃: glaze is glass. Glossy on the crown of every tile, dull in the dirty
  // channel -- the roughness map carries that, the env map does the rest.
  var tileMat = std(cRoof);
  tileMat.map = texRepeat(tileSet.map, 0.25, 0.25);
  tileMat.normalMap = texRepeat(tileSet.normal, 0.25, 0.25);
  tileMat.roughnessMap = texRepeat(tileSet.rough, 0.25, 0.25);
  tileMat.roughness = 1.0;
  tileMat.normalScale = new THREE.Vector2(1.0, 1.0);

  var ridgeMat  = dress(std(cTrim), 'stone', Me, { size: 1.4, normal: 0.6, roughMul: 0.62 });
  var lacquer   = dress(std(cWood), 'lacquer', Me, { normal: 0.7 });
  // 连檐, 博缝 and the gable are painted boards: matte, not the columns' lacquer
  var fasciaMat = dress(std(cWood), 'paint', Me, { normal: 0.4, roughMul: 1.1 });
  // pushed back a hair in depth: its rims meet the tiles edge-on along every
  // seam, and a depth tie there sparkles red through the glaze
  var soffit    = dress(std('#' + C(cWood).multiplyScalar(0.8).convertLinearToSRGB().getHexString(),
                  { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }), 'paint', Me, { normal: 0.5 });
  var rafterMat = dress(std(cCaihua), 'paint', Me, { normal: 0.4 });
  var flyEnd    = dress(std('#' + new THREE.Color(cCaihua).lerp(new THREE.Color('#ffffff'), 0.12).getHexString()), 'paint', Me);
  var rafterEnd = dress(std(cBeam), 'paint', Me);
  var beamMat   = dress(std(cBeam), 'paint', Me, { normal: 0.5 });
  var boardMat  = dress(std('#' + new THREE.Color(cWood).lerp(new THREE.Color(cWall), 0.4).getHexString()), 'paint', Me, { normal: 0.4 });
  var quetiMat  = dress(std(cCaihua), 'paint', Me, { normal: 0.5 });
  var dgA       = dress(std(cDg), 'paint', Me, { normal: 0.5 });
  var dgB       = dress(std(cCaihua), 'paint', Me, { normal: 0.5 });
  var wallMat   = dress(std(cWall), 'plaster', Me, { normal: 0.8 });
  var dijianMat = dress(std('#8f8e8a'), 'wallBrick', Me, { normal: 0.9 });
  var frameMat  = dress(std(cLattice), 'lacquer', Me, { normal: 0.5 });
  var goldMat   = std('#d9b24f', { metalness: 1.0, roughness: 0.34 });
  var glassMat  = std(isPagodaMode() ? '#3a2c22' : '#1b1714', { roughness: isPagodaMode() ? 0.5 : 0.09, metalness: 0.0, envMapIntensity: 1.1 });
  var baseMat   = dress(std(cBase), 'ashlar', Me, { normal: 1.0 });
  var pavingMat = dress(std('#' + new THREE.Color(cBase).multiplyScalar(0.94).getHexString()), 'slab', Me, { normal: 0.9 });
  var plinthMat = dress(std(cBase), 'stone', Me, { normal: 0.6 });
  var stoneMat  = dress(std(cRail), 'stone', Me, { normal: 0.6 });
  var stepMat   = dress(std(cBase), 'ashlar', Me, { size: [1.6, 0.6], normal: 0.8 });
  var reliefMat = dress(std(cRail), 'relief', Me, { normal: 1.6 });
  var floorMat  = dress(std('#4b4640'), 'slab', Me, { size: 1.28, normal: 0.6 });

  // the 菱花 grid, cut out of a texture painted in the lattice colour
  var latKind = grade3 === 'sushi' ? 'step' : 'hex';
  var latTex = TEXGEN.latticeTexture(latKind, cLattice);
  var cell = latKind === 'hex' ? [0.19, 0.21] : [0.24, 0.24];
  var gridMat = new THREE.MeshStandardMaterial({
    map: texRepeat(latTex, 1 / (cell[0] * Me), 1 / (cell[1] * Me)),
    alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.0
  });

  // 平坐 deck planks, and the finer 步步锦 lattice a balustrade carries
  var deckMat = dress(std('#7a5638'), 'slab', Me, { size: 1.28, normal: 0.6 });
  var railGridMat = new THREE.MeshStandardMaterial({
    map: texRepeat(TEXGEN.latticeTexture('step', cLattice), 1 / (0.15 * Me), 1 / (0.15 * Me)),
    alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.0
  });

  var mats = {
    deck: deckMat, railGrid: railGridMat,
    tile: tileMat, soffit: soffit, ridge: ridgeMat, fascia: fasciaMat, rafter: rafterMat,
    flyEnd: flyEnd, rafterEnd: rafterEnd, gold: goldMat, gable: fasciaMat,
    column: lacquer, beam: beamMat, board: boardMat, plate: beamMat, queti: quetiMat,
    dgA: dgA, dgB: dgB, dg: dgA, wall: wallMat, dijian: dijianMat,
    frame: frameMat, grid: gridMat, glass: glassMat, lattice: frameMat,
    base: baseMat, paving: pavingMat, plinth: plinthMat, stone: stoneMat, rail: stoneMat,
    step: stepMat, relief: reliefMat, wood: lacquer
  };

  // 墙帽 tiles: the roof texture again, its repeat set from world units since
  // the sweep lays its UVs in world units
  var capTile = std(cRoof);
  capTile.map = texRepeat(tileSet.map, 1 / (4 * tileM * Me), 1 / (4 * tileM * Me * 0.92));
  capTile.normalMap = texRepeat(tileSet.normal, 1 / (4 * tileM * Me), 1 / (4 * tileM * Me * 0.92));
  capTile.roughnessMap = texRepeat(tileSet.rough, 1 / (4 * tileM * Me), 1 / (4 * tileM * Me * 0.92));
  capTile.roughness = 1;
  var siteMats = {
    earth: dress(std('#8a826e', { vertexColors: true }), 'earth', 1, { size: 9 * Me, roughMul: 1, normal: 0.6 }),
    paving: dress(std('#8d8a83', { vertexColors: true }), 'brick', Me, { normal: 0.55 }),
    capTile: capTile,
    path: dress(std('#c8c3b6'), 'slab', Me, { size: 2.4, normal: 0.8 }),
    // the court wall is washed like the hall's own: red in a palace, 粉墙 in a garden
    wall: dress(std(cWall), 'plaster', Me, { normal: 0.8 }),
    brick: dress(std('#8f8e8a'), 'wallBrick', Me),
    cap: dress(std(cRoof), 'stone', Me, { size: 1.4, roughMul: 0.6 }),
    door: dress(std(cWood), 'lacquer', Me),
    cityWall: std('#' + new THREE.Color(cWall).multiplyScalar(0.82).getHexString(), { roughness: 0.92 }),
    cityEave: std('#2f2622', { roughness: 0.9 }),
    cityGround: dress(std('#7e7b75', { vertexColors: true }), 'brick', 1, { size: 1.92 * Me, normal: 0.3 }),
    cityRoof: std('#' + new THREE.Color(cRoof).multiplyScalar(0.82).getHexString(), { roughness: 0.5 }),
    cityBase: std('#bdb8ab', { roughness: 0.85 }),
    gold: goldMat
  };
  BOUNCE_ALBEDO.copy(C('#8d8a83')).multiplyScalar(0.8);

  var thick = Math.max(0.04, D.purlinDia * scale * 0.5);
  var rafter = { spacing: 3 * u, r: 0.75 * u, fly: 1.5 * u, flyLen: 7 * u };

  var pgRows = document.querySelectorAll('.pg');
  for (var pi = 0; pi < pgRows.length; pi++)
    pgRows[pi].style.display = isPagoda ? 'block' : 'none';

  var info = { type: isPagoda ? 'pagoda' : 'hall', M: Me };

  if (isPagoda) {
    var storeys = parseInt(document.getElementById('storeys').value);
    var sides   = parseInt(document.getElementById('sides').value);
    var pStyle  = document.getElementById('pagodaStyle').value;
    document.getElementById('stOut').textContent = storeys;
    document.getElementById('sdOut').textContent = sides + '边';
    var ps = scale * 0.62;
    // must match the R0 buildPagoda derives, 密檐 slenderness factor included
    var pagodaR = (D.totalWidth * ps) / 2 * (pStyle === 'miyan' ? 0.30 : 1.0);
    var pbase = buildBase(pagodaR * 1.08, pagodaR * 1.08, baseH, 2, mats, { margin: pagodaR * 0.32, xumi: isDaShi });
    buildingGroup.add(pbase);
    var pgSteps = buildSteps(pagodaR * 0.38, baseH, mats, Me, {});
    pgSteps.position.z = pbase.userData.topHD;
    buildingGroup.add(pgSteps);
    var pg = buildPagoda(D, ps, {
      sides: sides, storeys: storeys, style: pStyle, dougong: isDaShi, beasts: nBeasts > 0
    }, mats, { M: Me, tileP: tileM * Me, courseL: tileM * Me * 0.92, ridgeH: ridgeM * Me });
    pg.position.y = baseH;
    buildingGroup.add(pg);

    var pgH = (pg.userData.totalHeight || 10) + baseH;
    info.width = pbase.userData.topHW * 2;
    info.depth = info.width;
    info.frontZ = pbase.userData.topHD + pgSteps.userData.run;
    info.stepsHalfW = pagodaR * 0.38;
    info.stepsFootZ = info.frontZ;
    MODEL_INFO = {
      type: 'pagoda', hw: pagodaR, hd: pagodaR, baseH: baseH, eaveY: baseH + D.colH * ps, top: pgH, M: Me,
      frontZ: info.frontZ,
      platform: { hw: pbase.userData.topHW, hd: pbase.userData.topHD },
      steps: { hw: pagodaR * 0.38, z0: pbase.userData.topHD, z1: info.frontZ },
      solid: { hw: pagodaR * 1.02, hd: pagodaR * 1.02 }
    };
    FRAME_TARGET.set(0, pgH * 0.42, 0);
    fitFor(pagodaR * 2.6, pgH);
    finishBuild(pgH, Math.max(pgH * 0.6, pagodaR * 2), info, siteMats);
    var ptris = countTris(buildingGroup);
    document.getElementById('stats').textContent =
      Math.round(ptris).toLocaleString() + ' tris · ' + storeys + '层 ' + sides + '边';
    writeDerived(D, mPerDk, bays, eaveOut / scale, { pagoda: true, height: pgH / Me, width: pagodaR * 2 / Me });
    return;
  }

  // --------------------------------------------------------------- 台基
  var base = buildBase(hw, hd, baseH, 2, mats, { margin: Math.min(0.75, eaveOut * 0.72), xumi: isDaShi });
  buildingGroup.add(base);

  var floor = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.02 * M, hd * 2), floorMat);
  floor.position.y = baseH + 0.01 * M;
  floor.receiveShadow = true;
  buildingGroup.add(floor);

  var colR = D.colDia * scale / 2;
  var colours = { qing: cBeam, lv: cCaihua, red: '#' + new THREE.Color(cWood).lerp(new THREE.Color(cWall), 0.3).getHexString() };
  var S = { D: D, scale: scale, M: M, u: u };
  var columns = buildColumns(S, baseH, mats, {
    shengqi: useShengqi, cejiao: useCejiao, daShi: isDaShi,
    caihua: val('caihua') > 0.5, grade: grade3, colours: colours
  });
  buildingGroup.add(columns);
  var colTop = columns.userData.colTop, beamBottom = columns.userData.beamBottom;
  buildingGroup.add(buildWalls(hw, hd, baseH, beamBottom, mats, colR));
  buildingGroup.add(buildLattice(S, hd, baseH, beamBottom, mats, colR, { rich: grade3 !== 'sushi' }));

  // 踏跺 as wide as the 明间, its top tread flush with the platform edge
  var stepHalf = (D.bayWidths[(bays - 1) / 2] * scale) / 2 - colR;
  var steps = buildSteps(stepHalf, baseH, mats, M, { yulu: isDaShi && grade <= 6 });
  steps.position.z = base.userData.topHD;
  buildingGroup.add(steps);

  if (val('railing') > 0.5) {
    var rx = base.userData.topHW - 0.28 * M, rz = base.userData.topHD - 0.28 * M;
    var gapHalf = stepHalf + 0.42 * M;
    var rail = buildBalustrade(rx, rz, baseH, mats, M, [-gapHalf, gapHalf]);
    buildingGroup.add(rail);
    if (isDaShi) addChishou(buildingGroup, rail.userData.posts, base, rx, rz, plinthMat, M);
  }

  // -------------------------------------------------- 斗栱 / 檩 and the roof
  var purlinTop;
  if (isDaShi) {
    var dg = buildDougong(S, colTop, mats, dgSteps);
    buildingGroup.add(dg);
    purlinTop = dg.userData.top;
  } else {
    // 小式: the 檐檩 sits straight on the columns over a 垫板
    var rp = D.purlinDia * scale / 2;
    [[0, hd, hw * 2 + rp * 2, true], [0, -hd, hw * 2 + rp * 2, true], [hw, 0, hd * 2 + rp * 2, false], [-hw, 0, hd * 2 + rp * 2, false]].forEach(function (b) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(rp, rp, b[2], 16), beamMat);
      if (b[3]) c.rotation.z = Math.PI / 2; else c.rotation.x = Math.PI / 2;
      c.position.set(b[0], colTop + rp * 1.4, b[1]);
      c.castShadow = true; c.receiveShadow = true;
      buildingGroup.add(c);
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
  buildingGroup.add(roof);

  // close the band between the bracket tops and the roof boards on the
  // column line, so no daylight shows through under the eave
  var soffitAtCol = roofY + R.height(0, hd) - thick;
  var fh = soffitAtCol - (purlinTop - 2 * u) + 0.02;
  if (fh > 0) {
    var ft = u * 1.2, fy = purlinTop - 2 * u + fh / 2;
    [[0, hd, hw * 2, ft], [0, -hd, hw * 2, ft], [hw, 0, ft, hd * 2], [-hw, 0, ft, hd * 2]].forEach(function (b) {
      part(new THREE.BoxGeometry(b[2], fh, b[3]), boardMat, b[0], fy, b[1], 0, buildingGroup);
    });
  }

  var topY = roofY + R.height(0, 0) + ridgeM * M * 2.4;
  info.width = base.userData.topHW * 2;
  info.depth = base.userData.topHD * 2;
  info.frontZ = base.userData.topHD + steps.userData.run;
  info.stepsHalfW = stepHalf;
  info.stepsFootZ = info.frontZ;
  MODEL_INFO = {
    type: 'hall', hw: hw, hd: hd, baseH: baseH, eaveY: roofY, top: topY, M: M,
    frontZ: info.frontZ, eaveOut: eaveOut, colTop: colTop,
    platform: { hw: base.userData.topHW, hd: base.userData.topHD },
    steps: { hw: stepHalf, z0: base.userData.topHD, z1: info.frontZ },
    solid: { hw: hw + colR * 1.5, hd: hd + colR * 1.5 }
  };
  FRAME_TARGET.set(0, topY * 0.42, 0);
  fitFor((Math.max(hw, hd) + eaveOut) * 2, topY);
  finishBuild(topY, Math.hypot(hw + eaveOut, hd + eaveOut, topY * 0.5) * 1.15, info, siteMats);

  var tris = countTris(buildingGroup);
  var meshes = 0;
  buildingGroup.traverse(function (o) { if (o.isMesh) meshes++; });
  document.getElementById('stats').textContent =
    Math.round(tris).toLocaleString() + ' tris · ' + meshes + ' draws';
  writeDerived(D, mPerDk, bays, eaveOut / scale, {});
}

function isPagodaMode() { return document.getElementById('buildingType').value === 'pagoda'; }

function finishBuild(topY, radius, info, siteMats) {
  worldScaleUVs(buildingGroup);
  mergeStatic(buildingGroup);
  sharedPaintMats();
  var site = buildSite(info, siteMats);
  worldScaleUVs(site);
  siteGroup.add(site);
  siteGroup.visible = SITE.visible;
  MODEL_INFO.court = site.userData.court;
  fitShadowTo(new THREE.Vector3(0, topY * 0.4, 0), radius);
  setFogScale(frameRadius);
  purgeTextureCache();
  markShadowsDirty();
}

function countTris(root) {
  var tris = 0;
  root.traverse(function (o) {
    if (!o.isMesh) return;
    var n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    tris += o.isInstancedMesh ? n * o.count : n;
  });
  return tris;
}

function writeDerived(D, mPerDk, bays, eaveDk, opt) {
  var m = function (dk) { return dk * mPerDk; };
  function cell(key, label, value, wide) {
    return '<div class="d' + (wide ? ' wide' : '') + '" data-k="' + key + '"><span>' +
           label + '</span><b>' + value + '</b></div>';
  }
  var html;
  if (opt.pagoda) {
    html = cell('width', '塔底面阔', opt.width.toFixed(1) + ' m') +
           cell('colH', '塔高', opt.height.toFixed(1) + ' m') +
           cell('colDia', '柱径', (D.colDia * mPerDk * 62).toFixed(0) + ' cm') +
           cell('ratio', '高:阔', (opt.height / opt.width).toFixed(2));
  } else {
    html = cell('width', '通面阔', m(D.totalWidth).toFixed(1) + ' m') +
      cell('depth', '通进深', m(D.totalDepth).toFixed(1) + ' m') +
      cell('colH', '柱高', m(D.colH).toFixed(2) + ' m') +
      cell('colDia', '柱径', (m(D.colDia) * 100).toFixed(0) + ' cm') +
      cell('bay', '明间', m(D.bayWidths[(bays - 1) / 2]).toFixed(2) + ' m') +
      cell('eave', '出檐', m(eaveDk).toFixed(2) + ' m') +
      cell('ratio', '深:阔', (D.totalDepth / D.totalWidth).toFixed(2)) +
      cell('rise', '举高:进深', (D.roofRise * ROOF_CURVE.rise / D.totalDepth).toFixed(2)) +
      cell('coeffs', '举架', D.coeffs.map(function (c) { return c.toFixed(2); }).join(' → '), true);
  }
  document.getElementById('derived').innerHTML = html;
}

function applyPreset() {
  var p = PRESETS[document.getElementById('preset').value];
  if (!p) return;
  var map = { roofColor: 'roof', trimColor: 'trim', woodColor: 'wood', beamColor: 'beam',
              caihuaColor: 'caihua', dgColor: 'dg', wallColor: 'wall', latticeColor: 'lattice',
              baseColor: 'base', railColor: 'rail' };
  Object.keys(map).forEach(function (id) { document.getElementById(id).value = p[map[id]]; });
  // the 彩画 grade travels with the scheme: it is a rank, like the roof colour
  if (p.caihuaType) document.getElementById('caihuaType').value = p.caihuaType;
}
document.getElementById('preset').addEventListener('change', function () {
  applyPreset();
  rebuild();
});

['buildingType', 'pagodaStyle', 'storeys', 'sides',
 'doukou', 'classType', 'period', 'bays', 'purlins', 'roofType', 'tuishan', 'tileScale', 'shengqi', 'cejiao',
 'railing', 'caihua', 'caihuaType', 'beasts', 'roofColor', 'trimColor', 'woodColor', 'beamColor', 'caihuaColor',
 'dgColor', 'wallColor', 'latticeColor', 'baseColor', 'railColor'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', rebuild);
});

// ============================================================================
//  OBJ export. Merged meshes carry their original parts; instanced meshes are
//  flattened instance by instance; every part is welded on its own (README).
// ============================================================================
function exportOBJ(group) {
  var lines = ['# 古建模 Gujianmo — Chinese architecture generator'];
  var off = 1;
  group.updateMatrixWorld(true);

  function writeGeo(geo, matrix, name) {
    var pos = geo.attributes.position, idx = geo.index;
    lines.push('o ' + name);
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      lines.push('v ' + v.x.toFixed(5) + ' ' + v.y.toFixed(5) + ' ' + v.z.toFixed(5));
    }
    if (idx) {
      for (var k = 0; k < idx.count; k += 3)
        lines.push('f ' + (idx.getX(k) + off) + ' ' + (idx.getX(k + 1) + off) + ' ' + (idx.getX(k + 2) + off));
    } else {
      for (var k2 = 0; k2 < pos.count; k2 += 3)
        lines.push('f ' + (k2 + off) + ' ' + (k2 + 1 + off) + ' ' + (k2 + 2 + off));
    }
    off += pos.count;
  }

  var partNo = 0, world = new THREE.Matrix4(), inst = new THREE.Matrix4();
  group.traverse(function (o) {
    if (!o.isMesh) return;
    if (o.userData.parts) {
      o.userData.parts.forEach(function (p) {
        partNo++;
        world.multiplyMatrices(group.matrixWorld, p.matrix);
        writeGeo(p.geometry, world, 'part' + partNo);
      });
    } else if (o.isInstancedMesh) {
      // flatten every instance into real geometry, else the export loses them all
      for (var n = 0; n < o.count; n++) {
        partNo++;
        o.getMatrixAt(n, inst);
        world.multiplyMatrices(o.matrixWorld, inst);
        writeGeo(o.geometry, world, 'part' + partNo);
      }
    } else {
      partNo++;
      writeGeo(o.geometry, o.matrixWorld, 'part' + partNo);
    }
  });

  var w = weldOBJ(lines, 5);
  var pct = (100 * (1 - w.after / Math.max(w.before, 1))).toFixed(1);
  console.log('OBJ export: ' + w.before + ' -> ' + w.after + ' verts welded ('
              + pct + '% reduction), ' + w.faces + ' triangles, '
              + (w.holes || 0) + ' holes filled');
  return w;
}

function downloadOBJ(w) {
  var blob = new Blob([w.lines.join('\n')], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'gujianmo_model.obj'; a.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// Weld coincident vertices PER PART. Without this the file carries one unshared
// vertex per triangle corner -- huge files and non-manifold shells.
function nz(v, tol) { return (+((+v).toFixed(tol))).toFixed(tol); }

function weldOBJ(lines, tol) {
  tol = tol || 5;
  var faces = [], header = [];
  var out = [], seen = 0, remap = [];
  // Weld PER PART, not globally. Welding across parts fuses vertices where two
  // separate solids happen to touch, producing edges shared by 4 faces (non-
  // manifold). Kept separate, each part stays a closed solid and slicers union
  // them at slice time.
  var map = {};
  for (var i = 0; i < lines.length; i++) {
    var L = lines[i];
    if (L.charCodeAt(0) === 111 && L.charCodeAt(1) === 32) { map = {}; continue; }
    if (L.charCodeAt(0) === 118 && L.charCodeAt(1) === 32) {
      var pr = L.split(' ');
      // double-round so -0.00000 and 0.00000 produce the same key
      var key = nz(pr[1], tol) + '_' + nz(pr[2], tol) + '_' + nz(pr[3], tol);
      seen++;
      if (map[key] === undefined) {
        map[key] = out.length + 1;
        out.push('v ' + pr[1] + ' ' + pr[2] + ' ' + pr[3]);
      }
      remap[seen] = map[key];
    } else if (L.charCodeAt(0) === 102 && L.charCodeAt(1) === 32) {
      var fp = L.split(' ');
      var a = remap[+fp[1]], b = remap[+fp[2]], c = remap[+fp[3]];
      if (a !== b && b !== c && a !== c) faces.push('f ' + a + ' ' + b + ' ' + c);
    } else if (L.charCodeAt(0) === 35) {
      header.push(L);
    }
  }
  var filled = fillHoles(out, faces);
  return { lines: header.concat(filled.verts, filled.faces),
           before: seen, after: filled.verts.length,
           faces: filled.faces.length, holes: filled.holes };
}

// Three.js primitives (cylinders, spheres, tori) are not watertight: their cap
// and pole fans leave unshared edges. Find every boundary loop and fan-fill it.
function fillHoles(vertLines, faceLines) {
  // Identify boundaries by UNDIRECTED edge count.
  var count = new Map(), adj = new Map();
  function key(a, b) { return a < b ? a + '_' + b : b + '_' + a; }
  for (var i = 0; i < faceLines.length; i++) {
    var p = faceLines[i].split(' ');
    var t = [+p[1], +p[2], +p[3]];
    for (var k = 0; k < 3; k++) {
      var kk = key(t[k], t[(k + 1) % 3]);
      count.set(kk, (count.get(kk) || 0) + 1);
    }
  }
  var bEdges = [];
  count.forEach(function (c, kk) { if (c === 1) bEdges.push(kk); });
  if (!bEdges.length) return { verts: vertLines, faces: faceLines, holes: 0 };

  bEdges.forEach(function (kk) {
    var pr = kk.split('_').map(Number);
    if (!adj.has(pr[0])) adj.set(pr[0], []);
    if (!adj.has(pr[1])) adj.set(pr[1], []);
    adj.get(pr[0]).push(pr[1]);
    adj.get(pr[1]).push(pr[0]);
  });

  var coords = vertLines.map(function (l) {
    var q = l.split(' '); return [+q[1], +q[2], +q[3]];
  });
  var verts = vertLines.slice(), faces = faceLines.slice();
  var visited = new Set(), holes = 0;

  adj.forEach(function (_, startV) {
    if (visited.has(startV)) return;
    var loop = [startV], prev = -1, cur = startV, guard = 0;
    visited.add(startV);
    while (guard++ < 200000) {
      var nbrs = adj.get(cur) || [];
      var nxt = -1;
      for (var m = 0; m < nbrs.length; m++) {
        if (nbrs[m] !== prev && !visited.has(nbrs[m])) { nxt = nbrs[m]; break; }
        if (nbrs[m] !== prev && nbrs[m] === startV && loop.length > 2) { nxt = -2; break; }
      }
      if (nxt === -2 || nxt === -1) break;
      loop.push(nxt); visited.add(nxt);
      prev = cur; cur = nxt;
    }
    if (loop.length < 3) return;
    holes++;
    var cx = 0, cy = 0, cz = 0;
    for (var q2 = 0; q2 < loop.length; q2++) {
      var c2 = coords[loop[q2] - 1];
      if (!c2) return;
      cx += c2[0]; cy += c2[1]; cz += c2[2];
    }
    var n = loop.length;
    verts.push('v ' + (cx / n).toFixed(5) + ' ' + (cy / n).toFixed(5) + ' ' + (cz / n).toFixed(5));
    var ci = verts.length;
    for (var m2 = 0; m2 < n; m2++) {
      faces.push('f ' + loop[(m2 + 1) % n] + ' ' + loop[m2] + ' ' + ci);
    }
  });
  return { verts: verts, faces: faces, holes: holes };
}

// The weld + hole-fill pass is synchronous and scales with triangle count. Show
// a busy state and let the browser paint it before blocking.
document.getElementById('exportBtn').addEventListener('click', function () {
  var btn = this;
  if (btn.disabled) return;
  var label = btn.querySelector('span');
  var restore = label ? label.innerHTML : '';
  btn.disabled = true;
  if (label) label.textContent = '导出中 working…';
  setTimeout(function () {
    try { downloadOBJ(exportOBJ(buildingGroup)); }
    finally {
      btn.disabled = false;
      if (label) label.innerHTML = restore;
    }
  }, 40);
});

// ---- 保存图片: the HQ frame, captured in the same task it was drawn in ----
document.getElementById('imgBtn').addEventListener('click', function () {
  renderFrame(true);
  var url = renderer.domElement.toDataURL('image/jpeg', 0.94);
  var a = document.createElement('a');
  a.href = url; a.download = 'gujianmo_' + Date.now() + '.jpg'; a.click();
  requestRender();
});

// ---- design save / load (localStorage) ----
var CONTROL_IDS = ['buildingType', 'pagodaStyle', 'storeys', 'sides', 'doukou', 'classType', 'period',
  'bays', 'purlins', 'roofType', 'tuishan', 'tileScale', 'shengqi', 'cejiao', 'railing', 'caihua', 'caihuaType', 'beasts', 'preset',
  'daylight', 'weather', 'envMode', 'hq', 'shadows', 'groundOn',
  'cTiaoX', 'cTiaoY', 'cAoX', 'cAoY', 'cGaoY',
  'roofColor', 'trimColor', 'woodColor', 'beamColor', 'caihuaColor', 'dgColor', 'wallColor',
  'latticeColor', 'baseColor', 'railColor'];

function snapshotDesign() {
  var d = {};
  CONTROL_IDS.forEach(function (id) { var el = document.getElementById(id); if (el) d[id] = el.value; });
  return d;
}
function applyDesign(d) {
  CONTROL_IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (el && d[id] !== undefined) el.value = d[id];
  });
  rebuild();
}
// Designs saved before the rename still live under the old key, so read it
// once and carry them over rather than silently losing someone's work.
var SAVE_KEY = 'gujianmo_saves', OLD_SAVE_KEY = 'guijian_saves';
function getSaves() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) {
      var old = localStorage.getItem(OLD_SAVE_KEY);
      if (old !== null) { localStorage.setItem(SAVE_KEY, old); return JSON.parse(old); }
    }
    return JSON.parse(raw || '{}');
  }
  catch (e) { return {}; }
}
document.getElementById('saveBtn').addEventListener('click', function () {
  var name = prompt('设计名称 design name:');
  if (!name) return;
  var saves = getSaves();
  saves[name] = snapshotDesign();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saves)); alert('已保存 saved: ' + name); }
  catch (e) { alert('保存失败 save failed'); }
});
document.getElementById('loadBtn').addEventListener('click', function () {
  var saves = getSaves();
  var names = Object.keys(saves);
  if (!names.length) { alert('没有存档 no saved designs'); return; }
  var pick = prompt('读取哪个? load which?\n' + names.join('\n'));
  if (pick && saves[pick]) applyDesign(saves[pick]);
});

applyPreset();
applyDaylight(val('daylight') / 100, document.getElementById('weather').value);
rebuild();
startLoop();
