function rebuild() {
  while (buildingGroup.children.length) buildingGroup.remove(buildingGroup.children[0]);

  var grade   = parseInt(document.getElementById('doukou').value);
  var bays    = parseInt(document.getElementById('bays').value);
  var purlins = parseInt(document.getElementById('purlins').value);
  var isDaShi = document.getElementById('classType').value === 'da';
  var isSong  = document.getElementById('period').value === 'song';
  var roofType = document.getElementById('roofType').value;
  var ribs    = val('tiles');
  var useTuishan  = val('tuishan') > 0.5;
  var useShengqi  = val('shengqi') > 0.5 && isSong;
  var useCejiao   = val('cejiao') > 0.5;

  var D = deriveDimensions(grade, bays, purlins, isDaShi, isSong);

  // scale doukou units into a comfortable scene size
  var scale = 9.0 / D.totalWidth;

  var hw = (D.totalWidth * scale) / 2;
  var hd = (D.totalDepth * scale) / 2;
  var colH = D.colH * scale;
  var baseH = D.baseH * scale;
  var roofRise = D.roofRise * scale;
  var eaveOut = D.eaveOut * scale;
  var upturn = D.cornerRise * scale;

  document.getElementById('dkOut').textContent = grade + '等 (' + D.doukouCun + '寸)';
  document.getElementById('bayOut').textContent = bays;
  document.getElementById('plOut').textContent = purlins;
  document.getElementById('tOut').textContent = ribs;
  document.getElementById('tsOut').textContent = useTuishan ? 'on' : 'off';
  document.getElementById('sqOut').textContent = isSong ? (useShengqi?'on':'off') : 'Qing: n/a';
  document.getElementById('cjOut').textContent = useCejiao ? 'on' : 'off';
  document.getElementById('rlOut').textContent = val('railing') > 0.5 ? 'on' : 'off';
  document.getElementById('chOut').textContent = val('caihua') > 0.5 ? 'on' : 'off';

  var cm = D.doukouCun * 3.2;
  document.getElementById('derived').innerHTML =
    '通面阔 ' + (D.totalWidth*cm/100).toFixed(1) + ' m &nbsp; 通进深 ' + (D.totalDepth*cm/100).toFixed(1) + ' m<br>' +
    '柱高 ' + (D.colH*cm/100).toFixed(2) + ' m &nbsp; 柱径 ' + (D.colDia*cm).toFixed(0) + ' cm<br>' +
    '明间 ' + (D.bayWidths[(bays-1)/2]*cm/100).toFixed(2) + ' m &nbsp; 出檐 ' + (D.eaveOut*cm/100).toFixed(2) + ' m<br>' +
    '举架 ' + D.coeffs.map(function(c){return c.toFixed(2);}).join(' → ') + '<br>' +
    '深:阔 ' + (D.totalDepth/D.totalWidth).toFixed(2) + ' &nbsp; 举高:进深 ' + (D.roofRise/D.totalDepth).toFixed(2);

  function col(id){ return document.getElementById(id).value; }
  var cRoof=col('roofColor'), cTrim=col('trimColor'), cWood=col('woodColor'),
      cBeam=col('beamColor'), cCaihua=col('caihuaColor'), cDg=col('dgColor'),
      cWall=col('wallColor'), cLattice=col('latticeColor'), cBase=col('baseColor'),
      cRail=col('railColor');

  var tileMat   = new THREE.MeshStandardMaterial({ color:C(cRoof), roughness:0.42, metalness:0.12, envMapIntensity:0.28, side:THREE.DoubleSide,
    map: texClone(TEX.tile, 6, 3) });
  var trimMat   = new THREE.MeshStandardMaterial({ color:C(cTrim), roughness:0.75, metalness:0.02, envMapIntensity:0.3 });
  var woodMat   = new THREE.MeshStandardMaterial({ color:C(cWood), roughness:0.7,  metalness:0.03, map: texClone(TEX.wood, 1, 1) });
  var beamMat   = new THREE.MeshStandardMaterial({ color:C(cBeam), roughness:0.66, metalness:0.04, map: texClone(TEX.wood, 2, 0.5) });
  var caihuaMat = new THREE.MeshStandardMaterial({ color:C(cCaihua), roughness:0.55, metalness:0.06 });
  var goldMat   = new THREE.MeshStandardMaterial({ color:C('#c9a94a'), roughness:0.32, metalness:0.65 });
  var dgMat     = new THREE.MeshStandardMaterial({ color:C(cDg), roughness:0.6, metalness:0.06 });
  var wallMat   = new THREE.MeshStandardMaterial({ color:C(cWall), roughness:0.9, metalness:0.0, map: texClone(TEX.plaster, 2, 1) });
  var latticeMat= new THREE.MeshStandardMaterial({ color:C(cLattice), roughness:0.68, metalness:0.03 });
  var baseMat   = new THREE.MeshStandardMaterial({ color:C(cBase), roughness:0.95, metalness:0.0, envMapIntensity:0.25, map: texClone(TEX.stone, 4, 1) });
  var railMat   = new THREE.MeshStandardMaterial({ color:C(cRail), roughness:0.85, metalness:0.0, envMapIntensity:0.25 });
  var paperMat  = new THREE.MeshStandardMaterial({ color:C('#e8dfc6'), roughness:0.95, metalness:0.0 });
  var eaveTrimMat = new THREE.MeshStandardMaterial({ color:C(cTrim), roughness:0.8, metalness:0.02, envMapIntensity:0.3, side:THREE.DoubleSide });
  var rafterMat = new THREE.MeshStandardMaterial({ color:C(cBeam), roughness:0.68, metalness:0.03 });
  var capMat    = new THREE.MeshStandardMaterial({ color:C(cTrim), roughness:0.6, metalness:0.03, envMapIntensity:0.3 });
  var floorMat  = new THREE.MeshStandardMaterial({ color:C('#3a2f26'), roughness:0.9, metalness:0.02 });

  var isPagoda = document.getElementById('buildingType').value === 'pagoda';
  var storeys = parseInt(document.getElementById('storeys').value);
  var sides   = parseInt(document.getElementById('sides').value);
  var pStyle  = document.getElementById('pagodaStyle').value;
  document.getElementById('stOut').textContent = storeys;
  document.getElementById('sdOut').textContent = sides + '边';
  var pgRows = document.querySelectorAll('.pg');
  for (var pi = 0; pi < pgRows.length; pi++)
    pgRows[pi].style.display = isPagoda ? 'block' : 'none';

  if (isPagoda) {
    var pagodaR = hw * 0.62;
    buildingGroup.add(buildBase(pagodaR, pagodaR, baseH, 2, baseMat, trimMat));
    var pg = buildPagoda(D, scale * 0.62, {
      sides: sides, storeys: storeys, style: pStyle,
      ribs: ribs, dougong: isDaShi
    }, {
      tile: tileMat, wood: woodMat, wall: wallMat, rail: railMat,
      dg: dgMat, trim: trimMat, gold: goldMat
    });
    pg.position.y = baseH;
    buildingGroup.add(pg);

    controls.target.set(0, (pg.userData.totalHeight || 10) * 0.42, 0);
    var ptris = 0;
    buildingGroup.traverse(function(o){
      if (o.isMesh && o.geometry.index) ptris += o.geometry.index.count/3;
      else if (o.isMesh) ptris += o.geometry.attributes.position.count/3;
    });
    document.getElementById('stats').textContent =
      Math.round(ptris).toLocaleString() + ' tris · ' + storeys + '层 ' + sides + '边';
    return;
  }

  buildingGroup.add(buildBase(hw, hd, baseH, 2, baseMat, trimMat));

  var floor = new THREE.Mesh(new THREE.BoxGeometry(hw*2, 0.05, hd*2), floorMat);
  floor.position.y = baseH + 0.025; floor.receiveShadow = true;
  buildingGroup.add(floor);

  var colR = D.colDia * scale / 2;
  buildingGroup.add(buildWalls(hw, hd, baseH, colH, wallMat, colR));
  buildingGroup.add(buildColumns(D, scale, baseH, woodMat, beamMat, baseMat, useShengqi, useCejiao));
  buildingGroup.add(buildLattice(hw, hd, baseH, colH, bays, latticeMat, paperMat, colR));

  if (val('railing') > 0.5) buildingGroup.add(buildBalustrade(hw + 0.5, hd + 0.5, baseH, railMat));
  if (val('caihua') > 0.5) {
    var beamH = D.colDia * scale * 0.8;
    buildingGroup.add(buildCaihua(hw, hd, baseH + colH - beamH*0.7, beamH, beamMat, caihuaMat, goldMat, colR));
  }

  var steps = buildSteps(hw, baseH, 2, baseMat, railMat);
  steps.position.z = hd + 0.65;
  buildingGroup.add(steps);

  var eaveY = baseH + colH;
  if (isDaShi) {
    var dg = buildDougong(hw - 0.2, hd - 0.2, eaveY + 0.02, dgMat);
    buildingGroup.add(dg);
    eaveY += 0.02 + (dg.userData.height || 0.2);
  }

  var roof = buildRoof({
    halfWidth: hw + eaveOut, halfDepth: hd + eaveOut,
    roofHeight: roofRise, upturn: upturn,
    roofType: roofType, gableFrac: 0.45, ribs: ribs,
    shellThick: Math.max(0.05, D.purlinDia * scale * 0.5),
    tuishan: useTuishan, purlinDia: D.purlinDia * scale,
    rafterMat: rafterMat, eaveTrimMat: eaveTrimMat, capMat: capMat,
    tileMat: tileMat, gableMat: wallMat, trimMat: trimMat
  });
  roof.position.y = eaveY;
  buildingGroup.add(roof);

  controls.target.set(0, (baseH + colH + roofRise) * 0.45, 0);

  var tris = 0;
  buildingGroup.traverse(function(o){
    if (o.isMesh && o.geometry.index) tris += o.geometry.index.count/3;
    else if (o.isMesh) tris += o.geometry.attributes.position.count/3;
  });
  var meshes = 0;
  buildingGroup.traverse(function(o){ if (o.isMesh) meshes++; });
  document.getElementById('stats').textContent =
    Math.round(tris).toLocaleString() + ' tris · ' + meshes + ' meshes';
}

