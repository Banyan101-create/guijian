// ============================================================================
//  材质贴图 PROCEDURAL SURFACES
//  Every surface on the building is drawn here at load, from seeded noise, as
//  three maps at once: albedo (sRGB), a height field Sobel'd into a tangent
//  normal map (linear), and roughness (linear, green channel -- which is the
//  one three r128 reads). Nothing is downloaded, and the seeds are fixed, so a
//  rebuild never reshuffles the weathering.
//
//  Albedo is drawn near-white and tinted by the material colour, so every
//  colour swatch keeps working. What the maps add is what a flat colour can't:
//  glaze that is glossy on the crown of a tile and dull in the dirty channel,
//  joints that read as recesses, lacquer that has cracked, plaster that has
//  weathered unevenly.
//
//  Each set records `size`: the real-world extent one repeat covers, in metres.
//  app.js turns that into map.repeat with the building's units-per-metre, so a
//  brick is a brick-sized brick on a 3-bay garden hall and a 11-bay throne hall.
// ============================================================================
var TEXGEN = (function () {

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // integer hash -> [0,1). Used for per-brick / per-tile tone so a brick keeps
  // one colour across every pixel it covers.
  function hash2(i, j, s) {
    var h = (i * 374761393 + j * 668265263 + (s || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }

  // Tileable value noise: a period x period lattice of random values, sampled
  // with smoothstep interpolation and wrapped, so any whole number of periods
  // across the texture tiles seamlessly.
  function Lattice(seed, period) {
    var r = rng(seed), v = new Float32Array(period * period);
    for (var i = 0; i < v.length; i++) v[i] = r();
    this.p = period; this.v = v;
  }
  Lattice.prototype.at = function (x, y) {
    var p = this.p;
    var xi = Math.floor(x), yi = Math.floor(y);
    var fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
    var x1 = (x0 + 1) % p, y1 = (y0 + 1) % p, v = this.v;
    var a = v[y0 * p + x0], b = v[y0 * p + x1], c = v[y1 * p + x0], d = v[y1 * p + x1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  };

  // fbm over [0,1)^2, tileable: octave k uses a lattice of period base*2^k
  function Fbm(seed, base, octaves) {
    this.o = [];
    for (var k = 0; k < octaves; k++) this.o.push(new Lattice(seed + k * 101, base << k));
  }
  Fbm.prototype.at = function (u, v) {
    var s = 0, a = 0.5, n = 0;
    for (var k = 0; k < this.o.length; k++) {
      var L = this.o[k];
      s += a * L.at(u * L.p, v * L.p); n += a; a *= 0.5;
    }
    return s / n;
  };

  function smooth(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  var MAX_ANISO = 1;
  function canvasTex(c, srgb) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = MAX_ANISO;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // fn(u, v, x, y, out) fills out.r/g/b (albedo 0..1), out.h (height 0..1) and
  // out.ro (roughness 0..1). v runs bottom -> top, matching texture UVs.
  function buildSet(w, h, nStrength, fn) {
    var alb = document.createElement('canvas'); alb.width = w; alb.height = h;
    var rou = document.createElement('canvas'); rou.width = w; rou.height = h;
    var nrm = document.createElement('canvas'); nrm.width = w; nrm.height = h;
    var A = alb.getContext('2d').createImageData(w, h);
    var R = rou.getContext('2d').createImageData(w, h);
    var N = nrm.getContext('2d').createImageData(w, h);
    var H = new Float32Array(w * h);
    var o = { r: 1, g: 1, b: 1, h: 0, ro: 0.5 };
    for (var y = 0; y < h; y++) {
      var v = 1 - (y + 0.5) / h;
      for (var x = 0; x < w; x++) {
        var u = (x + 0.5) / w;
        o.r = o.g = o.b = 1; o.h = 0; o.ro = 0.5;
        fn(u, v, x, y, o);
        var i = (y * w + x), j = i * 4;
        A.data[j]     = clamp01(o.r) * 255;
        A.data[j + 1] = clamp01(o.g) * 255;
        A.data[j + 2] = clamp01(o.b) * 255;
        A.data[j + 3] = 255;
        var rr = clamp01(o.ro) * 255;
        R.data[j] = R.data[j + 1] = R.data[j + 2] = rr; R.data[j + 3] = 255;
        H[i] = o.h;
      }
    }
    // Sobel the height field into a tangent-space normal map, wrapping at the
    // edges so it tiles exactly like the albedo. Canvas y runs down while v runs
    // up, hence the sign on dy.
    function Hh(x, y) { return H[(((y % h) + h) % h) * w + (((x % w) + w) % w)]; }
    for (var y2 = 0; y2 < h; y2++) {
      for (var x2 = 0; x2 < w; x2++) {
        var dx = (Hh(x2 - 1, y2 - 1) + 2 * Hh(x2 - 1, y2) + Hh(x2 - 1, y2 + 1)
                - Hh(x2 + 1, y2 - 1) - 2 * Hh(x2 + 1, y2) - Hh(x2 + 1, y2 + 1)) * nStrength;
        var dy = (Hh(x2 - 1, y2 - 1) + 2 * Hh(x2, y2 - 1) + Hh(x2 + 1, y2 - 1)
                - Hh(x2 - 1, y2 + 1) - 2 * Hh(x2, y2 + 1) - Hh(x2 + 1, y2 + 1)) * -nStrength;
        var len = Math.sqrt(dx * dx + dy * dy + 1);
        var k = (y2 * w + x2) * 4;
        N.data[k]     = (dx / len * 0.5 + 0.5) * 255;
        N.data[k + 1] = (dy / len * 0.5 + 0.5) * 255;
        N.data[k + 2] = (1 / len * 0.5 + 0.5) * 255;
        N.data[k + 3] = 255;
      }
    }
    alb.getContext('2d').putImageData(A, 0, 0);
    rou.getContext('2d').putImageData(R, 0, 0);
    nrm.getContext('2d').putImageData(N, 0, 0);
    return { map: canvasTex(alb, true), normal: canvasTex(nrm, false), rough: canvasTex(rou, false) };
  }

  var SETS = {};

  function init(renderer) {
    MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // ---------------------------------------------------------------- 琉璃瓦
    // Four 垄 across, four 筒瓦 courses up. Each 垄 is a 筒瓦 barrel down the
    // middle of the cell (crest at cell centre, so the crest lands on u = k+0.5)
    // flanked by the concave 板瓦 channel. The barrel courses lap every quarter;
    // the 板瓦 lap three times as often -- 压七露三, seven parts covered, three
    // showing. Crowns are glossy glaze, channels are dull with dirt and streaks.
    (function () {
      var f = new Fbm(11, 4, 4), streak = new Fbm(12, 8, 3), f2 = new Fbm(13, 16, 2);
      var CELLS = 4, WB = 0.21;
      SETS.tile = buildSet(512, 512, 5.0, function (u, v, x, y, o) {
        var cu = u * CELLS, bi = Math.floor(cu), s = cu - bi - 0.5, as = Math.abs(s);
        var cv = v * CELLS, ci = Math.floor(cv), q = cv - ci;
        var n = f.at(u, v), n2 = f2.at(u, v);
        var st = streak.at(u * 0.5, v * 4);             // long vertical rain streaks
        var t, hgt, ro;
        if (as < WB) {
          // 筒瓦: a half-round barrel, its lower lip proud of the course below
          var a = as / WB;
          hgt = 0.55 + 0.45 * Math.sqrt(1 - a * a);
          hgt += 0.07 * q - 0.10 * (1 - smooth(0, 0.035, q));
          var tone = 0.86 + 0.10 * (hash2(bi, ci, 7) - 0.5) + 0.06 * (n - 0.5);
          var ao = 1 - 0.20 * Math.pow(a, 6);
          var lap = 0.62 + 0.38 * smooth(0.0, 0.06, q);
          t = tone * ao * lap * (0.93 + 0.07 * n2);
          ro = 0.20 + 0.10 * n + 0.35 * (1 - smooth(0, 0.06, q));
        } else {
          // 板瓦 channel, concave, lowest in the middle of the run between barrels
          var b = (as - WB) / (0.5 - WB);
          hgt = 0.12 * (1 - b) * (1 - b);
          var q3 = cv * 3 - Math.floor(cv * 3);
          hgt += 0.035 * q3 - 0.05 * (1 - smooth(0, 0.05, q3));
          var occl = 0.70 + 0.30 * smooth(0.0, 0.45, b);
          var dirt = 0.68 + 0.18 * (n - 0.5) - 0.16 * Math.max(0, st - 0.55) * 2;
          t = dirt * occl * (0.72 + 0.28 * smooth(0, 0.08, q3));
          ro = 0.55 + 0.20 * n;
        }
        o.r = o.g = o.b = t; o.h = hgt; o.ro = ro;
      });
      SETS.tile.size = null;   // tile repeat is set from the 瓦垄 spacing instead
    })();

    // ------------------------------------------------------------- 油饰 lacquer
    // 朱红 on columns: the 地仗 ground under the lacquer cracks into fine
    // vertical 断纹 with age; the coat itself is smooth and semi-gloss.
    (function () {
      var f = new Fbm(21, 4, 4), crack = new Fbm(22, 6, 3), fine = new Fbm(23, 32, 2);
      SETS.lacquer = buildSet(256, 256, 1.0, function (u, v, x, y, o) {
        var n = f.at(u, v);
        // stretched hard along v: the 断纹 run with the grain, long and fine
        var c = crack.at(u * 3.0, v * 0.25);
        var line = (1 - smooth(0.0, 0.006, Math.abs(c - 0.5))) * smooth(0.45, 0.7, n);
        var t = 0.91 + 0.06 * (n - 0.5) + 0.03 * (fine.at(u, v) - 0.5) - 0.12 * line;
        o.r = o.g = o.b = t;
        o.h = 0.5 + 0.2 * (fine.at(u, v) - 0.5) - 0.15 * line;
        o.ro = 0.42 + 0.14 * n + 0.15 * line;
      });
      SETS.lacquer.size = 1.2;
    })();

    // -------------------------------------------------- 彩画地 painted timber
    // mineral pigment on 地仗: matte and chalky, a little uneven
    (function () {
      var f = new Fbm(31, 4, 4), g = new Fbm(32, 16, 3);
      SETS.paint = buildSet(256, 256, 1.2, function (u, v, x, y, o) {
        var n = f.at(u, v), m = g.at(u, v);
        o.r = o.g = o.b = 0.88 + 0.08 * (n - 0.5) + 0.05 * (m - 0.5);
        o.h = m * 0.5;
        o.ro = 0.72 + 0.12 * n;
      });
      SETS.paint.size = 0.9;
    })();

    // ------------------------------------------------------- 红墙 lime render
    // Palace walls are a 红土 wash over lime, and they are never one colour:
    // big soft blotches where it was re-washed, small pits, a grainy tooth.
    (function () {
      var big = new Fbm(41, 2, 4), mid = new Fbm(42, 8, 3), grit = new Fbm(43, 64, 2);
      SETS.plaster = buildSet(512, 512, 1.6, function (u, v, x, y, o) {
        var b = big.at(u, v), m = mid.at(u, v), gr = grit.at(u, v);
        var pit = gr > 0.78 ? (gr - 0.78) * 2.5 : 0;
        var t = 0.86 + 0.16 * (b - 0.5) + 0.06 * (m - 0.5) - 0.18 * pit;
        o.r = t; o.g = t * 0.985; o.b = t * 0.97;
        o.h = 0.4 * m + 0.2 * gr - pit;
        o.ro = 0.88 + 0.08 * m;
      });
      SETS.plaster.size = 3.0;
    })();

    // ----------------------------------------------- 汉白玉 dressed ashlar
    // Two blocks by four courses. Fine joints, each block its own tone, faint
    // grey veining, and the slight sugary sparkle of marble (low roughness spots).
    (function () {
      var vein = new Fbm(51, 3, 5), warp = new Fbm(52, 4, 3), f = new Fbm(53, 16, 3);
      var COLS = 2, ROWS = 4;
      SETS.ashlar = buildSet(512, 512, 3.5, function (u, v, x, y, o) {
        var row = Math.floor(v * ROWS), off = (row % 2) * 0.5;
        var cu = u * COLS + off, col = Math.floor(cu);
        var fu = cu - col, fv = v * ROWS - row;
        var jw = 0.012 * COLS, jh = 0.012 * ROWS;
        var edge = Math.min(fu / jw, (1 - fu) / jw, fv / jh, (1 - fv) / jh);
        var joint = 1 - smooth(0.6, 1.4, edge);
        var bevel = 1 - smooth(1.4, 3.2, edge);
        var w = warp.at(u, v);
        var vv = vein.at(u + 0.25 * w, v + 0.25 * w);
        var veinLine = 1 - smooth(0.0, 0.03, Math.abs(vv - 0.5));
        var tone = 0.90 + 0.06 * (hash2(((col % COLS) + COLS) % COLS, row, 3) - 0.5);
        var t = tone - 0.07 * veinLine + 0.03 * (f.at(u, v) - 0.5);
        t = t * (1 - 0.35 * joint) - 0.04 * bevel;
        o.r = t * 0.995; o.g = t * 0.99; o.b = t * 0.975;
        o.h = (1 - joint) * (1 - 0.25 * bevel);
        o.ro = 0.50 + 0.12 * f.at(u, v) + 0.30 * joint;
      });
      SETS.ashlar.size = [2.4, 1.8];
    })();

    // ------------------------------------------- carved stone, no joints
    (function () {
      var vein = new Fbm(61, 3, 5), warp = new Fbm(62, 4, 3), f = new Fbm(63, 32, 2);
      SETS.stone = buildSet(256, 256, 1.5, function (u, v, x, y, o) {
        var w = warp.at(u, v);
        var vv = vein.at(u + 0.3 * w, v + 0.3 * w);
        var veinLine = 1 - smooth(0.0, 0.035, Math.abs(vv - 0.5));
        var sp = f.at(u, v);
        var t = 0.91 - 0.06 * veinLine + 0.04 * (sp - 0.5);
        o.r = t * 0.995; o.g = t * 0.99; o.b = t * 0.975;
        o.h = 0.5 + 0.3 * (sp - 0.5);
        o.ro = 0.48 + 0.15 * sp;
      });
      SETS.stone.size = 1.0;
    })();

    // ------------------------------------------------ 阶条石 / 金砖 paving
    // Square slabs, two by two, worn smoother where they are walked.
    (function () {
      var f = new Fbm(71, 4, 4), g = new Fbm(72, 32, 2);
      SETS.slab = buildSet(512, 512, 3.0, function (u, v, x, y, o) {
        var cu = u * 2, cv = v * 2, ci = Math.floor(cu), cj = Math.floor(cv);
        var fu = cu - ci, fv = cv - cj;
        var edge = Math.min(fu, 1 - fu, fv, 1 - fv) / 0.008;
        var joint = 1 - smooth(0.6, 1.5, edge);
        var n = f.at(u, v);
        var t = 0.86 + 0.10 * (hash2(ci, cj, 9) - 0.5) + 0.06 * (n - 0.5) + 0.03 * (g.at(u, v) - 0.5);
        t *= 1 - 0.45 * joint;
        o.r = t; o.g = t * 0.99; o.b = t * 0.975;
        o.h = 1 - joint;
        o.ro = 0.58 + 0.18 * n + 0.25 * joint;
      });
      SETS.slab.size = 1.6;
    })();

    // ---------------------------------------------- 城砖 courtyard paving
    // Running bond, a dirty lime joint, every brick its own grey; moss and
    // grime collect in the joints.
    (function () {
      var f = new Fbm(81, 4, 4), g = new Fbm(82, 32, 2), m = new Fbm(83, 8, 3);
      var COLS = 4, ROWS = 8;
      SETS.brick = buildSet(512, 512, 3.0, function (u, v, x, y, o) {
        var row = Math.floor(v * ROWS), off = (row % 2) * 0.5;
        var cu = u * COLS + off, col = Math.floor(cu);
        var fu = cu - col, fv = v * ROWS - row;
        var edge = Math.min(fu * 2, (1 - fu) * 2, fv, 1 - fv) / 0.06;
        var joint = 1 - smooth(0.5, 1.3, edge);
        var n = f.at(u, v), gg = g.at(u, v);
        var tone = 0.80 + 0.14 * (hash2(((col % COLS) + COLS) % COLS, row, 5) - 0.5);
        var t = tone + 0.06 * (n - 0.5) + 0.05 * (gg - 0.5);
        var moss = Math.max(0, m.at(u, v) - 0.55) * 1.6 * joint;
        var jt = 0.58 + 0.1 * n;
        var r = t * (1 - joint) + jt * joint, gr = r, bl = r;
        gr += moss * 0.06; r -= moss * 0.05; bl -= moss * 0.07;
        o.r = r; o.g = gr * 0.995; o.b = bl * 0.985;
        o.h = (1 - joint) * (0.85 + 0.15 * gg);
        o.ro = 0.84 + 0.1 * n;
      });
      SETS.brick.size = 1.92;
    })();

    // --------------------------------------------- 干摆 dressed wall brick
    // The 下碱 base course of a palace wall: rubbed grey brick, joints so fine
    // they're nearly invisible.
    (function () {
      var f = new Fbm(91, 4, 3);
      var COLS = 4, ROWS = 14;
      SETS.wallBrick = buildSet(512, 512, 2.0, function (u, v, x, y, o) {
        var row = Math.floor(v * ROWS), off = (row % 2) * 0.5;
        var cu = u * COLS + off, col = Math.floor(cu);
        var fu = cu - col, fv = v * ROWS - row;
        var edge = Math.min(fu * 4, (1 - fu) * 4, fv, 1 - fv) / 0.08;
        var joint = 1 - smooth(0.5, 1.2, edge);
        var n = f.at(u, v);
        var t = 0.84 + 0.08 * (hash2(((col % COLS) + COLS) % COLS, row, 4) - 0.5) + 0.05 * (n - 0.5);
        t = t * (1 - 0.18 * joint);
        o.r = o.g = o.b = t;
        o.h = 1 - 0.6 * joint;
        o.ro = 0.8 + 0.08 * n;
      });
      SETS.wallBrick.size = [1.16, 0.98];
    })();

    // ------------------------------------------------ 御路 carved relief
    // cloud scrolls cut in bas-relief: noise terraced into flat carved levels
    // with rounded shoulders, so the normal map shows a carving, not a bump
    (function () {
      var f = new Fbm(111, 3, 4), w = new Fbm(112, 2, 3), g = new Fbm(113, 32, 2);
      SETS.relief = buildSet(512, 512, 7.0, function (u, v, x, y, o) {
        var wu = w.at(u, v);
        var n = f.at(u + 0.35 * wu, v + 0.35 * wu);
        var lv = n * 4, fl = Math.floor(lv), fr = lv - fl;
        var hgt = (fl + smooth(0.70, 1.0, fr)) / 4;
        var groove = 1 - smooth(0.0, 0.05, Math.abs(fr - 0.85));
        var t = 0.86 + 0.08 * hgt - 0.10 * groove + 0.04 * (g.at(u, v) - 0.5);
        o.r = t * 0.995; o.g = t * 0.99; o.b = t * 0.975;
        o.h = hgt - 0.05 * groove;
        o.ro = 0.55 + 0.1 * groove;
      });
      SETS.relief.size = 1.6;
    })();

    // ------------------------------------------------ open ground, outside
    (function () {
      var f = new Fbm(101, 4, 5), g = new Fbm(102, 32, 2);
      SETS.earth = buildSet(256, 256, 1.2, function (u, v, x, y, o) {
        var n = f.at(u, v), gg = g.at(u, v);
        var t = 0.80 + 0.08 * (n - 0.5) + 0.03 * (gg - 0.5);
        var green = Math.max(0, n - 0.55) * 0.3;
        o.r = t - green * 0.3; o.g = t + green * 0.05; o.b = t * 0.92 - green * 0.2;
        o.h = gg; o.ro = 0.95;
      });
      SETS.earth.size = 6.0;
    })();

    // ------------------------------------------------------------ 树皮 bark
    // An old cypress's bark runs in long twisted ridges with deep furrows
    // between; a pine's breaks into plates. One set does for both: long
    // furrows along v, broken across u.
    (function () {
      var f = new Fbm(201, 8, 4), r = new Fbm(202, 4, 3), fine = new Fbm(203, 32, 2);
      SETS.bark = buildSet(256, 256, 3.0, function (u, v, x, y, o) {
        var warp = r.at(u, v) * 0.35;
        var ridge = Math.abs(Math.sin((u * 9 + warp * 6) * Math.PI));
        var plate = f.at(u * 1.0, v * 0.35);
        var hgt = Math.pow(ridge, 0.6) * (0.6 + 0.4 * plate) + 0.15 * fine.at(u, v);
        var t = 0.55 + 0.38 * hgt + 0.06 * (fine.at(u, v) - 0.5);
        o.r = t; o.g = t * 0.93; o.b = t * 0.86;
        o.h = hgt; o.ro = 0.88 + 0.08 * (1 - hgt);
      });
      SETS.bark.size = 0.9;
    })();

    // ------------------------------------------------------- 枝叶 foliage
    // Seen from a few metres, a conifer's crown is not a surface but a mass of
    // small sprays: bright where a spray faces out, near-black in the gaps.
    (function () {
      var f = new Fbm(301, 16, 3), g = new Fbm(302, 48, 2), big = new Fbm(303, 4, 3);
      SETS.foliage = buildSet(256, 256, 2.4, function (u, v, x, y, o) {
        var n = f.at(u, v), m = g.at(u, v), b = big.at(u, v);
        var spray = Math.pow(Math.max(0, n * 0.7 + m * 0.5 - 0.35), 0.8);
        var t = 0.45 + 0.75 * spray + 0.15 * (b - 0.5);
        o.r = t * 0.92; o.g = t; o.b = t * 0.86;
        o.h = spray; o.ro = 0.78 + 0.15 * (1 - spray);
      });
      SETS.foliage.size = 1.4;
    })();

    // --------------------------------------------------------------- 水 water
    // Moat and stream: dark, nearly still water. The albedo hardly matters --
    // what reads is the sky in it, broken by a fine wind ripple, so the normal
    // map carries two crossing ripple trains and a slow swell.
    (function () {
      var f = new Fbm(401, 8, 3), g = new Fbm(402, 24, 2);
      SETS.water = buildSet(256, 256, 1.2, function (u, v, x, y, o) {
        var r1 = Math.sin((u * 7 + v * 3 + f.at(u, v) * 2.5) * Math.PI * 2);
        var r2 = Math.sin((u * -4 + v * 9 + g.at(u, v) * 2.0) * Math.PI * 2);
        o.h = 0.5 + 0.18 * r1 + 0.12 * r2 + 0.25 * (f.at(u * 2, v * 2) - 0.5);
        var t = 0.9 + 0.1 * f.at(u, v);
        o.r = o.g = o.b = t;
        o.ro = 0.06;
      });
      SETS.water.size = 6.0;
    })();

    // --------------------------------------------------------------- 草 grass
    // Hillside and field-margin grass, worn to earth in patches.
    (function () {
      var f = new Fbm(501, 4, 4), g = new Fbm(502, 48, 2), w = new Fbm(503, 8, 3);
      SETS.grass = buildSet(256, 256, 1.6, function (u, v, x, y, o) {
        var n = f.at(u, v), blade = g.at(u, v), wear = w.at(u, v);
        var bare = Math.max(0, Math.min(1, (wear - 0.62) * 6));
        var gr = 0.70 + 0.28 * blade + 0.1 * (n - 0.5);
        o.r = gr * (0.78 + 0.35 * bare); o.g = gr * (1.0 - 0.12 * bare); o.b = gr * (0.62 + 0.25 * bare);
        o.h = blade * (1 - bare); o.ro = 0.9;
      });
      SETS.grass.size = 2.5;
    })();

    // ---------------------------------------------------------- 田 farmland
    // Rows of crop on ploughed earth: the tile is one strip of field, its
    // colour varied per field by the material and the vertex colour.
    (function () {
      var f = new Fbm(601, 8, 3), g = new Fbm(602, 32, 2);
      SETS.field = buildSet(256, 256, 1.4, function (u, v, x, y, o) {
        var row = Math.abs(Math.sin(u * Math.PI * 16));
        var crop = Math.pow(row, 0.5) * (0.75 + 0.25 * g.at(u, v));
        var n = f.at(u, v);
        var earth = 0.62 + 0.1 * n, leaf = 0.95 + 0.1 * n;
        o.r = earth * (1 - crop) * 1.05 + leaf * crop * 0.78;
        o.g = earth * (1 - crop) * 0.92 + leaf * crop * 1.0;
        o.b = earth * (1 - crop) * 0.75 + leaf * crop * 0.62;
        o.h = crop; o.ro = 0.92;
      });
      SETS.field.size = 8.0;
    })();
  }

  // ==========================================================================
  //  菱花 LATTICE — painted on a transparent canvas and cut out by alphaTest.
  //  三交六椀 is three families of bars crossing at 60 degrees with a bowl cut
  //  into every triangle and a gilt stud where the three meet; 步步锦 is the
  //  rectilinear garden pattern. Drawn in the lattice colour directly, so it is
  //  cached per colour.
  // ==========================================================================
  var LATTICE_CACHE = {};
  function latticeTexture(kind, hex) {
    var key = kind + hex;
    if (LATTICE_CACHE[key]) return LATTICE_CACHE[key];
    var c = document.createElement('canvas');
    var ctx, col = new THREE.Color(hex);
    function shade(k) {
      var cc = col.clone().multiplyScalar(k);
      return 'rgb(' + Math.round(Math.min(1, cc.r) * 255) + ',' + Math.round(Math.min(1, cc.g) * 255) + ',' + Math.round(Math.min(1, cc.b) * 255) + ')';
    }
    if (kind === 'hex') {
      // Triangular lattice with its columns vertical: points sit a apart up
      // each column, columns a*sqrt(3)/2 apart, odd columns offset by a/2. Bars
      // run vertical and at +-30 degrees. Two columns by two points is the
      // repeat, so the canvas is 2*colW wide and 2a tall.
      var a = 128, colW = a * Math.sqrt(3) / 2;
      var W = Math.round(colW * 2), H = a * 2;
      c.width = W; c.height = H;
      ctx = c.getContext('2d');
      var bar = a * 0.17;
      function pts(fn) {
        for (var ci = -2; ci <= 4; ci++)
          for (var k = -2; k <= 4; k++)
            fn(ci * colW, k * a + ((ci & 1) ? a / 2 : 0));
      }
      function bars(width, style) {
        ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round';
        ctx.beginPath();
        pts(function (x, y) {
          ctx.moveTo(x, y); ctx.lineTo(x, y + a);                  // vertical
          ctx.moveTo(x, y); ctx.lineTo(x + colW, y + a / 2);       // +30
          ctx.moveTo(x, y); ctx.lineTo(x + colW, y - a / 2);       // -30
        });
        ctx.stroke();
      }
      bars(bar * 1.3, shade(0.5));       // the dark reveal either side of a bar
      bars(bar, shade(1.0));
      bars(bar * 0.3, shade(1.28));      // the lit arris down its middle
      // a bowl cut into every triangle: what 六椀 means
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      pts(function (x, y) {
        ctx.beginPath(); ctx.arc(x + colW / 3, y + a / 2, a * 0.19, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + colW * 2 / 3, y, a * 0.19, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      // gilt 菱花 studs where three bars cross
      pts(function (x, y) {
        var gr = ctx.createRadialGradient(x - a * 0.025, y - a * 0.025, 1, x, y, a * 0.09);
        gr.addColorStop(0, '#fff1b8'); gr.addColorStop(0.55, '#d4a240'); gr.addColorStop(1, '#6d4a14');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, a * 0.09, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      // 步步锦: nested stepping rectangles, bars of two lengths
      var S = 256; c.width = c.height = S;
      ctx = c.getContext('2d');
      var b = S * 0.055;
      function rect(x, y, w, h) {
        ctx.fillStyle = shade(0.55); ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
        ctx.fillStyle = shade(1.0); ctx.fillRect(x, y, w, h);
        ctx.fillStyle = shade(1.2); ctx.fillRect(x + w * 0.3, y + h * 0.3, Math.max(1, w * 0.4), Math.max(1, h * 0.4));
      }
      // frame bars on the tile border (half on each side so tiles join)
      rect(0, 0, S, b / 2); rect(0, S - b / 2, S, b / 2);
      rect(0, 0, b / 2, S); rect(S - b / 2, 0, b / 2, S);
      // inner ring
      var i0 = S * 0.22, i1 = S * 0.78;
      rect(i0, i0, i1 - i0, b); rect(i0, i1 - b, i1 - i0, b);
      rect(i0, i0, b, i1 - i0); rect(i1 - b, i0, b, i1 - i0);
      // the steps: short struts tying the ring to the frame, staggered
      rect(S * 0.40, 0, b, i0); rect(S * 0.55, i1, b, S - i1);
      rect(0, S * 0.55, i0, b); rect(i1, S * 0.40, S - i1, b);
      // 卡子 small knots on the struts
      ctx.fillStyle = '#c99a3a';
      [[S * 0.40 + b / 2, i0 * 0.5], [S * 0.55 + b / 2, (i1 + S) / 2],
       [i0 * 0.5, S * 0.55 + b / 2], [(i1 + S) / 2, S * 0.40 + b / 2]].forEach(function (p) {
        ctx.fillRect(p[0] - b * 0.9, p[1] - b * 0.9, b * 1.8, b * 1.8);
      });
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = MAX_ANISO;
    tex.userData = { cached: true, aspect: c.height / c.width };
    LATTICE_CACHE[key] = tex;
    return tex;
  }

  // ==========================================================================
  //  彩画 PAINTED BEAMS
  //  Painted onto a canvas sized to the actual bay, so every bay gets its own
  //  箍头 / 藻头 / 枋心 division -- 一间一段, never a run of identical panels
  //  divided evenly across the facade. Three grades; colours come straight
  //  from the swatches so 自定 colour still drives the painting.
  // ==========================================================================
  var CAIHUA_CACHE = {}, CAIHUA_KEYS = [];
  function css(c) { return '#' + c.getHexString(); }
  function mixC(a, b, k) { return a.clone().lerp(b, k); }

  function caihuaTexture(o) {
    // o: { grade, kind:'beam'|'small'|'board'|'plate', len (in beam heights), qing, lv, red, swap }
    var px = 96;
    var W = Math.max(px, Math.min(2048, Math.round(px * o.len)));
    var key = [o.grade, o.kind, W, o.qing, o.lv, o.red, o.swap ? 1 : 0].join('|');
    if (CAIHUA_CACHE[key]) return CAIHUA_CACHE[key];

    var c = document.createElement('canvas');
    c.width = W; c.height = px;
    var ctx = c.getContext('2d');
    var H = px;
    var QING = new THREE.Color(o.qing), LV = new THREE.Color(o.lv), RED = new THREE.Color(o.red);
    var WHITE = new THREE.Color('#f1ece0'), BLACK = new THREE.Color('#15161a');
    var GOLD = '#d9ad4b', GOLDHI = '#ffe39a', GOLDLO = '#8a6420';
    var A = o.swap ? LV : QING, B = o.swap ? QING : LV;

    function goldGrad(y0, y1) {
      var g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, GOLDHI); g.addColorStop(0.45, GOLD); g.addColorStop(1, GOLDLO);
      return g;
    }
    function fill(col, x, y, w, h) { ctx.fillStyle = (col && col.isColor) ? css(col) : col; ctx.fillRect(x, y, w, h); }
    // 退晕: a colour laid in bands from its light tint to full strength,
    // which is what gives Qing painting its stepped, enamel look
    function yun(col, x, y, w, h, vertical) {
      var steps = 3;
      for (var i = 0; i < steps; i++) {
        var k = (steps - 1 - i) / steps * 0.55;
        var inset = i * (vertical ? w : h) / (steps * 2.4);
        if (vertical) fill(mixC(col, WHITE, k), x + inset, y, w - inset * 2, h);
        else fill(mixC(col, WHITE, k), x, y + inset, w, h - inset * 2);
      }
    }
    function line(x0, y0, x1, y1, w, col) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }

    if (o.kind === 'board') {
      // 由额垫板: red ground with a running gold scroll on the high grades
      fill(RED, 0, 0, W, H);
      if (o.grade === 'hexi') {
        ctx.strokeStyle = GOLD; ctx.lineWidth = H * 0.08;
        ctx.beginPath();
        for (var xs = 0; xs <= W; xs += H * 1.2) {
          ctx.moveTo(xs, H * 0.5);
          ctx.bezierCurveTo(xs + H * 0.3, H * 0.1, xs + H * 0.6, H * 0.1, xs + H * 0.6, H * 0.5);
          ctx.bezierCurveTo(xs + H * 0.6, H * 0.9, xs + H * 0.9, H * 0.9, xs + H * 1.2, H * 0.5);
        }
        ctx.stroke();
      }
      fill(goldGrad(0, H * 0.06), 0, 0, W, H * 0.05);
      fill(goldGrad(H * 0.95, H), 0, H * 0.95, W, H * 0.05);
    } else if (o.kind === 'plate') {
      // 平板枋: blue ground, a chain of gold 降魔云 blocks
      fill(QING, 0, 0, W, H);
      var step = H * 1.6;
      for (var xp = step * 0.25; xp < W; xp += step) {
        ctx.fillStyle = o.grade === 'sushi' ? css(mixC(LV, WHITE, 0.2)) : GOLD;
        ctx.beginPath();
        ctx.moveTo(xp, H * 0.5);
        ctx.lineTo(xp + step * 0.2, H * 0.2); ctx.lineTo(xp + step * 0.5, H * 0.2);
        ctx.lineTo(xp + step * 0.7, H * 0.5); ctx.lineTo(xp + step * 0.5, H * 0.8);
        ctx.lineTo(xp + step * 0.2, H * 0.8); ctx.closePath(); ctx.fill();
      }
      fill(css(WHITE), 0, H * 0.04, W, H * 0.04);
      fill(css(WHITE), 0, H * 0.92, W, H * 0.04);
    } else {
      // ---- the beam proper: 箍头 | (盒子) | 藻头 | 枋心 | 藻头 | (盒子) | 箍头 ----
      fill(A, 0, 0, W, H);
      var guW = H * 0.55;
      var fangW = W / 3;
      var fx0 = (W - fangW) / 2, fx1 = fx0 + fangW;
      var outline = o.grade === 'hexi' ? GOLD : o.grade === 'xuanzi' ? css(BLACK) : css(mixC(BLACK, A, 0.3));

      // 箍头 at both ends, in the other colour, ruled off
      [0, W - guW].forEach(function (x0) {
        yun(B, x0, 0, guW, H, true);
        line(x0 + guW * 0.15, 0, x0 + guW * 0.15, H, H * 0.04, outline);
        line(x0 + guW * 0.85, 0, x0 + guW * 0.85, H, H * 0.04, outline);
      });

      // 枋心: a long hexagon with pointed ends -- the panel you read first
      var tip = H * 0.45, inset = H * 0.12;
      function fangPath(grow) {
        ctx.beginPath();
        ctx.moveTo(fx0 - grow, H / 2);
        ctx.lineTo(fx0 + tip - grow * 0.4, inset - grow);
        ctx.lineTo(fx1 - tip + grow * 0.4, inset - grow);
        ctx.lineTo(fx1 + grow, H / 2);
        ctx.lineTo(fx1 - tip + grow * 0.4, H - inset + grow);
        ctx.lineTo(fx0 + tip - grow * 0.4, H - inset + grow);
        ctx.closePath();
      }

      if (o.grade === 'hexi') {
        // 藻头: the ∑-shaped 圭线光 in gold, lines doubled in white
        [[guW, fx0, 1], [fx1, W - guW, -1]].forEach(function (z) {
          var x0 = z[0], x1 = z[1], d = z[2], span = x1 - x0;
          var n = Math.max(1, Math.round(span / (H * 1.3)));
          for (var k = 0; k < n; k++) {
            var cx = d > 0 ? x0 + span * (k + 0.5) / n : x1 - span * (k + 0.5) / n;
            var r = span / n * 0.42;
            ctx.lineJoin = 'miter';
            ctx.strokeStyle = css(WHITE); ctx.lineWidth = H * 0.10;
            ctx.beginPath(); ctx.moveTo(cx - d * r, H * 0.04); ctx.lineTo(cx + d * r, H / 2); ctx.lineTo(cx - d * r, H * 0.96); ctx.stroke();
            ctx.strokeStyle = GOLD; ctx.lineWidth = H * 0.06;
            ctx.beginPath(); ctx.moveTo(cx - d * r, H * 0.04); ctx.lineTo(cx + d * r, H / 2); ctx.lineTo(cx - d * r, H * 0.96); ctx.stroke();
            // a gold 龙 roundel in each wedge
            ctx.fillStyle = GOLD;
            ctx.beginPath(); ctx.arc(cx - d * r * 0.35, H / 2, H * 0.16, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = GOLDLO; ctx.lineWidth = H * 0.02;
            ctx.beginPath(); ctx.arc(cx - d * r * 0.35, H / 2, H * 0.11, 0.3, 5.5); ctx.stroke();
          }
        });
        // 枋心: the other colour, gold-edged, with a gold 行龙 running its length
        fangPath(H * 0.05); ctx.fillStyle = GOLD; ctx.fill();
        fangPath(0); ctx.fillStyle = css(B); ctx.fill();
        ctx.save(); fangPath(0); ctx.clip();
        ctx.strokeStyle = GOLD; ctx.lineCap = 'round';
        ctx.lineWidth = H * 0.13;
        ctx.beginPath();
        var segs = 4;
        ctx.moveTo(fx0 + tip, H * 0.55);
        for (var sgi = 0; sgi < segs; sgi++) {
          var xa = fx0 + tip + (fangW - 2 * tip) * (sgi + 0.5) / segs;
          var xb = fx0 + tip + (fangW - 2 * tip) * (sgi + 1) / segs;
          ctx.quadraticCurveTo(xa, sgi % 2 ? H * 0.82 : H * 0.22, xb, H * 0.52);
        }
        ctx.stroke();
        ctx.lineWidth = H * 0.05; ctx.strokeStyle = GOLDHI; ctx.stroke();
        // 宝珠 and flames
        ctx.fillStyle = GOLD;
        ctx.beginPath(); ctx.arc(W / 2, H * 0.5, H * 0.12, 0, Math.PI * 2); ctx.fill();
        for (var fl = 0; fl < 10; fl++) {
          var fx = fx0 + tip + (fangW - 2 * tip) * hash2(fl, 1, 2), fy = H * (0.2 + 0.6 * hash2(fl, 2, 2));
          ctx.beginPath(); ctx.arc(fx, fy, H * 0.035, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } else if (o.grade === 'xuanzi') {
        // 藻头: 旋花 -- whorled rosettes, white petals ruled in black, a gold eye
        [[guW, fx0], [fx1, W - guW]].forEach(function (z) {
          var x0 = z[0], x1 = z[1], span = x1 - x0;
          var n = Math.max(1, Math.round(span / (H * 1.1)));
          for (var k = 0; k < n; k++) {
            var cx = x0 + span * (k + 0.5) / n, cy = H / 2, R = Math.min(H * 0.44, span / n * 0.46);
            [1.0, 0.72, 0.46].forEach(function (rk, ring) {
              ctx.fillStyle = css(ring % 2 ? mixC(A, WHITE, 0.35) : mixC(B, WHITE, 0.15));
              ctx.beginPath(); ctx.arc(cx, cy, R * rk, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = css(BLACK); ctx.lineWidth = H * 0.018; ctx.stroke();
              var petals = ring === 0 ? 12 : 8;
              for (var p = 0; p < petals; p++) {
                var ang = p / petals * Math.PI * 2 + ring * 0.2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(ang) * R * rk * 0.55, cy + Math.sin(ang) * R * rk * 0.55);
                ctx.lineTo(cx + Math.cos(ang + 0.25) * R * rk, cy + Math.sin(ang + 0.25) * R * rk);
                ctx.stroke();
              }
            });
            ctx.fillStyle = GOLD;
            ctx.beginPath(); ctx.arc(cx, cy, R * 0.18, 0, Math.PI * 2); ctx.fill();
          }
        });
        // 一字枋心: plain field ruled in black, one dark bar through it
        fangPath(H * 0.04); ctx.fillStyle = css(BLACK); ctx.fill();
        fangPath(0); ctx.fillStyle = css(B); ctx.fill();
        fill(mixC(BLACK, B, 0.25), fx0 + tip, H * 0.44, fangW - tip * 2, H * 0.12);
        line(fx0 + tip, H * 0.5, fx1 - tip, H * 0.5, H * 0.02, GOLD);
      } else {
        // 苏式: 包袱 -- a pale bundle hung across the beam, its border laid in
        // graded 烟云 bands, a painted landscape inside
        [[guW, fx0], [fx1, W - guW]].forEach(function (z) {
          var cx = (z[0] + z[1]) / 2;
          ctx.fillStyle = css(mixC(B, WHITE, 0.25));
          ctx.fillRect(cx - H * 0.18, H * 0.25, H * 0.36, H * 0.5);
          ctx.strokeStyle = GOLD; ctx.lineWidth = H * 0.03;
          ctx.strokeRect(cx - H * 0.18, H * 0.25, H * 0.36, H * 0.5);
        });
        var bw = fangW * 1.25, bx = W / 2;
        var bands = [mixC(BLACK, A, 0.5), mixC(A, WHITE, 0.0), mixC(A, WHITE, 0.3), mixC(A, WHITE, 0.55), mixC(A, WHITE, 0.8)];
        for (var bi = 0; bi < bands.length; bi++) {
          var g = bi * H * 0.06;
          ctx.fillStyle = css(bands[bi]);
          ctx.beginPath();
          ctx.ellipse(bx, 0, bw / 2 - g, H * 1.05 - g, 0, 0, Math.PI);
          ctx.fill();
        }
        // the picture: sky, a range of hills, water
        ctx.save();
        ctx.beginPath(); ctx.ellipse(bx, 0, bw / 2 - H * 0.32, H * 0.75, 0, 0, Math.PI); ctx.clip();
        var sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#e9e4d2'); sky.addColorStop(1, '#cfd6cf');
        ctx.fillStyle = sky; ctx.fillRect(bx - bw, 0, bw * 2, H);
        ctx.fillStyle = '#6f8a7a';
        ctx.beginPath(); ctx.moveTo(bx - bw / 2, H * 0.55);
        for (var hx = 0; hx <= 8; hx++) ctx.lineTo(bx - bw / 2 + bw * hx / 8, H * (0.30 + 0.22 * hash2(hx, 3, 4)));
        ctx.lineTo(bx + bw / 2, H * 0.6); ctx.lineTo(bx - bw / 2, H * 0.6); ctx.fill();
        ctx.fillStyle = '#4b6658';
        ctx.fillRect(bx - bw / 2, H * 0.52, bw, H * 0.04);
        ctx.restore();
      }
      // white 晕 line along both arrises: the bright edge every painted beam has
      fill(css(mixC(WHITE, A, 0.15)), 0, 0, W, H * 0.035);
      fill(css(mixC(WHITE, A, 0.15)), 0, H * 0.965, W, H * 0.035);
    }

    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = MAX_ANISO;
    tex.userData = { cached: true };
    CAIHUA_CACHE[key] = tex;
    CAIHUA_KEYS.push(key);
    // a long colour-picker drag mints a new set per colour; keep the newest
    while (CAIHUA_KEYS.length > 160) {
      var old = CAIHUA_KEYS.shift();
      if (CAIHUA_CACHE[old]) { CAIHUA_CACHE[old].dispose(); delete CAIHUA_CACHE[old]; }
    }
    return tex;
  }

  return {
    init: init, sets: SETS, latticeTexture: latticeTexture, caihuaTexture: caihuaTexture,
    hash2: hash2, Fbm: Fbm, rng: rng,
    // used when a whole colour scheme changes, so stale canvases don't pile up
    flushPainted: function () {
      Object.keys(LATTICE_CACHE).forEach(function (k) { LATTICE_CACHE[k].dispose(); delete LATTICE_CACHE[k]; });
    }
  };
})();
