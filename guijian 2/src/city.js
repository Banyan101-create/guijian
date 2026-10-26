// ============================================================================
//  城 THE CITY — lots, blocks, avenues, the wall, and the country beyond
//
//  Laid out the way old Beijing was: hutong running east-west between blocks
//  of 四合院, each house facing south with its gate in the south-east corner;
//  broad avenues north-south lined with shops and trees; the great houses of
//  princes (green tiles, red walls), temples, a drum and a bell tower, lakes;
//  a grey brick city wall with its gate towers, barbicans and corner towers;
//  the moat; suburbs along the roads out; villages among the fields.
//
//  Colour follows rank, as the sumptuary rules had it: yellow glazed tiles
//  for the emperor, green for princes and temples, red gates for officials,
//  grey tile and brick and dark paintwork for everyone else.
//
//  All coordinates are scene units; sizes are given in metres and multiplied
//  by M.
// ============================================================================

var KIT_DIMS = { house: [10, 6, 3.2], houseJ: [10, 6, 3.1], two: [10, 7, 6.4], shop2: [10, 7, 6.4], shop1: [8, 8, 3.8], gate: [4.4, 5.4, 3.6], shed: [3.4, 2.6, 2.4] };
var KIT_WALLH = { wall: 3.2, wallR: 4.4, wallRG: 4.4, wallRK: 4.0 };

function lotTint(r) {
  var k = 0.82 + 0.32 * r(), w = (r() - 0.5) * 0.1;
  if (r() < 0.14) return [k * 0.92, k, k * 0.88];                // moss on an old roof
  return [k * (1 + w), k, k * (1 - w)];
}
function jit(t, r, a) { var k = 1 + (r() - 0.5) * (a || 0.12); return [t[0] * k, t[1] * k, t[2] * k]; }
function pick(r, w) { var s = 0, x = r(); for (var i = 0; i < w.length; i++) { s += w[i]; if (x < s) return i; } return w.length - 1; }
function pickTree(r) { return pick(r, [0.34, 0.24, 0.05, 0.06, 0.1, 0.21]); }

