// ============================================================================
//  GEOMETRY UTILITIES
// ============================================================================

// ---------------------------------------------------------------------------
//  mergeStatic — the building is assembled from thousands of small parts
//  (every 斗, 栱, 望柱, 净瓶, muntin). As separate meshes that is thousands of
//  draw calls, twice over with shadows. This folds every non-instanced mesh
//  into one geometry per material, which takes a hall from ~5000 draw calls
//  to a few dozen.
//
//  The OBJ export must still see separate closed parts -- welding two touching
//  solids into one part is what makes non-manifold edges (README, Export) --
//  so each merged mesh keeps the original geometry + matrix of every part it
//  swallowed in userData.parts, and exportOBJ() walks those instead.
// ---------------------------------------------------------------------------
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  var inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  var buckets = {}, order = [], victims = [];

  root.traverse(function (o) {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep) return;
    if (Array.isArray(o.material) || !o.geometry.attributes.position) return;
    var key = o.material.uuid + (o.castShadow ? 'c' : '-') + (o.receiveShadow ? 'r' : '-');
    var b = buckets[key];
    if (!b) {
      b = buckets[key] = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, parts: [], verts: 0 };
      order.push(key);
    }
    var m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    var g = o.geometry;
    b.parts.push({ geometry: g, matrix: m });
    b.verts += g.index ? g.index.count : g.attributes.position.count;
    victims.push(o);
  });

  victims.forEach(function (o) { o.parent.remove(o); });
  pruneEmpty(root);

  var nm = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  order.forEach(function (key) {
    var b = buckets[key];
    var P = new Float32Array(b.verts * 3), N = new Float32Array(b.verts * 3), U = new Float32Array(b.verts * 2);
    var w = 0;
    b.parts.forEach(function (part) {
      var g = part.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
      var idx = g.index;
      nm.getNormalMatrix(part.matrix);
      var flip = part.matrix.determinant() < 0;
      var count = idx ? idx.count : pos.count;
      for (var i = 0; i < count; i++) {
        // a mirrored part reverses winding; swap two corners of each triangle
        var ii = i;
        if (flip) { var r = i % 3; ii = r === 1 ? i + 1 : r === 2 ? i - 1 : i; }
        var k = idx ? idx.getX(ii) : ii;
        v.fromBufferAttribute(pos, k).applyMatrix4(part.matrix);
        P[w * 3] = v.x; P[w * 3 + 1] = v.y; P[w * 3 + 2] = v.z;
        if (nor) {
          n.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize();
          N[w * 3] = n.x; N[w * 3 + 1] = n.y; N[w * 3 + 2] = n.z;
        }
        if (uv) { U[w * 2] = uv.getX(k); U[w * 2 + 1] = uv.getY(k); }
        w++;
      }
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.computeBoundingSphere();
    var mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
    mesh.userData.parts = b.parts;
    mesh.userData.merged = true;
    root.add(mesh);
  });
}

function pruneEmpty(o) {
  for (var i = o.children.length - 1; i >= 0; i--) {
    var c = o.children[i];
    pruneEmpty(c);
    if (!c.isMesh && !c.isLight && c.children.length === 0 && c.type === 'Group') o.remove(c);
  }
}

// ---------------------------------------------------------------------------
//  sweep — extrude a 2-D section along a 3-D path. Sections stand vertical
//  (local up is world +Y, local lateral is the horizontal normal to the path),
//  which is how a ridge sits on a roof: its sides plumb whatever the slope it
//  rides. Each section edge gets its own vertex strip so arrises stay crisp;
//  both ends are capped, so the result is a closed solid for the export.
//
//  path:    [Vector3...] (2+ points)
//  section: [[lat, up]...] polygon, either winding
//  opts:    { lateral: fn(i) -> Vector3 (override), caps: true }
// ---------------------------------------------------------------------------
function sweepGeometry(path, section, opts) {
  opts = opts || {};
  var n = path.length, m = section.length;
  // force counter-clockwise so outward normals come out of the winding
  var area = 0;
  for (var a = 0; a < m; a++) {
    var p0 = section[a], p1 = section[(a + 1) % m];
    area += p0[0] * p1[1] - p1[0] * p0[1];
  }
  if (area < 0) section = section.slice().reverse();

  var Y = new THREE.Vector3(0, 1, 0);
  var lat = [], arc = [0];
  for (var i = 0; i < n; i++) {
    var prev = path[Math.max(0, i - 1)], next = path[Math.min(n - 1, i + 1)];
    var T = new THREE.Vector3().subVectors(next, prev);
    var L;
    if (opts.lateral) L = opts.lateral(i);
    else {
      L = new THREE.Vector3().crossVectors(Y, T);
      if (L.lengthSq() < 1e-12) L.set(1, 0, 0);
      L.normalize();
    }
    lat.push(L);
    if (i > 0) arc.push(arc[i - 1] + path[i].distanceTo(path[i - 1]));
  }
  function at(i, s, out) {
    return out.copy(path[i]).addScaledVector(lat[i], s[0]).addScaledVector(Y, s[1]);
  }

  var pos = [], uvs = [], idx = [], tmp = new THREE.Vector3();
  var per = [0];
  for (var k = 0; k < m; k++) {
    var s0 = section[k], s1 = section[(k + 1) % m];
    per.push(per[k] + Math.hypot(s1[0] - s0[0], s1[1] - s0[1]));
  }
  for (var e = 0; e < m; e++) {
    var sa = section[e], sb = section[(e + 1) % m];
    var base = pos.length / 3;
    for (var j = 0; j < n; j++) {
      at(j, sa, tmp); pos.push(tmp.x, tmp.y, tmp.z); uvs.push(arc[j], per[e]);
      at(j, sb, tmp); pos.push(tmp.x, tmp.y, tmp.z); uvs.push(arc[j], per[e + 1]);
    }
    for (var j2 = 0; j2 < n - 1; j2++) {
      var A = base + j2 * 2, B = A + 1, Cc = A + 2, D = A + 3;
      // (A, B, C): lateral-edge cross along-path points outward for a CCW section
      idx.push(A, B, Cc, B, D, Cc);
    }
  }
  if (opts.caps !== false) {
    var contour = section.map(function (s) { return new THREE.Vector2(s[0], s[1]); });
    var tris = THREE.ShapeUtils.triangulateShape(contour, []);
    [0, n - 1].forEach(function (pi, end) {
      var base2 = pos.length / 3;
      for (var c = 0; c < m; c++) {
        at(pi, section[c], tmp); pos.push(tmp.x, tmp.y, tmp.z); uvs.push(section[c][0], section[c][1]);
      }
      tris.forEach(function (t) {
        if (end) idx.push(base2 + t[0], base2 + t[1], base2 + t[2]);
        else idx.push(base2 + t[0], base2 + t[2], base2 + t[1]);
      });
    });
  }
  var geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  // decide the winding empirically: if the first strip's normal points at the
  // path rather than away from it, the path runs the other way -- flip all
  geo.userData.ownUVs = true;
  fixWindingOutward(geo, path);
  return geo;
}

// Orientation check for swept and lofted solids: average (normal . (p - c))
// over the side faces should be positive for an outward-facing closed solid.
function fixWindingOutward(geo, path) {
  var pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index;
  var c = new THREE.Vector3();
  path.forEach(function (p) { c.add(p); });
  c.multiplyScalar(1 / path.length);
  var s = 0, p = new THREE.Vector3(), nn = new THREE.Vector3();
  var step = Math.max(1, Math.floor(pos.count / 400));
  for (var i = 0; i < pos.count; i += step) {
    p.fromBufferAttribute(pos, i).sub(c);
    nn.fromBufferAttribute(nor, i);
    s += p.dot(nn);
  }
  if (s < 0) {
    var a = idx.array;
    for (var t = 0; t < a.length; t += 3) { var tmp = a[t + 1]; a[t + 1] = a[t + 2]; a[t + 2] = tmp; }
    idx.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

// a square frustum -- the 斗 of a bracket set: wide mouth up, narrow foot down
var _frustumCache = {};
function frustumGeo(wTop, wBot, h) {
  var key = wTop.toFixed(5) + ',' + wBot.toFixed(5) + ',' + h.toFixed(5);
  if (_frustumCache[key]) return _frustumCache[key];
  var g = new THREE.CylinderGeometry(wTop * Math.SQRT1_2, wBot * Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.computeVertexNormals();
  // a 4-sided cylinder carries smooth normals around its corners; give it
  // flat ones so the 斗 reads as cut timber, not a soap bar
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return (_frustumCache[key] = g);
}
function clearGeoCaches() { _frustumCache = {}; }

// Mesh helper: geometry + material + transform in one call, shadows on.
function part(geo, mat, x, y, z, ry, parent) {
  var m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (ry) m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// lathe a profile given as [[r, y]...] bottom to top -- 净瓶 balusters,
// 柱头 finials, the 宝顶
function latheGeo(profile, segs) {
  var pts = profile.map(function (p) { return new THREE.Vector2(Math.max(0.0001, p[0]), p[1]); });
  return new THREE.LatheGeometry(pts, segs || 16);
}