function applyPreset() {
  var p = PRESETS[document.getElementById('preset').value];
  if (!p) return;
  var map = { roofColor:'roof', trimColor:'trim', woodColor:'wood', beamColor:'beam',
              caihuaColor:'caihua', dgColor:'dg', wallColor:'wall', latticeColor:'lattice',
              baseColor:'base', railColor:'rail' };
  Object.keys(map).forEach(function(id){ document.getElementById(id).value = p[map[id]]; });
}
document.getElementById('preset').addEventListener('change', function(){
  applyPreset();
  rebuild();
});

['buildingType','pagodaStyle','storeys','sides',
 'doukou','classType','period','bays','purlins','roofType','tuishan','tiles','shengqi','cejiao',
 'railing','caihua','roofColor','trimColor','woodColor','beamColor','caihuaColor',
 'dgColor','wallColor','latticeColor','baseColor','railColor'].forEach(function(id){
  document.getElementById(id).addEventListener('input', rebuild);
});

function exportOBJ(group) {
  var lines = ['# Chinese architecture generator'];
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
        lines.push('f ' + (idx.getX(k)+off) + ' ' + (idx.getX(k+1)+off) + ' ' + (idx.getX(k+2)+off));
    } else {
      for (var k2 = 0; k2 < pos.count; k2 += 3)
        lines.push('f ' + (k2+off) + ' ' + (k2+1+off) + ' ' + (k2+2+off));
    }
    off += pos.count;
  }

  var partNo = 0;
  group.traverse(function(o){
    if (!o.isMesh) return;
    partNo++;
    if (o.isInstancedMesh) {
      // flatten every instance into real geometry, else the export loses them all
      var inst = new THREE.Matrix4(), world = new THREE.Matrix4();
      for (var n = 0; n < o.count; n++) {
        o.getMatrixAt(n, inst);
        world.multiplyMatrices(o.matrixWorld, inst);
        writeGeo(o.geometry, world, 'part' + partNo + '_i' + n);
      }
    } else {
      writeGeo(o.geometry, o.matrixWorld, 'part' + partNo);
    }
  });

  var w = weldOBJ(lines, 5);
  var pct = (100 * (1 - w.after / Math.max(w.before,1))).toFixed(1);
  console.log('OBJ export: ' + w.before + ' -> ' + w.after + ' verts welded ('
              + pct + '% reduction), ' + w.faces + ' triangles, '
              + (w.holes || 0) + ' holes filled');
  var blob = new Blob([w.lines.join('\n')], {type:'text/plain'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'guijian_model.obj'; a.click();
  URL.revokeObjectURL(url);
}

// Weld coincident vertices across the whole export. Without this the file carries
// one unshared vertex per triangle corner -- huge files and non-manifold shells
// that slicers refuse. This is the single biggest print-readiness win.
function nz(v, tol) { return (+((+v).toFixed(tol))).toFixed(tol); }

function weldOBJ(lines, tol) {
  tol = tol || 5;
  var faces = [], header = [];
  var out = [], seen = 0, remap = [];
  // Weld PER PART, not globally. Welding across parts fuses vertices where two
  // separate solids happen to touch, producing edges shared by 4 faces (non-
  // manifold). Kept separate, each part stays a closed solid and slicers union
  // them at slice time -- which is the correct representation for printing.
  var map = {};
  for (var i = 0; i < lines.length; i++) {
    var L = lines[i];
    if (L.charCodeAt(0) === 111 && L.charCodeAt(1) === 32) {        // "o " new part
      map = {};
      continue;
    }
    if (L.charCodeAt(0) === 118 && L.charCodeAt(1) === 32) {        // "v "
      var pr = L.split(' ');
      // double-round so -0.00000 and 0.00000 produce the same key. Without this,
      // seam vertices (sin(2*PI) = -2.4e-16) never weld and leave a seam hole.
      var key = nz(pr[1], tol) + '_' + nz(pr[2], tol) + '_' + nz(pr[3], tol);
      seen++;
      if (map[key] === undefined) {
        map[key] = out.length + 1;
        out.push('v ' + pr[1] + ' ' + pr[2] + ' ' + pr[3]);
      }
      remap[seen] = map[key];
    } else if (L.charCodeAt(0) === 102 && L.charCodeAt(1) === 32) { // "f "
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
// and pole fans leave unshared edges. Find every boundary loop and fan-fill it
// so the exported solid is closed and slicers need no repair.
function fillHoles(vertLines, faceLines) {
  // Identify boundaries by UNDIRECTED edge count. Using directed edges gives
  // false positives wherever winding is inconsistent, and patching those
  // already-closed regions creates non-manifold geometry.
  var count = new Map(), adj = new Map();
  function key(a,b){ return a < b ? a+'_'+b : b+'_'+a; }
  for (var i = 0; i < faceLines.length; i++) {
    var p = faceLines[i].split(' ');
    var t = [+p[1], +p[2], +p[3]];
    for (var k = 0; k < 3; k++) {
      var kk = key(t[k], t[(k+1)%3]);
      count.set(kk, (count.get(kk) || 0) + 1);
    }
  }
  var bEdges = [];
  count.forEach(function(c, kk){ if (c === 1) bEdges.push(kk); });
  if (!bEdges.length) return { verts: vertLines, faces: faceLines, holes: 0 };

  bEdges.forEach(function(kk){
    var pr = kk.split('_').map(Number);
    if (!adj.has(pr[0])) adj.set(pr[0], []);
    if (!adj.has(pr[1])) adj.set(pr[1], []);
    adj.get(pr[0]).push(pr[1]);
    adj.get(pr[1]).push(pr[0]);
  });

  var coords = vertLines.map(function(l){
    var q = l.split(' '); return [+q[1], +q[2], +q[3]];
  });
  var verts = vertLines.slice(), faces = faceLines.slice();
  var visited = new Set(), holes = 0;

  adj.forEach(function(_, startV){
    if (visited.has(startV)) return;
    // walk the boundary loop
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
    var cx=0, cy=0, cz=0;
    for (var q2 = 0; q2 < loop.length; q2++) {
      var c2 = coords[loop[q2]-1];
      if (!c2) return;
      cx += c2[0]; cy += c2[1]; cz += c2[2];
    }
    var n = loop.length;
    verts.push('v ' + (cx/n).toFixed(5) + ' ' + (cy/n).toFixed(5) + ' ' + (cz/n).toFixed(5));
    var ci = verts.length;
    for (var m2 = 0; m2 < n; m2++) {
      faces.push('f ' + loop[(m2+1) % n] + ' ' + loop[m2] + ' ' + ci);
    }
  });
  return { verts: verts, faces: faces, holes: holes };
}

document.getElementById('exportBtn').addEventListener('click', function(){ exportOBJ(buildingGroup); });

// ---- 保存图片 JPEG capture ----
document.getElementById('imgBtn').addEventListener('click', function(){
  renderer.render(scene, camera);
  var url = renderer.domElement.toDataURL('image/jpeg', 0.92);
  var a = document.createElement('a');
  a.href = url; a.download = 'guijian_' + Date.now() + '.jpg'; a.click();
});

// ---- design save / load (localStorage, like the reference tool) ----
var CONTROL_IDS = ['buildingType','pagodaStyle','storeys','sides','doukou','classType','period',
  'bays','purlins','roofType','tuishan','tiles','shengqi','cejiao','railing','caihua','preset',
  'roofColor','trimColor','woodColor','beamColor','caihuaColor','dgColor','wallColor',
  'latticeColor','baseColor','railColor'];

function snapshotDesign() {
  var d = {};
  CONTROL_IDS.forEach(function(id){ d[id] = document.getElementById(id).value; });
  return d;
}
function applyDesign(d) {
  CONTROL_IDS.forEach(function(id){
    if (d[id] !== undefined) document.getElementById(id).value = d[id];
  });
  rebuild();
}
function getSaves() {
  try { return JSON.parse(localStorage.getItem('guijian_saves') || '{}'); }
  catch(e) { return {}; }
}
document.getElementById('saveBtn').addEventListener('click', function(){
  var name = prompt('设计名称 design name:');
  if (!name) return;
  var saves = getSaves();
  saves[name] = snapshotDesign();
  try { localStorage.setItem('guijian_saves', JSON.stringify(saves)); alert('已保存 saved: ' + name); }
  catch(e) { alert('保存失败 save failed'); }
});
document.getElementById('loadBtn').addEventListener('click', function(){
  var saves = getSaves();
  var names = Object.keys(saves);
  if (!names.length) { alert('没有存档 no saved designs'); return; }
  var pick = prompt('读取哪个? load which?\n' + names.join('\n'));
  if (pick && saves[pick]) applyDesign(saves[pick]);
});


window.addEventListener('resize', function(){
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

applyPreset();
rebuild();
(function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();