function putHouse(ctx, kind, x, z, rot, L, D, He, tint, v, lit) {
  var K = KIT_DIMS[kind];
  ctx.F.put(kind, x, z, rot, L / K[0], He / K[2], D / K[1], tint, v, lit);
}
function wallLine(ctx, xa, za, xb, zb, kind, tint, h) {
  var len = Math.hypot(xb - xa, zb - za) / ctx.M;
  if (len < 0.4) return;
  kind = kind || 'wall';
  var along = Math.abs(xb - xa) >= Math.abs(zb - za), hh = KIT_WALLH[kind];
  ctx.F.put(kind, (xa + xb) / 2, (za + zb) / 2, along ? 0 : Math.PI / 2, len, (h || hh) / hh, 1, tint);
}
function rectHit(R, x0, x1, z0, z1) { return x0 < R.x1 && x1 > R.x0 && z0 < R.z1 && z1 > R.z0; }
function blocked(ctx, x0, x1, z0, z1) {
  var H = ctx.holes;
  for (var i = 0; i < H.length; i++) {
    var h = H[i];
    if (h.fn) { if (h.fn((x0 + x1) / 2, (z0 + z1) / 2) || h.fn(x0, z0) || h.fn(x1, z0) || h.fn(x0, z1) || h.fn(x1, z1)) return true; }
    else if (rectHit(h, x0, x1, z0, z1)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
//  四合院: one lot, x0..x1 west to east, zN..zS north to south, the lane on
//  its south side. Its size decides how many courts it has; chance decides
//  the rest.
// ---------------------------------------------------------------------------
function composeLot(ctx, x0, x1, zN, zS, o) {
  o = o || {};
  var M = ctx.M, F = ctx.F, r = ctx.rnd;
  function m(v) { return v * M; }
  var W = (x1 - x0) / M, Dd = (zS - zN) / M;
  if (W < 8 || Dd < 14) return;
  var tint = o.tint || lotTint(r);
  var fv = pick(r, [0.45, 0.18, 0.22, 0.15]);
  var lit = r() < 0.74 ? 1 : 0;
  var type = o.type || (W < 13 || Dd < 27 ? 'small' : Dd < 43 ? 'one' : Dd < 58 ? 'two' : 'three');
  if (type !== 'small' && W < 15) type = 'small';
  var messy = !o.tidy && r() < 0.2;                         // a 大杂院, many families
  if (messy) fv = 3;
  var official = (type === 'two' || type === 'three') && W > 22 && r() < 0.45;
  var gv = official ? 0 : pick(r, [0, 0.5, 0.2, 0.3]);
  var cx = (x0 + x1) / 2;

  wallLine(ctx, x0, zN, x1, zN, 'wall', tint);
  wallLine(ctx, x0, zN, x0, zS, 'wall', tint);
  if (o.east) wallLine(ctx, x1, zN, x1, zS, 'wall', tint);
  var gw = type === 'small' ? 3.2 : 3.8 + r() * 0.8;
  var gWest = o.gateWest;
  var gx = gWest ? x0 + m(0.6 + gw / 2) : x1 - m(0.6 + gw / 2);
  wallLine(ctx, x0, zS, gx - m(gw / 2), zS, 'wall', tint);
  wallLine(ctx, gx + m(gw / 2), zS, x1, zS, 'wall', tint);
  putHouse(ctx, 'gate', gx, zS - m(2.1), 0, gw, 5.4, type === 'small' ? 3.1 : 3.4 + (official ? 0.5 : 0), jit(tint, r), gv, r() < 0.45 ? 1 : 0);

  if (type === 'small') {
    var Ls = W - 1.2, Ds = Math.min(6, Dd * 0.35);
    putHouse(ctx, r() < 0.2 ? 'houseJ' : 'house', cx, zN + m(0.45 + Ds / 2), 0, Ls, Ds, 2.9 + r() * 0.4, jit(tint, r), fv, lit);
    var y0 = zN + m(0.45 + Ds + 0.6), y1 = zS - m(5.2);
    if (y1 - y0 > m(2)) F.put('pave', cx, (y0 + y1) / 2, 0, W - 1.2, 1, (y1 - y0) / M, tint);
    if (r() < 0.55) putHouse(ctx, 'shed', x0 + m(2.0), (y0 + y1) / 2, Math.PI / 2, 3 + r(), 2.6, 2.4, jit(tint, r), 3, 0);
    if (r() < 0.7) F.tree(pickTree(r), x1 - m(3), (y0 + y1) / 2 + m((r() - 0.5) * 2), 0.75 + r() * 0.4);
    return;
  }

  var zIn0 = zN, zIn1;
  if (type === 'three') {
    // 后罩房 across the back: a row of rooms, sometimes a storeyed 后罩楼
    var bd = 5.6, two = r() < 0.45;
    putHouse(ctx, two ? 'two' : 'house', cx, zN + m(0.45 + bd / 2), 0, W - 1.2, bd, two ? 6.2 : 3.0, jit(tint, r), fv, lit);
    zIn0 = zN + m(0.45 + bd + 3.2);
    wallLine(ctx, x0, zIn0, x0 + m(2.2), zIn0, 'wall', tint);
    wallLine(ctx, x0 + m(4.4), zIn0, x1, zIn0, 'wall', tint);
    F.put('pave', cx, zN + m(0.45 + bd + 1.6), 0, W - 1.2, 1, 2.8, tint);
    if (r() < 0.6) F.tree(pickTree(r), x1 - m(3), zN + m(0.45 + bd + 1.6), 0.8 + r() * 0.3);
  }
  // 倒座: the south range, its back to the lane
  if (W >= 16) {
    var Lr = W - gw - 2.0, rx0 = gWest ? gx + m(gw / 2 + 0.3) : x0 + m(0.5);
    putHouse(ctx, 'house', rx0 + m(Lr / 2), zS - m(0.45 + 2.5), Math.PI, Lr, 5.0, 3.0, jit(tint, r), fv, r() < 0.6 ? lit : 0);
  }
  if (type === 'two' || type === 'three') {
    var fd = 9.5 + r() * 2.2, zc = zS - m(fd);
    wallLine(ctx, x0, zc, cx - m(1.7), zc, 'wall', tint);
    wallLine(ctx, cx + m(1.7), zc, x1, zc, 'wall', tint);
    F.put('chuihua', cx, zc, 0, 1, 1, 1, tint);
    var f0 = zc + m(0.4), f1 = zS - m(5.6);
    if (f1 - f0 > m(1.5)) F.put('pave', cx, (f0 + f1) / 2, 0, W - 1.2, 1, (f1 - f0) / M, tint);
    // 影壁: the screen wall that faces the gate from inside
    wallLine(ctx, gx - m(1.9), zS - m(6.4), gx + m(1.9), zS - m(6.4), 'wall', tint, 2.8);
    zIn1 = zc;
  } else zIn1 = zS - m(W >= 16 ? 5.6 : 0.6);

  // the inner court: 正房 to the north, 厢房 either side
  var Dm = 6.2 + r() * 1.2, Hm = 3.3 + r() * 0.5, side = W >= 18, Dsd = 5.0 + r() * 0.5;
  var Lm = side ? Math.min(W - 2 * (Dsd + 0.6) - 0.4, 12 + r() * 3) : W - 1.2;
  putHouse(ctx, r() < 0.12 ? 'houseJ' : 'house', cx, zIn0 + m(0.45 + Dm / 2), 0, Lm, Dm, Hm, jit(tint, r, 0.06), fv, lit);
  var earL = (W - Lm) / 2 - 0.9;
  if (earL > 2.6) {
    [-1, 1].forEach(function (s) {
      putHouse(ctx, 'house', cx + s * m(Lm / 2 + Math.min(earL, 5) / 2 + 0.15), zIn0 + m(0.45 + (Dm - 1) / 2), 0,
        Math.min(earL, 5), Dm - 1, Hm - 0.6, jit(tint, r), fv, r() < 0.5 ? lit : 0);
    });
  }
  var cz0 = zIn0 + m(0.45 + Dm + 0.8), cz1 = zIn1 - m(0.6), courtD = (cz1 - cz0) / M;
  if (side && courtD > 7) {
    var Lsd = Math.min(courtD - 1.5, 9 + r() * 3), zs = (cz0 + cz1) / 2;
    putHouse(ctx, 'house', x0 + m(0.45 + Dsd / 2), zs, Math.PI / 2, Lsd, Dsd, 3.0, jit(tint, r), fv, r() < 0.7 ? lit : 0);
    putHouse(ctx, 'house', x1 - m(0.45 + Dsd / 2), zs, -Math.PI / 2, Lsd, Dsd, 3.0, jit(tint, r), fv, r() < 0.7 ? lit : 0);
  }
  var px0 = x0 + m(side ? Dsd + 1.0 : 0.6), px1 = x1 - m(side ? Dsd + 1.0 : 0.6);
  if (cz1 - cz0 > m(2) && px1 - px0 > m(2)) F.put('pave', (px0 + px1) / 2, (cz0 + cz1) / 2, 0, (px1 - px0) / M, 1, (cz1 - cz0) / M, tint);
  // trees in the quarters of the court; a 大杂院 has lost most of them
  var nt = messy ? (r() < 0.5 ? 1 : 0) : 1 + (r() < 0.6 ? 1 : 0) + (r() < 0.18 ? 1 : 0);
  for (var t = 0; t < nt; t++) {
    var qx = t % 2 ? px1 - m(2.3) : px0 + m(2.3), qz = t < 2 ? cz1 - m(2.6) : cz0 + m(2.6);
    if (courtD < 6) qz = (cz0 + cz1) / 2;
    F.tree(pickTree(r), qx + m((r() - 0.5) * 1.4), qz + m((r() - 0.5) * 1.4), 0.78 + r() * 0.45);
  }
  if (!messy && r() < 0.22) F.put('trellis', cx + m((r() - 0.5) * 3), cz0 + m(2.3), 0, 1, 1, 1, tint);
  if (r() < 0.2) F.put('well', px1 - m(1.5), cz1 - m(1.4), 0, 1, 1, 1, tint);
  if (messy || r() < 0.25) F.put('clutter', px0 + m(1.3), cz1 - m(1.1), r() * 6.28, 1, 1, 1, tint);
  if (messy) {
    // sheds built out into the court by every family that could
    var ns = 2 + Math.floor(r() * 3);
    for (var s = 0; s < ns; s++) {
      var e = s % 3, sl = 2.6 + r() * 1.6;
      if (e === 0) putHouse(ctx, 'shed', px0 + m(1.4), cz0 + (cz1 - cz0) * (0.25 + 0.5 * r()), Math.PI / 2, sl, 2.6, 2.4, jit(tint, r), 0, 0);
      else if (e === 1) putHouse(ctx, 'shed', px1 - m(1.4), cz0 + (cz1 - cz0) * (0.25 + 0.5 * r()), -Math.PI / 2, sl, 2.6, 2.4, jit(tint, r), 0, 0);
      else putHouse(ctx, 'shed', px0 + (px1 - px0) * (0.3 + 0.4 * r()), cz1 - m(1.4), Math.PI, sl, 2.6, 2.4, jit(tint, r), 0, 0);
    }
    F.put('clutter', px1 - m(1.4), cz0 + m(1.2), r() * 6.28, 1, 1, 1, tint);
  }
}

// a row of shops along a street. The row runs along `axis` ('z': a
// north-south street, shops facing east or west; 'x': an east-west street,
// shops facing north or south) from a to b; `edge` is the street's edge and
// `into` the direction the row extends away from the street.
function shopRow(ctx, axis, edge, a, b, into, o) {
  o = o || {};
  var M = ctx.M, r = ctx.rnd;
  function m(v) { return v * M; }
  var rot = axis === 'z' ? -into * Math.PI / 2 : (into > 0 ? Math.PI : 0);
  var p = a, depth = o.depth || 16;
  while (b - p > m(5)) {
    var w = Math.min(6.5 + r() * 6, (b - p) / M);
    if ((b - p) / M - w < 5) w = (b - p) / M;
    var kind = o.kinds ? o.kinds[pick(r, o.weights)] : (r() < 0.38 ? 'shop2' : 'shop1');
    var D = kind === 'shop1' ? 7.5 + r() : 7 + r() * 0.6, He = kind === 'shop1' ? 3.6 + r() * 0.5 : 6.0 + r() * 0.6;
    if (kind === 'house') { D = 6; He = 3.1 + r() * 0.3; }
    var off = edge + into * m(0.6 + D / 2), along = p + m(w / 2);
    var tint = lotTint(r), v = Math.floor(r() * 4), lit = r() < 0.9 ? 1 : 0;
    if (axis === 'z') putHouse(ctx, kind, off, along, rot, w - 0.15, D, He, tint, v, lit);
    else putHouse(ctx, kind, along, off, rot, w - 0.15, D, He, tint, v, lit);
    // the shop's back yard, walled, sometimes a tree
    var by = edge + into * m(D + 1.2 + 4.5);
    if (r() < 0.35) {
      if (axis === 'z') ctx.F.tree(pickTree(r), by, along, 0.7 + r() * 0.3);
      else ctx.F.tree(pickTree(r), along, by, 0.7 + r() * 0.3);
    }
    p += m(w);
  }
  var back = edge + into * m(depth - 0.3);
  if (axis === 'z') wallLine(ctx, back, a, back, b, 'wall', lotTint(r));
  else wallLine(ctx, a, back, b, back, 'wall', lotTint(r));
}

// a block between streets, filled with lots in strips; hutong between strips
function fillBlock(ctx, B, o) {
  var M = ctx.M, r = ctx.rnd;
  function m(v) { return v * M; }
  var ix0 = B.x0, ix1 = B.x1;
  if (o.shopW && B.x1 - B.x0 > m(60)) { shopRow(ctx, 'z', B.x0, B.z0 + m(2), B.z1 - m(2), 1); ix0 = B.x0 + m(17); }
  if (o.shopE && B.x1 - B.x0 > m(60)) { shopRow(ctx, 'z', B.x1, B.z0 + m(2), B.z1 - m(2), -1); ix1 = B.x1 - m(17); }
  var z = B.z0 + m(0.8);
  var depths = [30, 36, 40, 46, 52, 58, 64], dw = [0.12, 0.18, 0.2, 0.18, 0.14, 0.1, 0.08];
  while (B.z1 - z > m(18)) {
    var d = depths[pick(r, dw)];
    if ((B.z1 - z) / M - d < 18) d = (B.z1 - z) / M - 0.8;
    var zN = z, zS = z + m(d);
    // cut the strip into lots of varied width
    var cuts = [ix0], x = ix0;
    while (ix1 - x > m(8)) {
      var w = 12 + r() * 21;
      if ((ix1 - x) / M - w < 11) w = (ix1 - x) / M;
      x += m(w);
      cuts.push(Math.min(x, ix1));
    }
    var ok = [];
    for (var i = 0; i < cuts.length - 1; i++) ok.push(!blocked(ctx, cuts[i], cuts[i + 1], zN, zS));
    for (var j = 0; j < cuts.length - 1; j++) {
      if (!ok[j]) continue;
      composeLot(ctx, cuts[j], cuts[j + 1], zN, zS, { east: j === cuts.length - 2 || !ok[j + 1], gateWest: r() < 0.12 });
    }
    // the hutong: an old tree here and there by the walls
    var lane = 6 + r() * 3;
    for (var tx = ix0 + m(6 + r() * 20); tx < ix1 - m(4); tx += m(28 + r() * 40)) {
      if (r() < 0.55 && !blocked(ctx, tx - m(2), tx + m(2), zS, zS + m(lane))) ctx.F.tree(r() < 0.7 ? 0 : 3, tx, zS + m(lane * 0.5), 0.9 + r() * 0.35);
    }
    z = zS + m(lane);
  }
}

// carve a region into blocks by its avenues (x) and streets (z), and fill them
function fillRegion(ctx, R, avX, stZ, AW, SW) {
  var xs = [[R.x0, false]];
  avX.filter(function (x) { return x > R.x0 && x < R.x1; }).sort(function (a, b) { return a - b; }).forEach(function (x) { xs.push([x - AW, true], [x + AW, true]); });
  xs.push([R.x1, false]);
  var zs = [R.z0];
  stZ.filter(function (z) { return z > R.z0 && z < R.z1; }).sort(function (a, b) { return a - b; }).forEach(function (z) { zs.push(z - SW, z + SW); });
  zs.push(R.z1);
  for (var i = 0; i < xs.length; i += 2) {
    for (var j = 0; j < zs.length; j += 2) {
      var B = { x0: xs[i][0], x1: xs[i + 1][0], z0: zs[j], z1: zs[j + 1] };
      if (B.x1 - B.x0 < 20 * ctx.M || B.z1 - B.z0 < 20 * ctx.M) continue;
      fillBlock(ctx, B, { shopW: xs[i][1], shopE: xs[i + 1][1] });
    }
  }
}

// ---------------------------------------------------------------------------
//  the great houses: 王府, temples, the drum and bell towers, a market
//  (buildings from the palace templates, walls from the kit)
// ---------------------------------------------------------------------------
function walledCompound(ctx, R, wallKind, gateSide) {
  var M = ctx.M;
  var gx = (R.x0 + R.x1) / 2, gw = 9 * M;
  wallLine(ctx, R.x0, R.z0, R.x1, R.z0, wallKind);
  wallLine(ctx, R.x0, R.z0, R.x0, R.z1, wallKind);
  wallLine(ctx, R.x1, R.z0, R.x1, R.z1, wallKind);
  wallLine(ctx, R.x0, R.z1, gx - gw / 2, R.z1, wallKind);
  wallLine(ctx, gx + gw / 2, R.z1, R.x1, R.z1, wallKind);
  strip(ctx, 'paving', R.x0 + M, R.z0 + M, R.x1 - M, R.z1 - M, 0.03 * M);
}
function wangfu(ctx, R) {
  var M = ctx.M, P = ctx.P, T = ctx.T, r = ctx.rnd;
  function m(v) { return v * M; }
  walledCompound(ctx, R, 'wallRG');
  var cx = (R.x0 + R.x1) / 2, w = (R.x1 - R.x0) / M, d = (R.z1 - R.z0) / M;
  var ax = R.x0 + (R.x1 - R.x0) * 0.6;                         // the axis, garden to the west
  P.put('gate5|g', T.gate5, ax, R.z1 - m(5), 0, 0.55);
  P.put('main5x|g', T.main5x, ax, R.z1 - m(d * 0.42), 0, 0.72);
  P.put('main5w|g', T.main5w, ax, R.z0 + m(d * 0.22), 0, 0.62);
  [-1, 1].forEach(function (s) {
    P.put('side3|g', T.side3, ax + s * m(w * 0.22), R.z1 - m(d * 0.28), -s * Math.PI / 2, 0.8);
    P.put('side3|k', T.side3, ax + s * m(w * 0.2), R.z0 + m(d * 0.36), -s * Math.PI / 2, 0.7);
  });
  P.put('side5|k', T.side5, ax, R.z0 + m(6), 0, 0.85);
  strip(ctx, 'lane', ax - m(2.5), R.z1 - m(d * 0.42) + m(8), ax + m(2.5), R.z1 - m(2), 0.045 * M);
  // the garden: a pond, a pavilion, rockwork, old trees
  var gx = R.x0 + m(w * 0.18), gz = (R.z0 + R.z1) / 2, pr = m(Math.min(w * 0.13, d * 0.12));
  var ring = [];
  for (var i = 0; i < 16; i++) { var a = i / 16 * 6.28, k = pr * (0.85 + 0.25 * Math.sin(a * 3 + 1)); ring.push([gx + Math.cos(a) * k * 1.2, 0.06 * M, gz + Math.sin(a) * k, 0, 0]); }
  ctx.acc.water.face([[gx, 0.06 * M, gz, 0, 0]].concat(ring).concat([ring[0]]), [0, 1, 0]);
  ring.forEach(function (p, j) { var q = ring[(j + 1) % 16]; lineBox(ctx.acc.stone, p[0], p[2], q[0], q[2], 0, 0.3 * M, 0.6 * M); });
  P.put('pav|g', T.pav, gx + pr * 1.6, gz - pr * 0.9, 0, 0.8);
  for (var s = 0; s < 6; s++) ctx.acc.stone.box(gx - pr * 1.4 + (r() - 0.5) * pr, (0.6 + r()) * M, gz + pr * 1.3 + (r() - 0.5) * pr * 0.6, m(1.5 + r() * 2), m(1.2 + r() * 2.2), m(1.4 + r() * 1.8), { bottom: true });
  for (var t = 0; t < 14; t++) ctx.F.tree([0, 4, 2, 5, 1][t % 5], R.x0 + m(4) + r() * (ax - R.x0 - m(16)), R.z0 + m(6) + r() * (R.z1 - R.z0 - m(12)), 0.85 + r() * 0.4);
  for (var u = 0; u < 4; u++) ctx.F.tree(0, ax + (u % 2 ? 1 : -1) * m(8), R.z1 - m(d * 0.25 + (u > 1 ? 14 : 0)), 1.0 + r() * 0.2);
}
function smallTemple(ctx, R, roof) {
  var M = ctx.M, P = ctx.P, T = ctx.T, r = ctx.rnd;
  function m(v) { return v * M; }
  walledCompound(ctx, R, roof === 'g' ? 'wallRG' : 'wallRK');
  var cx = (R.x0 + R.x1) / 2, d = (R.z1 - R.z0) / M;
  P.put('gate3|' + roof, T.gate3, cx, R.z1 - m(3), 0, 0.8);
  P.put('main5x|' + roof, T.main5x, cx, R.z0 + m(d * 0.32), 0, 0.5);
  P.put('side3|k', T.side3, R.x0 + m(6), (R.z0 + R.z1) / 2 + m(4), Math.PI / 2, 0.6);
  P.put('side3|k', T.side3, R.x1 - m(6), (R.z0 + R.z1) / 2 + m(4), -Math.PI / 2, 0.6);
  ctx.acc.stone.box(cx, 0.5 * M, (R.z0 + R.z1) / 2 + m(5), m(1.6), m(1.0), m(1.6), { bottom: true });   // the censer's plinth
  ctx.glows.push([cx, 1.5 * M, (R.z0 + R.z1) / 2 + m(5), 1.6 * M]);
  for (var t = 0; t < 6; t++) ctx.F.tree(t % 2 ? 4 : 0, cx + (t % 2 ? 1 : -1) * m(6 + r() * 4), R.z0 + m(d * 0.5 + t * 3), 0.9 + r() * 0.3);
}
function drumBell(ctx, x, z0, z1) {
  var M = ctx.M, A = ctx.acc, P = ctx.P, T = ctx.T;
  function m(v) { return v * M; }
  // 鼓楼: a timber hall on a high red platform pierced by arches
  var dz = z1 - m(30), bz = z0 + m(30);
  gateTower(ctx, x, dz, 0, 56 * M, 34 * M, 13 * M, 'main7x|k', T.main7x, 3);
  // 钟楼: a grey brick tower, a grey roof
  A.brick.box(x, m(9), bz, m(30), m(18), m(30), { bottom: true });
  A.arch.box(x, m(3.2), bz, m(4.4), m(6.4), m(30.2), { bottom: true });
  A.stone.box(x, m(18.3), bz, m(32), m(0.6), m(32), { bottom: true });
  P.put('tower|k', T.tower, x, bz, 0, 1.6, m(18.6));
  strip(ctx, 'paving', x - m(36), bz + m(16), x + m(36), dz - m(18), 0.03 * M);
  ctx.glows.push([x - m(6), m(5), dz + m(18), m(3)], [x + m(6), m(5), dz + m(18), m(3)]);
}
function market(ctx, R) {
  var M = ctx.M, r = ctx.rnd;
  function m(v) { return v * M; }
  strip(ctx, 'lane', R.x0, R.z0, R.x1, R.z1, 0.03 * M);
  // rows of stalls under awnings, a few trees
  for (var z = R.z0 + m(5); z < R.z1 - m(4); z += m(9)) {
    for (var x = R.x0 + m(4); x < R.x1 - m(4); x += m(4.4 + r() * 1.5)) {
      if (r() < 0.82) putHouse(ctx, 'shed', x, z, r() < 0.5 ? 0 : Math.PI, 3.2 + r(), 2.6, 2.4, lotTint(r), 0, 0);
      if (r() < 0.25) ctx.F.put('clutter', x, z + m(2.2), r() * 6.28, 1, 1, 1);
    }
  }
  for (var t = 0; t < 6; t++) ctx.F.tree(0, R.x0 + r() * (R.x1 - R.x0), R.z0 + (t % 2 ? 0.05 : 0.95) * (R.z1 - R.z0), 1.0 + r() * 0.2);
}
// a chain of lakes: water, a stone shore, willows all round
function lakeShore(ctx, cx, cz, rx, rz, seed) {
  var M = ctx.M, A = ctx.acc, r = TEXGEN.rng(seed);
  var N = 36, ring = [];
  for (var i = 0; i < N; i++) {
    var a = i / N * 6.28, k = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7 + seed * 2);
    ring.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
  }
  A.water.face([[cx, 0.05 * M, cz, cx, cz]].concat(ring.map(function (p) { return [p[0], 0.05 * M, p[1], p[0], p[1]]; })).concat([[ring[0][0], 0.05 * M, ring[0][1], 0, 0]]), [0, 1, 0]);
  for (var e = 0; e < N; e++) {
    var p0 = ring[e], p1 = ring[(e + 1) % N];
    lineBox(A.stone, p0[0], p0[1], p1[0], p1[1], 0, 0.6 * M, 1.2 * M);
    var nx = p0[0] - cx, nz = p0[1] - cz, nl = Math.hypot(nx, nz) || 1;
    ctx.F.tree(2, p0[0] + nx / nl * 5 * M, p0[1] + nz / nl * 5 * M, 0.95 + r() * 0.3);
    if (e % 3 === 0) ctx.F.tree(0, p0[0] + nx / nl * 14 * M, p0[1] + nz / nl * 14 * M, 1.0 + r() * 0.3);
  }
  // a lawn and a walk round the water
  var outer = function (p, k) { return [cx + (p[0] - cx) * k, cz + (p[1] - cz) * k]; };
  for (var g = 0; g < N; g++) {
    var q0 = ring[g], q1 = ring[(g + 1) % N], o0 = outer(q0, 1.14), o1 = outer(q1, 1.14);
    A.grass.face([[q0[0], 0.03 * M, q0[1], q0[0], q0[1]], [q1[0], 0.03 * M, q1[1], q1[0], q1[1]], [o1[0], 0.03 * M, o1[1], o1[0], o1[1]], [o0[0], 0.03 * M, o0[1], o0[0], o0[1]]], [0, 1, 0]);
  }
  return { fn: function (x, z) { var dx = (x - cx) / (rx * 1.2), dz = (z - cz) / (rz * 1.2); return dx * dx + dz * dz < 1; } };
}

// ---------------------------------------------------------------------------
//  A WALLED CITY round a core (the imperial city, or a temple). B is the
//  depth of the town between the core and the wall.
// ---------------------------------------------------------------------------
function buildWalledCity(ctx, core, B, spec) {
  var M = ctx.M, r = ctx.rnd, lite = ctx.lite;
  function m(v) { return v * M; }
  var ringW = m(spec.ring || 22);
  var city = { x0: core.x0 - ringW - B, x1: core.x1 + ringW + B, z0: core.z0 - ringW - B, z1: core.z1 + ringW + B };
  var cI = { x0: core.x0 - ringW, x1: core.x1 + ringW, z0: core.z0 - ringW, z1: core.z1 + ringW };
  var AW = m(12), SW = m(9);
  var avW = (city.x0 + cI.x0) / 2, avE = (cI.x1 + city.x1) / 2;
  var stN = (city.z0 + cI.z0) / 2, stS = (cI.z1 + city.z1) / 2, stM = (core.z0 + core.z1) / 2;
  ctx.holes.push(cI);

  // ---- the streets: paved, tree-lined
  function avenue(x, z0, z1, hw) {
    strip(ctx, 'lane', x - hw, z0, x + hw, z1, 0.02 * M);
    for (var z = z0 + m(8); z < z1 - m(8); z += m(13 + r() * 4)) {
      [-1, 1].forEach(function (s) { if (r() < 0.85 && !blocked(ctx, x + s * (hw - m(2.5)) - m(1), x + s * (hw - m(2.5)) + m(1), z - m(1), z + m(1))) ctx.F.tree(spec.avTree || 0, x + s * (hw - m(2.5)), z, 0.95 + r() * 0.3); });
    }
  }
  function street(z, x0, x1, hw) {
    strip(ctx, 'lane', x0, z - hw, x1, z + hw, 0.021 * M);
    for (var x = x0 + m(10); x < x1 - m(10); x += m(18 + r() * 8)) {
      if (r() < 0.6 && !blocked(ctx, x - m(1), x + m(1), z - hw, z + hw)) ctx.F.tree(r() < 0.75 ? 0 : 3, x, z + (r() < 0.5 ? -1 : 1) * (hw - m(2)), 0.9 + r() * 0.3);
    }
  }
  strip(ctx, 'lane', cI.x0, cI.z0, cI.x1, core.z0, 0.02 * M);
  strip(ctx, 'lane', cI.x0, core.z1, cI.x1, cI.z1, 0.02 * M);
  strip(ctx, 'lane', cI.x0, core.z0, core.x0, core.z1, 0.02 * M);
  strip(ctx, 'lane', core.x1, core.z0, cI.x1, core.z1, 0.02 * M);

  // ---- the great houses, reserved before the hutong is laid
  var specials = [];
  function reserve(R) { specials.push(R); ctx.holes.push({ x0: R.x0 - m(4), x1: R.x1 + m(4), z0: R.z0 - m(4), z1: R.z1 + m(4) }); return R; }
  if (spec.drumBell) {
    var dbR = reserve({ x0: -m(40), x1: m(40), z0: cI.z0 - m(260), z1: cI.z0 - m(6) });
    if (dbR.z0 > city.z0 + m(20)) drumBell(ctx, 0, dbR.z0, dbR.z1); else specials.pop();
  }
  if (spec.drumOnAxis) {
    var dz = stS;
    drumBell(ctx, 0, dz - m(130), dz - m(10));
    ctx.holes.push({ x0: -m(42), x1: m(42), z0: dz - m(134), z1: dz - m(6) });
  }
  (spec.lakes || []).forEach(function (L, i) { ctx.holes.push(lakeShore(ctx, L[0], L[1], L[2], L[3], 31 + i * 17)); });
  // sites for the rest, chosen among the blocks clear of streets and of each other
  function site(w, d, tries) {
    for (var k = 0; k < (tries || 60); k++) {
      var x = city.x0 + m(30) + r() * (city.x1 - city.x0 - m(60) - w), z = city.z0 + m(30) + r() * (city.z1 - city.z0 - m(60) - d);
      var R = { x0: x, x1: x + w, z0: z, z1: z + d };
      if (blocked(ctx, R.x0 - m(8), R.x1 + m(8), R.z0 - m(8), R.z1 + m(8))) continue;
      var onStreet = [avW, avE, 0].some(function (ax) { return R.x0 < ax + AW + m(20) && R.x1 > ax - AW - m(20); }) ||
                     [stN, stS].some(function (sz) { return R.z0 < sz + SW + m(20) && R.z1 > sz - SW - m(20); }) ||
                     ((R.x1 < cI.x0 || R.x0 > cI.x1) && R.z0 < stM + SW + m(20) && R.z1 > stM - SW - m(20));
      if (onStreet) continue;
      return reserve(R);
    }
    return null;
  }
  for (var w = 0; w < (spec.wangfu || 0); w++) { var Rw = site(m(110), m(150)); if (Rw) wangfu(ctx, Rw); }
  for (var t = 0; t < (spec.temples || 0); t++) { var Rt = site(m(46), m(66)); if (Rt) smallTemple(ctx, Rt, t % 2 ? 'g' : 'k'); }
  if (spec.market) { var Rm = site(m(70), m(50)); if (Rm) market(ctx, Rm); }

  // ---- the avenues and streets, then the hutong between them
  avenue(avW, city.z0, city.z1, AW);
  avenue(avE, city.z0, city.z1, AW);
  if (spec.axisNorth !== false) avenue(0, city.z0, cI.z0, spec.axisW ? m(spec.axisW) : AW);
  avenue(0, cI.z1, city.z1, spec.axisW ? m(spec.axisW) : AW);
  street(stN, city.x0, city.x1, SW);
  street(stS, city.x0, city.x1, SW);
  street(stM, city.x0, cI.x0, SW);
  street(stM, cI.x1, city.x1, SW);
  var regions = [
    [{ x0: city.x0, x1: city.x1, z0: city.z0, z1: cI.z0 }, [avW, 0, avE], [stN]],
    [{ x0: city.x0, x1: city.x1, z0: cI.z1, z1: city.z1 }, [avW, 0, avE], [stS]],
    [{ x0: city.x0, x1: cI.x0, z0: cI.z0, z1: cI.z1 }, [avW], [stM]],
    [{ x0: cI.x1, x1: city.x1, z0: cI.z0, z1: cI.z1 }, [avE], [stM]]
  ];
  regions.forEach(function (g) { fillRegion(ctx, g[0], g[1], g[2], AW, SW); });

  // ---- the city wall, its gates, the moat
  var gates = [
    { side: 'S', at: 0, main: true }, { side: 'S', at: avW }, { side: 'S', at: avE },
    { side: 'N', at: avW }, { side: 'N', at: avE },
    { side: 'W', at: stM }, { side: 'E', at: stM }
  ];
  if (spec.northGateAxis) gates.push({ side: 'N', at: 0 });
  cityWall(ctx, city, gates, spec);
  return { city: city, gates: gates };
}

// the wall: grey brick, crenellated, bastioned; gate towers over arched
// passages, barbicans with arrow towers, corner towers; the moat outside
function cityWall(ctx, c, gates, spec) {
  var M = ctx.M, A = ctx.acc, P = ctx.P, T = ctx.T, r = ctx.rnd;
  function m(v) { return v * M; }
  var H = m(spec.wallH || 12), Tk = m(spec.wallT || 16), o = Tk / 2;
  var sides = [
    { a: [c.x0 - o, c.z0 - o], b: [c.x1 + o, c.z0 - o], n: [0, -1], s: 'N' },
    { a: [c.x0 - o, c.z1 + o], b: [c.x1 + o, c.z1 + o], n: [0, 1], s: 'S' },
    { a: [c.x0 - o, c.z0 - o], b: [c.x0 - o, c.z1 + o], n: [-1, 0], s: 'W' },
    { a: [c.x1 + o, c.z0 - o], b: [c.x1 + o, c.z1 + o], n: [1, 0], s: 'E' }
  ];
  sides.forEach(function (S) {
    var alongX = S.n[0] === 0, L = alongX ? S.b[0] - S.a[0] + Tk : S.b[1] - S.a[1] + Tk;
    var cx = (S.a[0] + S.b[0]) / 2, cz = (S.a[1] + S.b[1]) / 2;
    A.brick.box(cx, H / 2, cz, alongX ? L : Tk, H, alongX ? Tk : L, { bottom: true });
    // a battered stone footing, the walk's paving, the inner parapet
    A.stone.box(cx, m(0.7), cz, alongX ? L : Tk + m(1.2), m(1.4), alongX ? Tk + m(1.2) : L, { bottom: true });
    var ix = cx - S.n[0] * (o - m(0.4)), iz = cz - S.n[1] * (o - m(0.4));
    A.brick.box(ix, H + m(0.5), iz, alongX ? L : m(0.6), m(1.0), alongX ? m(0.6) : L, { bottom: true });
    // 垛口 merlons along the outer edge, broken at the gates
    var n = Math.floor(L / m(3.4)), gl = gates.filter(function (g) { return g.side === S.s; }).map(function (g) { return g.at; });
    for (var i = 0; i < n; i++) {
      var f = (i + 0.5) / n, x = alongX ? S.a[0] - o + L * f : cx + S.n[0] * (o - m(0.3)), z = alongX ? cz + S.n[1] * (o - m(0.3)) : S.a[1] - o + L * f;
      var along = alongX ? x : z;
      if (gl.some(function (g) { return Math.abs(g - along) < m(22); })) continue;
      A.brick.box(x, H + m(0.9), z, alongX ? m(1.8) : m(0.6), m(1.8), alongX ? m(0.6) : m(1.8), { bottom: true });
    }
    // 马面 bastions
    for (var p = m(80); p < L - m(80); p += m(100 + r() * 30)) {
      var along2 = (alongX ? S.a[0] - o : S.a[1] - o) + p;
      if (gl.some(function (g) { return Math.abs(g - along2) < m(60); })) continue;
      var bx = alongX ? along2 : cx + S.n[0] * (o + m(6)), bz = alongX ? cz + S.n[1] * (o + m(6)) : along2;
      A.brick.box(bx, H / 2, bz, alongX ? m(16) : m(12), H, alongX ? m(12) : m(16), { bottom: true });
    }
  });
  // gates: an arched passage, the gate tower on the wall, a barbican outside
  // with its arrow tower
  gates.forEach(function (g) {
    var alongX = g.side === 'N' || g.side === 'S', sgn = g.side === 'S' || g.side === 'E' ? 1 : -1;
    var wx = alongX ? g.at : (g.side === 'W' ? c.x0 - o : c.x1 + o), wz = alongX ? (g.side === 'N' ? c.z0 - o : c.z1 + o) : g.at;
    var rot = alongX ? (g.side === 'S' ? 0 : Math.PI) : (g.side === 'E' ? Math.PI / 2 : -Math.PI / 2);
    A.arch.box(wx, m(4.5), wz, alongX ? m(7) : Tk + m(0.4), m(9), alongX ? Tk + m(0.4) : m(7), { bottom: true });
    P.put('gate5|k', T.gate5, wx, wz, rot, g.main ? 1.2 : 0.95, H);
    ctx.glows.push([wx + (alongX ? -m(5) : sgn * (o + m(1))), m(6), wz + (alongX ? sgn * (o + m(1)) : -m(5)), m(3)],
                   [wx + (alongX ? m(5) : sgn * (o + m(1))), m(6), wz + (alongX ? sgn * (o + m(1)) : m(5)), m(3)]);
    // 瓮城 barbican
    var bw = m(g.main ? 90 : 64), bd = m(g.main ? 60 : 44), t2 = m(10);
    var ox = alongX ? 0 : sgn, oz = alongX ? sgn : 0;
    var fx = wx + ox * (o + bd), fz = wz + oz * (o + bd);
    if (alongX) {
      A.brick.box(fx, H / 2, fz, bw, H, t2, { bottom: true });
      [-1, 1].forEach(function (s) { A.brick.box(wx + s * (bw / 2 - t2 / 2), H / 2, wz + oz * (o + bd / 2), t2, H, bd, { bottom: true }); });
    } else {
      A.brick.box(fx, H / 2, fz, t2, H, bw, { bottom: true });
      [-1, 1].forEach(function (s) { A.brick.box(wx + ox * (o + bd / 2), H / 2, wz + s * (bw / 2 - t2 / 2), bd, H, t2, { bottom: true }); });
    }
    // 箭楼: a tall brick front pierced by rows of arrow windows
    var ah = m(g.main ? 13 : 10), aL = m(g.main ? 52 : 36), aD = m(14);
    A.brick.box(fx, H + ah / 2, fz, alongX ? aL : aD, ah, alongX ? aD : aL, { bottom: true });
    var rows = 4, cols = g.main ? 13 : 9;
    for (var rr = 0; rr < rows; rr++) for (var cc = 0; cc < cols; cc++) {
      var u = (cc + 0.5) / cols - 0.5, yy = H + ah * (0.18 + 0.2 * rr);
      var px = alongX ? fx + u * aL : fx + ox * (aD / 2 + m(0.03)), pz = alongX ? fz + oz * (aD / 2 + m(0.03)) : fz + u * aL;
      A.arch.box(px, yy, pz, alongX ? m(1.0) : m(0.1), m(1.2), alongX ? m(0.1) : m(1.0), { bottom: true });
    }
    P.put('atower|k', T.atower, fx, fz, rot, g.main ? 1.4 : 1.0, H + ah);
    A.arch.box(fx, m(4), fz, alongX ? m(6) : t2 + m(0.4), m(8), alongX ? t2 + m(0.4) : m(6), { bottom: true });
  });
  // 角楼 corner towers
  [[c.x0 - o, c.z0 - o, -1, -1], [c.x1 + o, c.z0 - o, 1, -1], [c.x0 - o, c.z1 + o, -1, 1], [c.x1 + o, c.z1 + o, 1, 1]].forEach(function (k) {
    var ch = m(12);
    A.brick.box(k[0], H + ch / 2, k[1], m(30), ch, m(30), { bottom: true });
    for (var rr = 0; rr < 3; rr++) for (var cc = 0; cc < 7; cc++) {
      var u = (cc + 0.5) / 7 - 0.5, yy = H + ch * (0.22 + 0.27 * rr);
      A.arch.box(k[0] + u * m(30), yy, k[1] + k[3] * m(15.05), m(0.9), m(1.1), m(0.1), { bottom: true });
      A.arch.box(k[0] + k[2] * m(15.05), yy, k[1] + u * m(30), m(0.1), m(1.1), m(0.9), { bottom: true });
    }
    P.put('atower|k', T.atower, k[0], k[1], 0, 0.85, H + ch);
    P.put('atower|k', T.atower, k[0], k[1], Math.PI / 2, 0.85, H + ch);
  });
  // the moat: water at a distance, stone kerbs, willows, a bridge at each gate
  var mo = Tk / 2 + m(40), mw = m(36);
  var mr = { x0: c.x0 - mo - mw, x1: c.x1 + mo + mw, z0: c.z0 - mo - mw, z1: c.z1 + mo + mw };
  var ir = { x0: c.x0 - mo, x1: c.x1 + mo, z0: c.z0 - mo, z1: c.z1 + mo };
  strip(ctx, 'water', mr.x0, mr.z0, mr.x1, ir.z0, 0.045 * M);
  strip(ctx, 'water', mr.x0, ir.z1, mr.x1, mr.z1, 0.045 * M);
  strip(ctx, 'water', mr.x0, ir.z0, ir.x0, ir.z1, 0.045 * M);
  strip(ctx, 'water', ir.x1, ir.z0, mr.x1, ir.z1, 0.045 * M);
  [ir, mr].forEach(function (R, k) {
    lineBox(A.stone, R.x0, R.z0, R.x1, R.z0, 0, m(0.7), m(1.2)); lineBox(A.stone, R.x0, R.z1, R.x1, R.z1, 0, m(0.7), m(1.2));
    lineBox(A.stone, R.x0, R.z0, R.x0, R.z1, 0, m(0.7), m(1.2)); lineBox(A.stone, R.x1, R.z0, R.x1, R.z1, 0, m(0.7), m(1.2));
    if (k === 1) {
      for (var x = R.x0; x < R.x1; x += m(15)) { ctx.F.tree(2, x, R.z0 - m(6), 0.95 + r() * 0.3); ctx.F.tree(2, x + m(7), R.z1 + m(6), 0.95 + r() * 0.3); }
      for (var z = R.z0; z < R.z1; z += m(15)) { ctx.F.tree(2, R.x0 - m(6), z, 0.95 + r() * 0.3); ctx.F.tree(2, R.x1 + m(6), z + m(7), 0.95 + r() * 0.3); }
    }
  });
  gates.forEach(function (g) {
    var alongX = g.side === 'N' || g.side === 'S';
    var bz = g.side === 'N' ? (mr.z0 + ir.z0) / 2 : g.side === 'S' ? (ir.z1 + mr.z1) / 2 : g.at;
    var bx = g.side === 'W' ? (mr.x0 + ir.x0) / 2 : g.side === 'E' ? (ir.x1 + mr.x1) / 2 : g.at;
    archBridge(ctx, bx, bz, alongX, mw + m(10), m(g.main ? 16 : 11), m(2.6), m(0.5));
  });
  ctx.moat = mr;
}

// ---------------------------------------------------------------------------
//  BEYOND THE WALL: roads out of the gates, suburbs along them, villages,
//  fields to the haze
// ---------------------------------------------------------------------------
function buildOutskirts(ctx, c, gates, Rout, clear) {
  var M = ctx.M, A = ctx.acc, r = ctx.rnd, lite = ctx.lite;
  function m(v) { return v * M; }
  var mo = ctx.moat || c;
  var roads = [];                        // {x0,x1,z0,z1}
  gates.forEach(function (g) {
    var hw = m(g.main ? 12 : 7);
    var R;
    if (g.side === 'S') R = { x0: g.at - hw, x1: g.at + hw, z0: mo.z1, z1: Rout };
    else if (g.side === 'N') R = { x0: g.at - hw, x1: g.at + hw, z0: -Rout, z1: mo.z0 };
    else if (g.side === 'W') R = { x0: -Rout, x1: mo.x0, z0: g.at - hw, z1: g.at + hw };
    else R = { x0: mo.x1, x1: Rout, z0: g.at - hw, z1: g.at + hw };
    strip(ctx, 'earth', R.x0, R.z0, R.x1, R.z1, 0.03 * M);
    roads.push(R);
    // 关厢: the suburb outside the gate, shops and houses along the road,
    // thinning out as the road leaves the city
    var len = m(g.main ? 420 : 260) * (lite ? 0.6 : 1);
    var alongX = g.side === 'W' || g.side === 'E';
    var sgn = g.side === 'S' || g.side === 'E' ? 1 : -1;
    var start = alongX ? (sgn > 0 ? mo.x1 : mo.x0) + sgn * m(12) : (sgn > 0 ? mo.z1 : mo.z0) + sgn * m(12);
    var seg = m(60);
    for (var s = 0; s < len; s += seg) {
      var a = start + sgn * s, b = a + sgn * seg, lo = Math.min(a, b), hi = Math.max(a, b);
      var dens = 1 - s / len;
      [-1, 1].forEach(function (side) {
        if (r() > 0.35 + 0.65 * dens) return;
        var kinds = dens > 0.5 ? ['shop1', 'shop2', 'house'] : ['house', 'house', 'shop1'];
        if (alongX) shopRow(ctx, 'x', g.at + side * (hw + m(1)), lo, hi, side, { kinds: kinds, weights: [0.4, 0.2, 0.4], depth: 14 });
        else shopRow(ctx, 'z', g.at + side * (hw + m(1)), lo, hi, side, { kinds: kinds, weights: [0.4, 0.2, 0.4], depth: 14 });
      });
    }
    roads.push(alongX ? { x0: Math.min(start, start + sgn * len), x1: Math.max(start, start + sgn * len), z0: g.at - hw - m(18), z1: g.at + hw + m(18) }
                      : { x0: g.at - hw - m(18), x1: g.at + hw + m(18), z0: Math.min(start, start + sgn * len), z1: Math.max(start, start + sgn * len) });
  });
  buildCountryFields(ctx, { x0: mo.x0 - m(30), x1: mo.x1 + m(30), z0: mo.z0 - m(30), z1: mo.z1 + m(30) }, Rout, roads, clear);
}

// villages and fields in the ring from `inner` out to Rout
function buildCountryFields(ctx, inner, Rout, roads, clear) {
  var M = ctx.M, A = ctx.acc, r = ctx.rnd, lite = ctx.lite;
  function m(v) { return v * M; }
  function onRoad(x0, x1, z0, z1) { return roads.some(function (R) { return rectHit(R, x0, x1, z0, z1); }); }
  function inInner(x, z) { return x > inner.x0 && x < inner.x1 && z > inner.z0 && z < inner.z1; }
  // villages first, on a ring, clear of the roads
  var villages = [], nv = lite ? 5 : 11;
  for (var k = 0, tries = 0; villages.length < nv && tries < 200; tries++) {
    var a = r() * 6.28, rad = Math.max(inner.x1 - inner.x0, inner.z1 - inner.z0) * 0.5 + m(160 + r() * 520);
    var vx = Math.cos(a) * rad, vz = Math.sin(a) * rad;
    if (Math.hypot(vx, vz) > Rout - m(80)) continue;
    var R = { x0: vx - m(70), x1: vx + m(70), z0: vz - m(55), z1: vz + m(55) };
    if (inInner(vx, vz) || onRoad(R.x0 - m(10), R.x1 + m(10), R.z0 - m(10), R.z1 + m(10))) continue;
    if (villages.some(function (V) { return rectHit(V, R.x0 - m(60), R.x1 + m(60), R.z0 - m(60), R.z1 + m(60)); })) continue;
    if (clear && rectHit(clear, R.x0, R.x1, R.z0, R.z1)) continue;
    villages.push(R); k++;
  }
  villages.forEach(function (V, vi) { village(ctx, V, vi); });
  // fields: a grid of strips, each its own crop
  var crops = [[0.66, 0.48, 0.17], [0.22, 0.38, 0.11], [0.14, 0.26, 0.08], [0.33, 0.22, 0.13], [0.74, 0.62, 0.10], [0.24, 0.36, 0.15], [0.45, 0.38, 0.23]];
  var fw = m(56), fd = m(84), path = m(6), col = new THREE.Color();
  for (var ix = -Math.ceil(Rout / fw); ix <= Math.ceil(Rout / fw); ix++) {
    for (var iz = -Math.ceil(Rout / fd); iz <= Math.ceil(Rout / fd); iz++) {
      var x = ix * fw, z = iz * fd;
      if (Math.hypot(x, z) > Rout) continue;
      var x0 = x - fw / 2, x1 = x + fw / 2, z0 = z - fd / 2, z1 = z + fd / 2;
      if (rectHit(inner, x0, x1, z0, z1)) continue;
      if (clear && rectHit(clear, x0, x1, z0, z1)) continue;
      if (onRoad(x0, x1, z0, z1)) continue;
      if (villages.some(function (V) { return rectHit(V, x0 - m(10), x1 + m(10), z0 - m(10), z1 + m(10)); })) continue;
      if (ctx.river && ctx.river(x0, x1, z0, z1)) continue;
      var split = r() < 0.35;
      for (var h = 0; h < (split ? 2 : 1); h++) {
        var c = crops[Math.floor(r() * crops.length)], kk = 0.85 + 0.25 * r();
        col.setRGB(c[0] * kk, c[1] * kk, c[2] * kk);
        var w = fw - path, d = split ? (fd - path) / 2 - m(1) : fd - path, zc = split ? z - (fd - path) / 4 + h * (fd - path) / 2 : z;
        var g = new THREE.PlaneGeometry(w, d, 1, 1);
        g.rotateX(-Math.PI / 2);
        if (r() < 0.5) g.rotateY(Math.PI / 2);
        g.translate(x, 0.03 * M, zc);
        var uv = g.attributes.uv;
        for (var q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * w / M, uv.getY(q) * d / M);
        ctx.fieldAcc.add(g, new THREE.Matrix4(), col);
        g.dispose();
      }
      // windbreaks of poplar along some field roads, an odd tree in others
      if (iz % 3 === 0 && (ix & 1) === 0) for (var t = 0; t < 4; t++) ctx.F.tree(3, x0 + t * fw / 4 + m(4), z0 - path / 2, 0.85 + r() * 0.25);
      else if (r() < 0.07) ctx.F.tree(r() < 0.5 ? 0 : 1, x + (r() - 0.5) * fw * 0.6, z1 - m(2), 1.0 + r() * 0.3);
    }
  }
  // the field tracks
  for (var rz = -Math.ceil(Rout / fd); rz <= Math.ceil(Rout / fd); rz += 3) {
    var zz = rz * fd - fd / 2;
    strip(ctx, 'earth', -Rout, zz - m(2), inner.x0, zz + m(2), 0.035 * M);
    strip(ctx, 'earth', inner.x1, zz - m(2), Rout, zz + m(2), 0.035 * M);
  }
}

// beyond the last village: fields to the horizon, larger and plainer the
// further out, so the haze closes over farmland and the world has no edge
function farFields(ctx, R0, R1) {
  var M = ctx.M, r = TEXGEN.rng(4711);
  var crops = [[0.62, 0.46, 0.17], [0.22, 0.36, 0.11], [0.16, 0.27, 0.09], [0.34, 0.25, 0.14], [0.70, 0.58, 0.12], [0.26, 0.36, 0.15], [0.44, 0.37, 0.22]];
  var fw = 90 * M, fd = 130 * M, path = 8 * M, col = new THREE.Color();
  var nx = Math.ceil(R1 / fw), nz = Math.ceil(R1 / fd);
  for (var ix = -nx; ix <= nx; ix++) {
    for (var iz = -nz; iz <= nz; iz++) {
      var x = ix * fw + (iz % 2) * fw * 0.37, z = iz * fd, d = Math.hypot(x, z);
      if (d < R0 - fw * 0.5 || d > R1) continue;
      var c = crops[Math.floor(r() * crops.length)], kk = 0.82 + 0.3 * r();
      col.setRGB(c[0] * kk, c[1] * kk, c[2] * kk);
      var w = fw - path, h = fd - path;
      var g = new THREE.PlaneGeometry(w, h, 1, 1);
      g.rotateX(-Math.PI / 2);
      if (r() < 0.4) g.rotateY(Math.PI / 2);
      g.translate(x, 0.03 * M, z);
      var uv = g.attributes.uv;
      for (var q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * w / M, uv.getY(q) * h / M);
      ctx.fieldAcc.add(g, new THREE.Matrix4(), col);
      g.dispose();
    }
  }
}

// a village: lanes of small courtyard houses round a temple, a pond, a
// threshing floor, many trees
function village(ctx, V, vi) {
  var M = ctx.M, r = ctx.rnd, P = ctx.P, T = ctx.T;
  function m(v) { return v * M; }
  var cx = (V.x0 + V.x1) / 2, cz = (V.z0 + V.z1) / 2;
  strip(ctx, 'earth', V.x0, V.z0, V.x1, V.z1, 0.032 * M);
  var rows = 2 + (r() < 0.5 ? 1 : 0), depth = (V.z1 - V.z0 - m(16)) / rows;
  for (var j = 0; j < rows; j++) {
    var zN = V.z0 + j * (depth + m(8)), zS = zN + depth - m(8);
    var x = V.x0 + m(r() * 12);
    while (V.x1 - x > m(16)) {
      var w = m(14 + r() * 10);
      if (Math.abs(x + w / 2 - cx) < m(14) && j === rows - 1) { x += m(30); continue; }   // the temple's place
      if (r() < 0.82) composeLot(ctx, x, Math.min(x + w, V.x1), zN, zS, { east: true, tidy: r() < 0.5, type: r() < 0.6 ? 'small' : undefined });
      x += w + m(r() < 0.3 ? 6 : 0);
    }
  }
  P.put('side3|k', T.side3, cx, V.z1 - m(9), 0, 0.6);
  ctx.F.tree(0, cx - m(8), V.z1 - m(4), 1.2); ctx.F.tree(0, cx + m(8), V.z1 - m(4), 1.15);
  // the pond and its willows
  var px = V.x1 + m(18), pz = cz + m((r() - 0.5) * 30), ring = [];
  for (var e = 0; e < 14; e++) { var a = e / 14 * 6.28, k = m(13) * (1 + 0.2 * Math.sin(a * 3 + vi)); ring.push([px + Math.cos(a) * k * 1.3, 0.05 * M, pz + Math.sin(a) * k, 0, 0]); }
  ctx.acc.water.face([[px, 0.05 * M, pz, 0, 0]].concat(ring).concat([ring[0]]), [0, 1, 0]);
  for (var t = 0; t < 7; t++) { var b = t / 7 * 6.28; ctx.F.tree(2, px + Math.cos(b) * m(21), pz + Math.sin(b) * m(16), 0.9 + r() * 0.3); }
  for (var u = 0; u < 10; u++) ctx.F.tree([0, 1, 3, 1, 0][u % 5], V.x0 + r() * (V.x1 - V.x0), V.z0 - m(6) + r() * m(8) + (u % 2 ? V.z1 - V.z0 + m(4) : 0), 0.9 + r() * 0.35);
}

// ---------------------------------------------------------------------------
//  皇城 THE IMPERIAL CITY: the walled precinct round the palace. Red walls
//  under yellow tiles; 天安门 on the axis to the south, 端门 behind it; the
//  ancestral temple 太庙 to the east of the way in, the altar of earth and
//  grain 社稷坛 to the west; the lakes of the 西苑; and, in the rest, the
//  offices, storehouses and shrines that served the court, and the lanes of
//  the people who worked in them.
// ---------------------------------------------------------------------------
// an office or storehouse yard of the court
function yamen(ctx, R) {
  var M = ctx.M, P = ctx.P, T = ctx.T, r = ctx.rnd;
  function m(v) { return v * M; }
  var w = (R.x1 - R.x0) / M, d = (R.z1 - R.z0) / M, cx = (R.x0 + R.x1) / 2;
  var kind = pick(r, [0.42, 0.3, 0.28]);                  // office, stores, shrine
  walledCompound(ctx, R, kind === 2 ? 'wallRG' : kind === 0 ? 'wallRK' : 'wall');
  var tone = kind === 2 ? '|g' : '|k';
  P.put('gate3' + tone, T.gate3, cx, R.z1 - m(3.2), 0, 0.72);
  ctx.glows.push([cx - m(3), m(3), R.z1 + m(2.5), m(2.2)], [cx + m(3), m(3), R.z1 + m(2.5), m(2.2)]);
  if (kind === 1) {
    // 库: long storehouses in rows, nothing growing between them
    var n = Math.max(2, Math.floor((d - 14) / 15));
    var s = Math.min(1, (w - 10) / 46);
    for (var i = 0; i < n; i++) P.put('long|k', T.long, cx, R.z0 + m(8 + i * 15), 0, s);
    return;
  }
  var main = kind === 2 ? 'main5x' : 'main5w';
  P.put(main + tone, T[main], cx, R.z0 + m(d * 0.4), 0, Math.min(0.62, w / 52));
  P.put('side5' + tone, T.side5, cx, R.z0 + m(6.5), 0, Math.min(0.9, w / 30));
  [-1, 1].forEach(function (sd) {
    P.put('side3|k', T.side3, cx + sd * m(w * 0.3), R.z0 + m(d * 0.66), -sd * Math.PI / 2, 0.66);
  });
  strip(ctx, 'lane', cx - m(1.8), R.z0 + m(d * 0.4) + m(6), cx + m(1.8), R.z1 - m(1), 0.045 * M);
  var nt = kind === 2 ? 8 : 3;
  for (var t = 0; t < nt; t++) ctx.F.tree(kind === 2 ? (t % 3 ? 4 : 0) : pickTree(r), R.x0 + m(4) + r() * (R.x1 - R.x0 - m(8)), R.z0 + m(d * (0.55 + 0.35 * r())), 0.85 + r() * 0.35);
}

function imperialCity(ctx, pal) {
  var M = ctx.M, A = ctx.acc, P = ctx.P, T = ctx.T, r = ctx.rnd, F = ctx.F, lite = ctx.lite;
  function m(v) { return v * M; }
  var mo = pal.moat, L = pal.lake;
  var imp = { x0: L.x0 - m(45), x1: mo.x1 + m(110), z0: Math.min(pal.JZ - pal.JR * 0.8, mo.z0) - m(70), z1: mo.z1 + m(170) };
  var wh = m(7), wt = m(2.4);
  function hole(R) { ctx.holes.push(R); return R; }
  hole({ x0: mo.x0 - m(4), x1: mo.x1 + m(4), z0: mo.z0 - m(4), z1: mo.z1 + m(4) });

  // ---- the wall, and its four gates
  var gS = m(44), gN = m(20), gE = m(16);
  var zE = (mo.z0 + mo.z1) / 2, zW = L.cz;
  wallRun(ctx, imp.x0, imp.z1, -gS, imp.z1, wh, wt);
  wallRun(ctx, gS, imp.z1, imp.x1, imp.z1, wh, wt);
  wallRun(ctx, imp.x0, imp.z0, -gN, imp.z0, wh, wt);
  wallRun(ctx, gN, imp.z0, imp.x1, imp.z0, wh, wt);
  wallRun(ctx, imp.x1, imp.z0, imp.x1, zE - gE, wh, wt);
  wallRun(ctx, imp.x1, zE + gE, imp.x1, imp.z1, wh, wt);
  wallRun(ctx, imp.x0, imp.z0, imp.x0, zW - gE, wh, wt);
  wallRun(ctx, imp.x0, zW + gE, imp.x0, imp.z1, wh, wt);
  // 地安门, 东安门, 西安门: plain gate halls, not towers
  P.put('gate5', T.gate5, 0, imp.z0, Math.PI, 0.62);
  P.put('gate5', T.gate5, imp.x1, zE, Math.PI / 2, 0.55);
  P.put('gate5', T.gate5, imp.x0, zW, -Math.PI / 2, 0.55);
  [[0, imp.z0 - m(9)], [imp.x1 + m(9), zE], [imp.x0 - m(9), zW]].forEach(function (p) {
    ctx.glows.push([p[0] - m(5), m(3.5), p[1], m(2.6)], [p[0] + m(5), m(3.5), p[1], m(2.6)]);
  });

  // ---- 天安门 and the way in: the 外金水河 and its five bridges, the 华表,
  // 千步廊 down either side of the 天街 to 大清门
  gateTower(ctx, 0, imp.z1, 0, 86 * M, 30 * M, 13 * M, 'tam', T.tam, 5);
  var rz0 = imp.z1 + m(21), rz1 = imp.z1 + m(29);
  hole({ x0: -m(84), x1: m(84), z0: imp.z1, z1: imp.z1 + m(46) });
  strip(ctx, 'water', -m(80), rz0, m(80), rz1, 0.06 * M);
  [rz0, rz1].forEach(function (z) {
    lineBox(A.stone, -m(80), z, m(80), z, 0, m(0.5), m(0.8));
    lineBox(A.stone, -m(80), z, m(80), z, m(0.5), m(0.6), m(0.18));
  });
  [-2, -1, 0, 1, 2].forEach(function (b) { archBridge(ctx, b * m(12), (rz0 + rz1) / 2, true, m(13), m(b ? 4.5 : 6.5), m(0.9), m(0.3)); });
  strip(ctx, 'paving', -m(84), imp.z1 + m(15), m(84), rz0, 0.03 * M);
  [-1, 1].forEach(function (sd) {
    [[imp.z1 + m(18), 10], [rz1 + m(8), 8.5]].forEach(function (h) {
      var x = sd * m(22), z = h[0];
      A.stone.box(x, m(0.5), z, m(2.4), m(1.0), m(2.4), { bottom: true });
      A.stone.box(x, m(1) + m(h[1] / 2), z, m(0.9), m(h[1]), m(0.9), { bottom: true });
      A.stone.box(x + sd * 0, m(1) + m(h[1] * 0.82), z, m(3.0), m(0.5), m(0.4), { bottom: true });    // the cloud board
      A.stone.box(x, m(1.1) + m(h[1]), z, m(1.6), m(0.35), m(1.6), { bottom: true });
    });
  });
  var tj1 = imp.z1 + m(lite ? 160 : 250);
  hole({ x0: -m(46), x1: m(46), z0: imp.z1, z1: tj1 + m(8) });
  strip(ctx, 'paving', -m(40), rz1 + m(2), m(40), tj1, 0.03 * M);
  strip(ctx, 'lane', -m(5), imp.z1 + m(15), m(5), tj1, 0.045 * M);
  [-1, 1].forEach(function (sd) {
    wallRun(ctx, sd * m(43), imp.z1 + m(46), sd * m(43), tj1, m(5.2), m(1.4));
    for (var z = imp.z1 + m(52); z < tj1 - m(46); z += m(46)) P.put('long', T.long, sd * m(35.5), z + m(22), -sd * Math.PI / 2, 1);
  });
  wallRun(ctx, -m(43), tj1, -m(9), tj1, m(5.2), m(1.4));
  wallRun(ctx, m(9), tj1, m(43), tj1, m(5.2), m(1.4));
  A.stone.box(0, m(0.4), tj1, m(24), m(0.8), m(10), { bottom: true });
  P.put('gate5', T.gate5, 0, tj1, 0, 0.6, m(0.8));
  ctx.glows.push([-m(6), m(4), tj1 + m(6), m(2.6)], [m(6), m(4), tj1 + m(6), m(2.6)]);

  // ---- between 天安门 and 午门: 端门, the 朝房 along the way, walls
  var zD = (mo.z1 + imp.z1) / 2;
  gateTower(ctx, 0, zD, 0, 62 * M, 24 * M, 11 * M, 'gate5', T.gate5, 3);
  [-1, 1].forEach(function (sd) {
    wallRun(ctx, sd * m(31), mo.z1 + m(4), sd * m(31), imp.z1 - m(15), m(6), m(1.6));
    wallRun(ctx, sd * m(31), zD, sd * m(45), zD, m(6), m(1.6));
    [mo.z1 + m(28), zD + m(36)].forEach(function (z) { P.put('long', T.long, sd * m(24), z, -sd * Math.PI / 2, 0.75); });
  });
  strip(ctx, 'paving', -m(30), mo.z1 + m(2), m(30), imp.z1 - m(15), 0.03 * M);
  strip(ctx, 'lane', -m(4.5), mo.z1 + m(2), m(4.5), imp.z1 - m(15), 0.045 * M);

  // ---- 太庙: walls within walls, a grove of old cypress, the great hall
  var RT = hole({ x0: m(46), x1: imp.x1 - m(10), z0: mo.z1 + m(10), z1: imp.z1 - m(10) });
  var tw0 = (RT.z0 + RT.z1) / 2;
  wallRun(ctx, RT.x0, RT.z0, RT.x1, RT.z0, m(6), m(1.8));
  wallRun(ctx, RT.x0, RT.z1, RT.x1, RT.z1, m(6), m(1.8));
  wallRun(ctx, RT.x1, RT.z0, RT.x1, RT.z1, m(6), m(1.8));
  wallRun(ctx, RT.x0, RT.z0, RT.x0, tw0 - m(8), m(6), m(1.8));
  wallRun(ctx, RT.x0, tw0 + m(8), RT.x0, RT.z1, m(6), m(1.8));
  P.put('gate3', T.gate3, RT.x0, tw0, -Math.PI / 2, 0.85);
  var tcx = (RT.x0 + RT.x1) / 2 + m(20), iw = Math.min(m(150), (RT.x1 - RT.x0) * 0.42);
  var IT = { x0: tcx - iw / 2, x1: tcx + iw / 2, z0: RT.z0 + m(14), z1: RT.z1 - m(26) };
  wallLine(ctx, IT.x0, IT.z0, IT.x1, IT.z0, 'wallR');
  wallLine(ctx, IT.x0, IT.z0, IT.x0, IT.z1, 'wallR');
  wallLine(ctx, IT.x1, IT.z0, IT.x1, IT.z1, 'wallR');
  wallLine(ctx, IT.x0, IT.z1, tcx - m(18), IT.z1, 'wallR');
  wallLine(ctx, tcx + m(18), IT.z1, IT.x1, IT.z1, 'wallR');
  strip(ctx, 'paving', IT.x0 + M, IT.z0 + M, IT.x1 - M, IT.z1 - M, 0.03 * M);
  P.put('gate5', T.gate5, tcx, IT.z1 - m(5), 0, 0.72);
  var id = (IT.z1 - IT.z0) / M;
  P.put('main7x', T.main7x, tcx, IT.z0 + m(id * 0.5), 0, Math.min(1.15, iw / M / 52));
  P.put('main5w', T.main5w, tcx, IT.z0 + m(12), 0, Math.min(0.85, iw / M / 50));
  [-1, 1].forEach(function (sd) { P.put('side5', T.side5, tcx + sd * (iw / 2 - m(8)), IT.z0 + m(id * 0.6), -sd * Math.PI / 2, 0.95); });
  // the little 金水河 before the 戟门, its bridges
  strip(ctx, 'water', tcx - m(32), IT.z1 + m(8), tcx + m(32), IT.z1 + m(13), 0.06 * M);
  [-1, 0, 1].forEach(function (b) { archBridge(ctx, tcx + b * m(10), IT.z1 + m(10.5), true, m(8), m(3.6), m(0.6), m(0.25)); });
  var step = lite ? 13 : 10;
  for (var cx = RT.x0 + m(8); cx < RT.x1 - m(6); cx += m(step)) {
    for (var cz = RT.z0 + m(7); cz < RT.z1 - m(6); cz += m(step)) {
      if (cx > IT.x0 - m(6) && cx < IT.x1 + m(6) && cz > IT.z0 - m(6) && cz < IT.z1 + m(18)) continue;
      if (Math.abs(cz - tw0) < m(6) && cx < IT.x0) continue;                   // the way in from the gate
      F.tree(4, cx + m((r() - 0.5) * 2.5), cz + m((r() - 0.5) * 2.5), 0.95 + r() * 0.45);
    }
  }
  strip(ctx, 'lane', RT.x0, tw0 - m(3), IT.x0, tw0 + m(3), 0.04 * M);

  // ---- 社稷坛: the square altar of the five earths, in its coloured enclosure
  var RS = hole({ x0: mo.x0 + m(6), x1: -m(46), z0: mo.z1 + m(10), z1: imp.z1 - m(10) });
  var sw0 = (RS.z0 + RS.z1) / 2;
  wallRun(ctx, RS.x0, RS.z0, RS.x1, RS.z0, m(6), m(1.8));
  wallRun(ctx, RS.x0, RS.z1, RS.x1, RS.z1, m(6), m(1.8));
  wallRun(ctx, RS.x0, RS.z0, RS.x0, RS.z1, m(6), m(1.8));
  wallRun(ctx, RS.x1, RS.z0, RS.x1, sw0 - m(8), m(6), m(1.8));
  wallRun(ctx, RS.x1, sw0 + m(8), RS.x1, RS.z1, m(6), m(1.8));
  P.put('gate3', T.gate3, RS.x1, sw0, Math.PI / 2, 0.85);
  var ax = (RS.x0 + RS.x1) / 2, az = RS.z0 + (RS.z1 - RS.z0) * 0.6, half = m(30);
  var V = A.vcol;
  // 壝墙: a low wall, each side glazed in the colour of its quarter
  var side = { E: [0.22, 0.36, 0.48], S: [0.62, 0.16, 0.12], W: [0.86, 0.85, 0.82], N: [0.10, 0.10, 0.11] };
  function lowWall(x0, z0, x1, z1, col) {
    V.col = col;
    var cx2 = (x0 + x1) / 2, cz2 = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    var Lw = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    V.box(cx2, m(0.85), cz2, alongX ? Lw : m(0.7), m(1.7), alongX ? m(0.7) : Lw, { bottom: true });
    V.box(cx2, m(1.85), cz2, alongX ? Lw + m(0.3) : m(1.2), m(0.3), alongX ? m(1.2) : Lw + m(0.3), { bottom: true });
  }
  var gh = m(3.5);
  [[-1, 'N'], [1, 'S']].forEach(function (q) {
    var z = az + q[0] * half;
    lowWall(ax - half, z, ax - gh, z, side[q[1]]); lowWall(ax + gh, z, ax + half, z, side[q[1]]);
  });
  [[-1, 'W'], [1, 'E']].forEach(function (q) {
    var x = ax + q[0] * half;
    lowWall(x, az - half, x, az - gh, side[q[1]]); lowWall(x, az + gh, x, az + half, side[q[1]]);
  });
  // 棂星门: a white stone gate in the middle of each side
  [[0, -half], [0, half], [-half, 0], [half, 0]].forEach(function (g) {
    var x = ax + g[0], z = az + g[1], ew = g[0] !== 0;
    [-1, 1].forEach(function (sd) { A.stone.box(x + (ew ? 0 : sd * gh), m(2.0), z + (ew ? sd * gh : 0), m(0.6), m(4.0), m(0.6), { bottom: true }); });
    A.stone.box(x, m(3.8), z, ew ? m(0.5) : gh * 2 + m(0.8), m(0.5), ew ? gh * 2 + m(0.8) : m(0.5), { bottom: true });
  });
  // the altar: three white tiers, the top laid in five earths -- yellow at the
  // centre, blue-green east, red south, white west, black north
  [[17, 0.55], [15.6, 0.5], [14.2, 0.45]].reduce(function (y, t) {
    A.stone.box(ax, y + m(t[1] / 2), az, m(t[0]), m(t[1]), m(t[0]), { bottom: true });
    return y + m(t[1]);
  }, 0);
  var ty = m(1.52), o = m(7.0), c = m(2.4);
  var earth = { C: [0.78, 0.62, 0.22], E: [0.25, 0.38, 0.40], S: [0.58, 0.22, 0.14], W: [0.84, 0.82, 0.76], N: [0.12, 0.11, 0.10] };
  function quad(col, pts) { V.col = col; V.face(pts.map(function (p) { return [ax + p[0], ty, az + p[1], 0, 0]; }), [0, 1, 0]); }
  quad(earth.C, [[-c, -c], [c, -c], [c, c], [-c, c]]);
  quad(earth.N, [[-o, -o], [o, -o], [c, -c], [-c, -c]]);
  quad(earth.S, [[-c, c], [c, c], [o, o], [-o, o]]);
  quad(earth.W, [[-o, -o], [-c, -c], [-c, c], [-o, o]]);
  quad(earth.E, [[c, -c], [o, -o], [o, o], [c, c]]);
  V.col = [1, 1, 1];
  // 拜殿 and 戟门 to the north, the grove round it all
  P.put('main5x', T.main5x, ax, az - half - m(24), Math.PI, 0.8);
  P.put('gate3', T.gate3, ax, RS.z0 + m(10), Math.PI, 0.8);
  strip(ctx, 'paving', ax - half - m(4), az - half - m(36), ax + half + m(4), az + half + m(4), 0.03 * M);
  for (var sx = RS.x0 + m(8); sx < RS.x1 - m(6); sx += m(step)) {
    for (var sz = RS.z0 + m(7); sz < RS.z1 - m(6); sz += m(step)) {
      if (Math.abs(sx - ax) < half + m(10) && sz > az - half - m(42) && sz < az + half + m(10)) continue;
      if (Math.abs(sz - sw0) < m(6) && sx > ax + half) continue;
      F.tree(r() < 0.8 ? 4 : 0, sx + m((r() - 0.5) * 2.5), sz + m((r() - 0.5) * 2.5), 0.95 + r() * 0.45);
    }
  }
  strip(ctx, 'lane', ax + half + m(4), sw0 - m(3), RS.x1, sw0 + m(3), 0.04 * M);

  // ---- 中南海: the southern lakes of the 西苑, a pavilion on its island
  var RZ = { x0: imp.x0 + m(16), x1: mo.x0 - m(14), z0: L.z1 + m(24), z1: imp.z1 - m(12) };
  if (RZ.x1 - RZ.x0 > m(120) && RZ.z1 - RZ.z0 > m(80)) {
    var zx = (RZ.x0 + RZ.x1) / 2, zz = (RZ.z0 + RZ.z1) / 2, zrx = (RZ.x1 - RZ.x0) * 0.4, zrz = (RZ.z1 - RZ.z0) * 0.36;
    hole(lakeShore(ctx, zx, zz, zrx, zrz, 7));
    var isx = zx + zrx * 0.15, isz = zz + zrz * 0.2, isr = Math.min(zrx, zrz) * 0.3, ring = [];
    for (var i = 0; i < 20; i++) { var a = i / 20 * 6.28; ring.push([isx + Math.cos(a) * isr * 1.3, m(0.5), isz + Math.sin(a) * isr, 0, 0]); }
    A.grass.face([[isx, m(0.5), isz, 0, 0]].concat(ring).concat([ring[0]]), [0, 1, 0]);
    ring.forEach(function (p, j) { var q = ring[(j + 1) % ring.length]; lineBox(A.stone, p[0], p[2], q[0], q[2], -m(0.2), m(0.75), m(0.8)); });
    P.put('main5x', T.main5x, isx, isz - isr * 0.15, 0, 0.5, m(0.5));
    P.put('pav', T.pav, isx + isr * 0.8, isz + isr * 0.35, 0, 0.8, m(0.5));
    for (var it = 0; it < 7; it++) F.tree(it % 2 ? 4 : 1, isx + (r() - 0.5) * isr * 2, isz + (r() - 0.5) * isr * 1.4, 0.8 + r() * 0.3, null, m(0.5));
    archBridge(ctx, isx, isz + isr + (zz + zrz * 1.05 - isz - isr) / 2, true, (zz + zrz * 1.05 - isz - isr) + m(4), m(4.5), m(1.4), m(0.5));
  }
  // the strip between 北海 and the moat: the 西苑's woods
  for (var wz = L.cz - L.rz * 0.6; wz < L.z1 + m(10); wz += m(16)) {
    var wx0 = L.x1 + m(10), wx1 = mo.x0 - m(10);
    for (var wx = wx0; wx < wx1; wx += m(16)) if (!L.inside(wx, wz, 6 * M)) F.tree(pickTree(r), wx + m((r() - 0.5) * 6), wz + m((r() - 0.5) * 6), 0.95 + r() * 0.4);
  }
  hole({ x0: L.x1 - m(30), x1: mo.x0 - m(4), z0: L.cz - L.rz * 0.6, z1: L.z1 + m(14) });

  // ---- 景山 in its own walls, 寿皇殿 behind the hill
  var JB = hole({ x0: -pal.JR - m(14), x1: pal.JR + m(14), z0: pal.JZ - pal.JR * 0.8 - m(14), z1: mo.z0 - m(6) });
  wallRun(ctx, JB.x0, JB.z0, JB.x1, JB.z0, m(5.5), m(1.6));
  wallRun(ctx, JB.x0, JB.z0, JB.x0, JB.z1, m(5.5), m(1.6));
  wallRun(ctx, JB.x1, JB.z0, JB.x1, JB.z1, m(5.5), m(1.6));
  wallRun(ctx, JB.x0, JB.z1, -m(14), JB.z1, m(5.5), m(1.6));
  wallRun(ctx, m(14), JB.z1, JB.x1, JB.z1, m(5.5), m(1.6));
  P.put('gate3', T.gate3, 0, JB.z1, 0, 0.9);
  strip(ctx, 'lane', -m(6), JB.z1, m(6), mo.z0, 0.04 * M);
  // between the hill's back and the north wall, the axis runs on to 地安门
  strip(ctx, 'lane', -m(7), imp.z0, m(7), JB.z0, 0.04 * M);

  // ---- the rest: the court's offices and stores, then lanes of houses
  var inner = { x0: imp.x0 + m(6), x1: imp.x1 - m(6), z0: imp.z0 + m(6), z1: imp.z1 - m(6) };
  hole({ x0: -m(9), x1: m(9), z0: imp.z0, z1: JB.z0 });
  var ny = lite ? 6 : 14;
  for (var k = 0, tries = 0; k < ny && tries < 400; tries++) {
    var yw = m(46 + r() * 30), yd = m(56 + r() * 34);
    var yx = inner.x0 + r() * (inner.x1 - inner.x0 - yw), yz = inner.z0 + r() * (inner.z1 - inner.z0 - yd);
    var R = { x0: yx, x1: yx + yw, z0: yz, z1: yz + yd };
    if (blocked(ctx, R.x0 - m(10), R.x1 + m(10), R.z0 - m(10), R.z1 + m(10))) continue;
    hole({ x0: R.x0 - m(5), x1: R.x1 + m(5), z0: R.z0 - m(5), z1: R.z1 + m(5) });
    yamen(ctx, R);
    k++;
  }
  fillRegion(ctx, inner, [], [], m(12), m(9));
  return imp;
}

// ---------------------------------------------------------------------------
//  THE THREE SETTINGS
// ---------------------------------------------------------------------------
// a hall: the palace, the imperial city round it, the capital round that
function buildCapital(ctx) {
  var M = ctx.M, lite = ctx.lite;
  function m(v) { return v * M; }
  var pal = buildPalaceCity(ctx);
  var imp = imperialCity(ctx, pal);
  var cityInfo = buildWalledCity(ctx, imp, m(lite ? 230 : 380), {
    drumBell: true, wangfu: lite ? 1 : 3, temples: lite ? 2 : 5, market: true, ring: 24, axisW: 20, avTree: 0,
    lakes: [[imp.x0 + m(150), imp.z0 - m(24) - m(98), m(135), m(62)], [imp.x0 - m(70), imp.z0 - m(24) - m(110), m(80), m(50)]],
    wallH: 12, wallT: 16
  });
  var c = cityInfo.city, Rout = Math.max(c.x1 - c.x0, c.z1 - c.z0) * 0.5 + m(lite ? 700 : 1300);
  buildOutskirts(ctx, c, cityInfo.gates, Rout);
  ctx.fabricInner = { x0: c.x0 - m(80), x1: c.x1 + m(80), z0: c.z0 - m(80), z1: c.z1 + m(80) };
  ctx.groundRect = c;
  ctx.worldR = Rout;
}

// a pagoda: its temple at the heart of a walled town
function buildTempleTownCity(ctx) {
  var M = ctx.M, court = ctx.court, lite = ctx.lite;
  function m(v) { return v * M; }
  var wt = 1.6 * M;
  var core = { x0: -court.hx - wt, x1: court.hx + wt, z0: court.zb - wt, z1: court.zf + wt };
  ctx.holes.push(core);
  var cityInfo = buildWalledCity(ctx, core, m(lite ? 170 : 300), {
    drumOnAxis: true, wangfu: 1, temples: lite ? 1 : 3, market: true, ring: 16, axisW: 16, avTree: 0,
    lakes: lite ? [] : [[core.x1 + m(190), core.z0 - m(120), m(70), m(45)]],
    wallH: 10, wallT: 12
  });
  var c = cityInfo.city, Rout = Math.max(c.x1 - c.x0, c.z1 - c.z0) * 0.5 + m(lite ? 650 : 1200);
  buildOutskirts(ctx, c, cityInfo.gates, Rout);
  ctx.fabricInner = { x0: c.x0 - m(80), x1: c.x1 + m(80), z0: c.z0 - m(80), z1: c.z1 + m(80) };
  ctx.groundRect = c;
  ctx.worldR = Rout;
}

// 旷野: the building alone among fields, villages and a river
function buildCountryside(ctx) {
  var M = ctx.M, A = ctx.acc, r = ctx.rnd, lite = ctx.lite, info = ctx.info;
  function m(v) { return v * M; }
  var court = ctx.court;
  var clear = { x0: -court.hx - m(30), x1: court.hx + m(30), z0: court.zb - m(30), z1: court.zf + m(30) };
  var Rout = m(lite ? 900 : 1600);
  // a meadow round the site, a track to it
  strip(ctx, 'grass', clear.x0 - m(40), clear.z0 - m(40), clear.x1 + m(40), clear.z0, 0.025 * M);
  strip(ctx, 'grass', clear.x0 - m(40), clear.z1, clear.x1 + m(40), clear.z1 + m(40), 0.025 * M);
  strip(ctx, 'grass', clear.x0 - m(40), clear.z0, clear.x0, clear.z1, 0.025 * M);
  strip(ctx, 'grass', clear.x1, clear.z0, clear.x1 + m(40), clear.z1, 0.025 * M);
  for (var t = 0; t < 18; t++) {
    var a = r() * 6.28, d = m(60 + r() * 50);
    var x = Math.cos(a) * d * 1.3, z = Math.sin(a) * d;
    if (Math.abs(x) < m(8) && z > 0) continue;
    ctx.F.tree(pickTree(r), x, z, 1.0 + r() * 0.4);
  }
  var roads = [{ x0: -m(4), x1: m(4), z0: clear.z1, z1: Rout }, { x0: -Rout, x1: clear.x0, z0: -m(4), z1: m(4) }];
  roads.forEach(function (R) { strip(ctx, 'earth', R.x0, R.z0, R.x1, R.z1, 0.035 * M); });
  // the river, winding north-south to the east, with a stone bridge
  var river = function (z) { return m(330) + m(70) * Math.sin(z / m(200)) + m(30) * Math.sin(z / m(73)); };
  ctx.river = function (x0, x1, z0, z1) { var rx = river((z0 + z1) / 2); return x1 > rx - m(34) && x0 < rx + m(34); };
  var N = 80;
  for (var i = 0; i < N; i++) {
    var za = -Rout + 2 * Rout * i / N, zb = -Rout + 2 * Rout * (i + 1) / N, xa = river(za), xb = river(zb), rw = m(26);
    A.water.face([[xa - rw / 2, 0.04 * M, za, xa, za], [xa + rw / 2, 0.04 * M, za, xa + rw, za], [xb + rw / 2, 0.04 * M, zb, xb + rw, zb], [xb - rw / 2, 0.04 * M, zb, xb, zb]], [0, 1, 0]);
    [-1, 1].forEach(function (s) {
      A.grass.face([[xa + s * rw / 2, 0.045 * M, za, xa, za], [xa + s * (rw / 2 + m(9)), 0.045 * M, za, xa + 9, za], [xb + s * (rw / 2 + m(9)), 0.045 * M, zb, xb + 9, zb], [xb + s * rw / 2, 0.045 * M, zb, xb, zb]], [0, 1, 0]);
    });
    if (i % 2 === 0) { ctx.F.tree(2, xa - rw / 2 - m(5), za, 1.0 + r() * 0.3); ctx.F.tree(2, xa + rw / 2 + m(5), za + m(12), 1.0 + r() * 0.3); }
  }
  var bz = m(60);
  archBridge(ctx, river(bz), bz, false, m(44), m(5.5), m(3.6), m(0.5));
  buildCountryFields(ctx, clear, Rout, roads, null);
  var g = Math.max(court.hx, court.zf) + m(700);
  ctx.fabricInner = { x0: -g, x1: g, z0: -g, z1: g };
  ctx.groundRect = null;
  ctx.worldR = Rout;
}
