// ============================================================================
//  坊 THE CITY FABRIC — a kit of parts, and the tiles that draw it
//
//  A city is thousands of small things, each a little different. Everything
//  in the hutong is drawn from one kit -- houses with gable walls and tiled
//  roofs, gatehouses, shops, sheds, wall runs, courtyard paving, wells, grape
//  trellises, six kinds of tree -- and every placement varies its size, its
//  weathering, its paintwork and whether its lamps are lit.
//
//  Two levels of detail, swapped per tile as the camera moves:
//  * near: every part instanced, with the textures -- tiled roofs, brick,
//    painted fronts with lattice and doors. The near tiles share one mesh per
//    part, refilled when a tile comes near or goes, so a dense quarter costs
//    a few dozen draw calls however many tiles are close
//  * far:  the whole tile baked into one mesh of plain coloured geometry,
//          its window bands flagged to glow at night -- one draw call a tile
//  Tiles out of view are culled whole.
//
//  All kit geometry is in metres; placements are in scene units and the
//  instance matrix carries the metre-to-unit scale.
// ============================================================================

var FAB_NEAR_M = 250;                          // metres: inside this, detail
var KIT_UM = { value: 0.25 };                  // scene units per metre, per world

function lin(hex) { var c = C(hex); return [c.r, c.g, c.b]; }
function shadeCss(hex, k) {
  var c = new THREE.Color(hex);
  return 'rgb(' + Math.round(Math.min(1, c.r * k) * 255) + ',' + Math.round(Math.min(1, c.g * k) * 255) + ',' + Math.round(Math.min(1, c.b * k) * 255) + ')';
}

// ---------------------------------------------------------------------------
//  shader patches
//  atlas: four colourways stacked in one texture; per-instance aVar picks
//         the row, aLit says whether this house's lamps are lit tonight
//  lit:   aLit only (the far window bands, baked per vertex)
//  world: brick and plaster take their UVs from world position, so a wall
//         stretched to any length keeps bricks the size of bricks
//  roof:  tile UVs scaled by the instance's own scale, likewise
// ---------------------------------------------------------------------------
function patchKit(mat, mode) {
  mat.userData.kitMode = mode;
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.kitUM = KIT_UM;
    var vs = 'uniform float kitUM;\nattribute float aVar;\nattribute float aLit;\nvarying float vKitLit;\n' + sh.vertexShader;
    var fs = 'varying float vKitLit;\n' + sh.fragmentShader;
    vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvKitLit = aLit;');
    if (mode === 'atlas') {
      vs = vs.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\n\tvUv.y = clamp( vUv.y, 0.01, 0.99 ) * 0.25 + aVar * 0.25;\n#endif');
    }
    if (mode === 'roof') {
      vs = vs.replace('#include <uv_vertex>', [
        '#include <uv_vertex>',
        '#if defined( USE_UV ) && defined( USE_INSTANCING )',
        '\tvec2 kitSc = vec2( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 2 ].xyz ) ) / kitUM;',
        '\tvUv = ( uvTransform * vec3( uv * kitSc, 1.0 ) ).xy;',
        '#endif'].join('\n'));
    }
    if (mode === 'world') {
      vs = vs.replace('#include <fog_vertex>', [
        '#include <fog_vertex>',
        '#ifdef USE_UV',
        '\tvec4 kitW = vec4( transformed, 1.0 );',
        '\tvec3 kitN = objectNormal;',
        '#ifdef USE_INSTANCING',
        '\tkitW = instanceMatrix * kitW;',
        '\tkitN = mat3( instanceMatrix ) * kitN;',
        '#endif',
        '\tkitW = modelMatrix * kitW;',
        '\tkitN = abs( normalize( mat3( modelMatrix ) * kitN ) );',
        '\tvec2 kitUv = kitN.y > max( kitN.x, kitN.z ) ? kitW.xz : ( kitN.x > kitN.z ? kitW.zy : kitW.xy );',
        '\tvUv = ( uvTransform * vec3( kitUv / kitUM, 1.0 ) ).xy;',
        '#endif'].join('\n'));
    }
    if (mode === 'atlas' || mode === 'lit') {
      fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vKitLit;');
    }
    sh.vertexShader = vs;
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = function () { return 'kit-' + mode; };
  return mat;
}

// ---------------------------------------------------------------------------
//  painted fronts: four colourways a texture, one row each
// ---------------------------------------------------------------------------
var _kitTex = {};
function kitAtlas(key, W, rowH, draw) {
  if (_kitTex[key]) return _kitTex[key];
  function make(glow) {
    var c = document.createElement('canvas');
    c.width = W; c.height = rowH * 4;
    var x = c.getContext('2d');
    for (var r = 0; r < 4; r++) {
      x.save();
      x.translate(0, (3 - r) * rowH);          // row r sits at v = r/4 .. (r+1)/4
      x.beginPath(); x.rect(0, 0, W, rowH); x.clip();
      draw(x, r, W, rowH, glow);
      x.restore();
    }
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    t.userData = { cached: true };
    return t;
  }
  return (_kitTex[key] = { map: make(false), glow: make(true) });
}

// 民居 house front: three bays, a door in the middle, 支摘窗 either side
function drawHouseFront(x, r, W, H, glow) {
  var tim = ['#7c2f22', '#2c4a3a', '#2a221e', '#6d5741'][r];
  var acc = ['#2e5a45', '#7c3022', '#5a4434', '#4c3f31'][r];
  var bw = W / 3;
  x.fillStyle = glow ? '#000' : tim;
  x.fillRect(0, 0, W, H);
  function paper(x0, y0, x1, y1, k) {
    if (glow) {
      var g = x.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, 'rgba(255,170,90,' + (0.75 * k) + ')'); g.addColorStop(1, 'rgba(255,190,110,' + k + ')');
      x.fillStyle = g;
    } else x.fillStyle = '#ddd0b0';
    x.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  function bars(x0, y0, x1, y1, step) {
    x.fillStyle = glow ? '#000' : acc;
    // 步步锦: short bars stepping in from each side
    for (var yy = y0; yy < y1; yy += step) x.fillRect(x0, yy, x1 - x0, 2);
    var n = 0;
    for (var xx = x0; xx <= x1; xx += step * 1.3) { x.fillRect(xx, y0, 2, y1 - y0); n++; }
    x.fillRect(x0, y0, x1 - x0, 3); x.fillRect(x0, y1 - 3, x1 - x0, 3);
    x.fillRect(x0, y0, 3, y1 - y0); x.fillRect(x1 - 3, y0, 3, y1 - y0);
  }
  for (var b = 0; b < 3; b++) {
    var bx = b * bw;
    if (!glow) {
      x.fillStyle = shadeCss(tim, 0.72); x.fillRect(bx, 0, 9, H); x.fillRect(bx + bw - 9, 0, 9, H);   // columns
      x.fillStyle = shadeCss(tim, 1.25); x.fillRect(bx, 0, bw, 9);                                       // lintel
      x.fillStyle = shadeCss(tim, 0.85); x.fillRect(bx, 9, bw, 4);
    }
    if (b === 1) {
      var d0 = bx + bw * 0.28, d1 = bx + bw * 0.72;
      paper(bx + 14, 18, d0 - 6, H * 0.58, 0.85); bars(bx + 14, 18, d0 - 6, H * 0.58, 9);
      paper(d1 + 6, 18, bx + bw - 14, H * 0.58, 0.85); bars(d1 + 6, 18, bx + bw - 14, H * 0.58, 9);
      // the door: two leaves, lattice over paper above, a solid panel below
      paper(d0 + 4, 18, d1 - 4, H * 0.5, 1); bars(d0 + 4, 18, d1 - 4, H * 0.5, 8);
      if (!glow) {
        x.fillStyle = shadeCss(tim, 0.9); x.fillRect(d0, H * 0.5, d1 - d0, H * 0.5);
        x.strokeStyle = shadeCss(tim, 1.3); x.lineWidth = 2;
        x.strokeRect(d0 + 6, H * 0.56, (d1 - d0) / 2 - 9, H * 0.36); x.strokeRect((d0 + d1) / 2 + 3, H * 0.56, (d1 - d0) / 2 - 9, H * 0.36);
        x.fillStyle = shadeCss(tim, 0.55); x.fillRect((d0 + d1) / 2 - 1.5, 18, 3, H);
        x.fillStyle = '#c9a248'; x.fillRect((d0 + d1) / 2 - 7, H * 0.66, 4, 4); x.fillRect((d0 + d1) / 2 + 3, H * 0.66, 4, 4);
        // a red 春联 pair either side of the door
        if (r !== 2) { x.fillStyle = '#b8261c'; x.fillRect(d0 - 4, 20, 5, H * 0.55); x.fillRect(d1 - 1, 20, 5, H * 0.55); }
      } else {
        x.fillStyle = 'rgba(255,170,90,0.6)'; x.fillRect((d0 + d1) / 2 - 1, H * 0.5, 2, H * 0.5);
      }
    } else {
      // 支摘窗: an upper sash that props open, a fixed lower one
      paper(bx + 14, 18, bx + bw - 14, H * 0.6, 1); bars(bx + 14, 18, bx + bw - 14, H * 0.6, 9);
      paper(bx + 14, H * 0.6 + 4, bx + bw - 14, H - 6, 0.7); bars(bx + 14, H * 0.6 + 4, bx + bw - 14, H - 6, 11);
      if (!glow) { x.fillStyle = shadeCss(tim, 1.1); x.fillRect(bx + 10, H * 0.6 - 2, bw - 20, 6); }
    }
  }
}

// 宅门 gate front: brick surround, carved lintel, a pair of leaves, lanterns
function drawGateFront(x, r, W, H, glow) {
  var door = ['#8a1d15', '#1d1a19', '#22402e', '#6a5440'][r];
  x.fillStyle = glow ? '#000' : '#8b877f';
  x.fillRect(0, 0, W, H);
  if (!glow) {
    x.strokeStyle = 'rgba(55,55,52,0.45)'; x.lineWidth = 1;
    for (var yy = 0; yy < H; yy += 7) {
      x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke();
      for (var xx = (yy / 7) % 2 ? 0 : 10; xx < W; xx += 20) { x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx, yy + 7); x.stroke(); }
    }
    // the roof's shadow band, then a carved brick 门楣 with its 门簪
    x.fillStyle = '#5d5a55'; x.fillRect(0, 0, W, H * 0.06);
    x.fillStyle = '#a19c92'; x.fillRect(W * 0.18, H * 0.12, W * 0.64, H * 0.12);
    x.strokeStyle = '#6d6a64'; x.lineWidth = 2;
    for (var k = 0; k < 6; k++) x.strokeRect(W * 0.2 + k * W * 0.1, H * 0.14, W * 0.08, H * 0.08);
    var knobs = r === 0 ? 4 : 2;
    for (var j = 0; j < knobs; j++) {
      x.fillStyle = r === 0 ? '#c9a248' : '#3a5f7a';
      x.beginPath(); x.arc(W * (0.5 + (j - (knobs - 1) / 2) * 0.12), H * 0.27, W * 0.03, 0, 6.28); x.fill();
    }
  }
  var d0 = W * 0.28, d1 = W * 0.72, dt = H * 0.3, db = H * 0.92;
  if (!glow) {
    x.fillStyle = '#3a2a22'; x.fillRect(d0 - 6, dt - 6, d1 - d0 + 12, db - dt + 6);       // frame
    x.fillStyle = door; x.fillRect(d0, dt, d1 - d0, db - dt);
    x.fillStyle = shadeCss(door, 0.6); x.fillRect((d0 + d1) / 2 - 1.5, dt, 3, db - dt);
    if (r === 0) {
      // 门钉: gilt studs in rows, an official's gate
      x.fillStyle = '#d4ae54';
      for (var sr = 0; sr < 5; sr++) for (var sc = 0; sc < 3; sc++) {
        [d0, (d0 + d1) / 2].forEach(function (lx) { x.beginPath(); x.arc(lx + 10 + sc * ((d1 - d0) / 2 - 20) / 2, dt + 14 + sr * (db - dt - 28) / 4, 3, 0, 6.28); x.fill(); });
      }
    } else if (r !== 3) {
      x.fillStyle = '#b8261c';                                 // 门对 on the leaves
      x.fillRect(d0 + 8, dt + 10, 9, (db - dt) * 0.62); x.fillRect(d1 - 17, dt + 10, 9, (db - dt) * 0.62);
    }
    x.fillStyle = r === 0 ? '#d4ae54' : '#4a4440';            // knockers
    x.beginPath(); x.arc((d0 + d1) / 2 - 9, (dt + db) / 2, 5, 0, 6.28); x.fill();
    x.beginPath(); x.arc((d0 + d1) / 2 + 9, (dt + db) / 2, 5, 0, 6.28); x.fill();
    x.fillStyle = '#9d988e'; x.fillRect(d0 - 10, db, d1 - d0 + 20, H - db);              // threshold
    x.fillStyle = '#a7a297';                                                              // 门墩 drums
    x.beginPath(); x.arc(d0 - 14, H * 0.9, 13, 0, 6.28); x.fill();
    x.beginPath(); x.arc(d1 + 14, H * 0.9, 13, 0, 6.28); x.fill();
  }
  if (r < 2) {
    [W * 0.14, W * 0.86].forEach(function (lx) {
      if (glow) {
        var g = x.createRadialGradient(lx, H * 0.38, 2, lx, H * 0.38, 26);
        g.addColorStop(0, 'rgba(255,120,60,1)'); g.addColorStop(1, 'rgba(255,80,30,0)');
        x.fillStyle = g; x.fillRect(lx - 30, H * 0.38 - 30, 60, 60);
      } else {
        x.fillStyle = '#3a2a22'; x.fillRect(lx - 1, H * 0.26, 2, H * 0.06);
        x.fillStyle = '#c4281c'; x.beginPath(); x.ellipse(lx, H * 0.38, 13, 17, 0, 0, 6.28); x.fill();
        x.fillStyle = '#d4ae54'; x.fillRect(lx - 7, H * 0.31, 14, 3); x.fillRect(lx - 7, H * 0.44, 14, 3);
      }
    });
  }
  if (glow) { x.fillStyle = 'rgba(255,160,80,0.5)'; x.fillRect((d0 + d1) / 2 - 1, dt, 2, db - dt); }
}

// 铺面 shop front: a signboard, the open shop, a counter, a banner
var SHOP_SIGNS = ['茶', '药', '酒', '布'];
function drawShopFront(x, r, W, H, glow) {
  var board = ['#1b1a1a', '#28405e', '#5c1a14', '#c9a24a'][r];
  var ink = r === 3 ? '#1b1a1a' : '#d6b45a';
  x.fillStyle = glow ? '#000' : '#4a2f20';
  x.fillRect(0, 0, W, H);
  if (!glow) {
    // 挂檐板: a carved board along the eave, then the signboard
    x.fillStyle = '#2f5a46'; x.fillRect(0, 0, W, H * 0.07);
    x.fillStyle = '#c9a248'; for (var k = 0; k < W; k += 16) x.fillRect(k + 4, H * 0.02, 8, H * 0.03);
    x.fillStyle = board; x.fillRect(W * 0.2, H * 0.09, W * 0.6, H * 0.15);
    x.strokeStyle = '#c9a248'; x.lineWidth = 3; x.strokeRect(W * 0.2 + 3, H * 0.09 + 3, W * 0.6 - 6, H * 0.15 - 6);
    x.fillStyle = ink; x.font = 'bold ' + Math.round(H * 0.11) + 'px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    var s = SHOP_SIGNS[r];
    [0.35, 0.5, 0.65].forEach(function (f, i) { x.fillText(i === 1 ? s : (i ? '号' : '老'), W * f, H * 0.168); });
  }
  // the open front: shelves and goods within, the counter across
  var it = H * 0.27, ib = H * 0.97;
  x.fillStyle = glow ? 'rgba(255,175,95,0.95)' : '#2a1c14';
  x.fillRect(W * 0.08, it, W * 0.84, ib - it);
  if (!glow) {
    var goods = [['#6a7a5a', '#8a6a3a', '#5a5a6a'], ['#8a5a3a', '#6a3a2a', '#c9a24a'], ['#5a3a2a', '#8a2a1e', '#3a3a3a'], ['#3a5a8a', '#8a3a3a', '#d8d0c0']][r];
    for (var sh = 0; sh < 3; sh++) {
      var sy = it + 6 + sh * (ib - it) * 0.16;
      x.fillStyle = '#5a3c28'; x.fillRect(W * 0.1, sy + (ib - it) * 0.12, W * 0.8, 3);
      for (var g = 0; g < 14; g++) { x.fillStyle = goods[(g + sh) % 3]; x.fillRect(W * 0.11 + g * W * 0.056, sy + 4, W * 0.04, (ib - it) * 0.11); }
    }
    x.fillStyle = '#6b4a30'; x.fillRect(W * 0.08, H * 0.7, W * 0.84, ib - H * 0.7);      // counter
    x.fillStyle = '#7c5a3c'; x.fillRect(W * 0.08, H * 0.7, W * 0.84, 5);
    x.fillStyle = '#5a3a26';                                                              // stacked 排门板
    for (var p = 0; p < 4; p++) { x.fillRect(W * 0.01 + p * 5, it, 4, ib - it); x.fillRect(W * 0.93 + p * 5, it, 4, ib - it); }
  } else {
    x.fillStyle = '#000'; x.fillRect(W * 0.08, H * 0.7, W * 0.84, ib - H * 0.7);
  }
  // 幌子: a hanging banner at one end
  var bx = r % 2 ? W * 0.86 : W * 0.1;
  if (!glow) {
    x.fillStyle = ['#d8c79a', '#2f5a8a', '#b8261c', '#e0d6c0'][r]; x.fillRect(bx, it + 4, W * 0.04, H * 0.42);
    x.fillStyle = '#1b1a1a'; x.font = Math.round(H * 0.06) + 'px serif'; x.textAlign = 'center';
    x.fillText(SHOP_SIGNS[r], bx + W * 0.02, it + H * 0.14);
  }
  // a pair of lanterns
  [W * 0.04, W * 0.96].forEach(function (lx) {
    if (glow) {
      var gr = x.createRadialGradient(lx, H * 0.32, 1, lx, H * 0.32, 18);
      gr.addColorStop(0, 'rgba(255,120,60,1)'); gr.addColorStop(1, 'rgba(255,80,30,0)');
      x.fillStyle = gr; x.fillRect(lx - 20, H * 0.32 - 20, 40, 40);
    } else { x.fillStyle = '#c4281c'; x.beginPath(); x.ellipse(lx, H * 0.32, 8, 11, 0, 0, 6.28); x.fill(); }
  });
}

// ---------------------------------------------------------------------------
//  KIT GEOMETRY, metres. Near parts go to their material slot; far parts all
//  go to one plain mesh ('far') except lit windows ('farLit'), and carry
//  their real colour in the vertex colours.
// ---------------------------------------------------------------------------
var KIT_FARCOL = {
  roofG: lin('#4d4f51'), brick: lin('#8a867e'), front: lin('#5e3b2c'), shopF: lin('#4d3326'), gateF: lin('#55302a'),
  wood: lin('#5a3a2a'), red: lin('#9c3b2b'), roofY: lin('#c7962f'), roofGr: lin('#4c7a53'), roofK: lin('#4d4f51'), pave: lin('#8d8981'),
  lit: lin('#a3957a')
};
function KitBuild(far) { this.far = far; this.acc = {}; }
KitBuild.prototype.S = function (slot, k) {
  var key = this.far ? (slot === 'lit' ? 'farLit' : 'far') : slot;
  var a = this.acc[key] || (this.acc[key] = new MeshAcc());
  var c = this.far ? (KIT_FARCOL[slot] || [0.5, 0.5, 0.5]) : [1, 1, 1];
  k = k === undefined ? 1 : k;
  a.col = [c[0] * k, c[1] * k, c[2] * k];
  return a;
};
KitBuild.prototype.geos = function () {
  var out = {}, self = this;
  Object.keys(this.acc).forEach(function (k) { if (self.acc[k].n) out[k] = self.acc[k].geometry(); });
  return out;
};

// a gable roof over L x D (front +z). Returns the profile, for the gables.
function kitRoof(K, slot, o) {
  var L = o.L, D = o.D, ov = o.ov, B = D / 2 + ov, H = o.H, th = o.th || 0.24;
  var xe = L / 2 + (o.xov === undefined ? 0.2 : o.xov);
  var prof = function (t) { return H * (0.14 * t + 0.86 * Math.pow(t, 1.7)); };
  var tw = ov / B, yE = o.wallTop + th - prof(tw);
  var far = K.far, nt = far ? 1 : (o.nt || 3);
  var top = o.ends === 'juan' ? 0.88 : 1;
  var slen = Math.hypot(B, H);
  function P(f, s, t) { var tt = t * top; return [(2 * s - 1) * xe, yE + prof(tt), f * B * (1 - tt), (2 * s - 1) * xe, tt * slen]; }
  [1, -1].forEach(function (f) {
    var R = K.S(slot, 1);
    R.grid(1, nt, function (s, t) { return P(f, s, t); }, [0, 1, f]);
    if (far) return;
    K.S(slot, 0.42);
    R.grid(1, nt, function (s, t) { var p = P(f, s, t); p[1] -= th; return p; }, [0, -1, 0]);
    K.S(slot, 0.5);
    R.grid(1, 1, function (s, k) { var p = P(f, s, 0); p[1] -= k * th; p[4] = k * th; return p; }, [0, 0, f]);
    [0, 1].forEach(function (s) {
      R.grid(1, nt, function (k, t) { var p = P(f, s, t); p[1] -= k * th; p[3] = p[2]; p[4] = p[1]; return p; }, [2 * s - 1, 0, 0]);
    });
  });
  var yr = yE + prof(top), zc = B * (1 - top);
  if (o.ends === 'juan') {
    // 卷棚: the two slopes rolled over a round crest, no ridge
    var R2 = K.S(slot, 0.92);
    R2.grid(1, far ? 2 : 6, function (s, a) {
      var ang = a * Math.PI, x = (2 * s - 1) * xe;
      return [x, yr + Math.sin(ang) * zc * 0.65, zc * Math.cos(ang), x, ang * zc];
    }, [0, 1, 0]);
  } else if (!far && o.ridge !== false) {
    // 清水脊 with 蝎子尾: the ridge ends curl up
    var R3 = K.S(slot, 0.78);
    R3.bar([[-xe, yr - 0.12, 0], [xe, yr - 0.12, 0]], 0.36, 0.44);
    [-1, 1].forEach(function (e) { segBox(R3, [e * (xe - 0.55), yr + 0.22, 0], [e * (xe + 0.12), yr + 0.78, 0], 0.28, 0.28); });
  }
  return { B: B, prof: prof, yE: yE, th: th, top: top, xe: xe, yr: yr };
}

// a 硬山 gable wall at x, up into the roof
function kitGable(K, D, wallTop, rf, x, f) {
  var A = K.S('brick', 1), pts = [[x, 0, 0, 0, 0], [x, 0, D / 2, D / 2, 0]];
  var n = K.far ? 2 : 6;
  for (var k = 0; k <= n; k++) {
    var z = D / 2 * (1 - 2 * k / n);
    var t = Math.min(rf.top, 1 - Math.abs(z) / rf.B);
    var y = (k === 0 || k === n) ? wallTop : rf.yE + rf.prof(t) - rf.th + 0.05;
    pts.push([x, y, z, z, y]);
  }
  pts.push([x, 0, -D / 2, -D / 2, 0]);
  A.face(pts, [f, 0, 0]);
  if (K.far) return;
  // 博缝: the coping that follows the roof down the gable
  K.S('brick', 1.12);
  [1, -1].forEach(function (s) {
    var last = null;
    for (var j = 0; j <= 4; j++) {
      var t = rf.top * j / 4, z = s * rf.B * (1 - t), y = rf.yE + rf.prof(t) + 0.04;
      var p = [x + f * 0.03, y, z];
      if (last) segBox(A, last, p, 0.42, 0.34);
      last = p;
    }
  });
  // 墀头: the corbelled wall heads at the front corners
  K.S('brick', 1.0);
  A.box(x - f * 0.2, wallTop - 0.28, D / 2 + 0.16, 0.55, 0.6, 0.5, { bottom: true });
}

// 房 a house: base, sill wall, a painted front, gable walls, back wall, roof
//  o: { L, D, He, base, ov, rise, ends, front ('front'|'shopF'|'gateF'), two (storeys), roof }
function kitHouse(o, far) {
  var K = new KitBuild(far);
  var L = o.L, D = o.D, He = o.He, b = o.base === undefined ? 0.45 : o.base;
  var roofSlot = o.roof || 'roofG';
  var rf = kitRoof(K, roofSlot, { L: L, D: D, ov: o.ov || 0.75, wallTop: He, H: D * (o.rise || 0.3), ends: o.ends || 'ying', ridge: o.ridge });
  kitGable(K, D, He, rf, L / 2, 1);
  kitGable(K, D, He, rf, -L / 2, -1);
  var Bk = K.S('brick', 1);
  // back wall, brick to the eave; a few small high windows in it
  Bk.face([[L / 2, 0, -D / 2, L / 2, 0], [-L / 2, 0, -D / 2, -L / 2, 0], [-L / 2, He, -D / 2, -L / 2, He], [L / 2, He, -D / 2, L / 2, He]], [0, 0, -1]);
  if (!far) {
    K.S('brick', 0.32);
    for (var w = 0; w < 3; w++) Bk.box((w - 1) * L * 0.3, He - 0.75, -D / 2 - 0.02, 0.7, 0.5, 0.06, { bottom: true });
    // the base, its stone kerb a shade lighter, and a step up
    K.S('brick', 1.15);
    Bk.box(0, b / 2, 0.05, L + 0.5, b, D + 0.6, { bottom: true });
    if (o.step !== false) Bk.box(0, b * 0.28, D / 2 + 0.55, Math.min(2.0, L * 0.25), b * 0.56, 0.6, { bottom: true });
  }
  var fs = o.front || 'front';
  var sill = o.sill === undefined ? (fs === 'front' ? 0.85 : 0) : o.sill;
  var fy0 = b + sill, fz = D / 2 + 0.02;
  if (sill > 0) {
    K.S('brick', 1.0);
    Bk.box(0, b + sill / 2, D / 2 - 0.12, L - 0.1, sill, 0.32, { bottom: true });
  }
  if (o.two) {
    // two storeys: the ground floor, a pent roof (腰檐) and balcony, the upper
    var mid = o.mid || 3.3;
    frontQuad(K, o.lowFront || fs, L, fy0, mid, fz, far);
    frontQuad(K, 'front', L, mid + 0.65, He - 0.05, fz, far);
    if (!far) {
      var Ry = K.S(roofSlot, 1);
      Ry.grid(1, 1, function (s, t) { var x = (s * 2 - 1) * (L / 2 + 0.1); return [x, mid + 0.75 - t * 0.6, D / 2 + t * 1.0, x, t * 1.1]; }, [0, 1, 1]);
      var Wd = K.S('wood', 1);
      Wd.col = lin('#5a2a1f');
      Wd.box(0, mid + 0.7, D / 2 + 0.05, L, 0.12, 0.2, { bottom: true });
      for (var p = 0; p <= Math.round(L / 1.4); p++) Wd.box(-L / 2 + p * L / Math.round(L / 1.4), mid + 1.2, D / 2 + 0.3, 0.08, 0.9, 0.08, { bottom: true });
      Wd.box(0, mid + 1.62, D / 2 + 0.3, L, 0.08, 0.1, { bottom: true });
    }
  } else {
    frontQuad(K, fs, L, fy0, He - 0.04, fz, far);
  }
  if (o.sign && !far) {
    // 冲天牌楼: a shop's posts rise through the eave and carry its board
    var Wo = K.S('wood', 1);
    Wo.col = lin('#3e2a20');
    [-1, 1].forEach(function (s) { Wo.box(s * (L / 2 - 0.15), (He + 1.9) / 2, D / 2 + 0.35, 0.24, He + 1.9, 0.24, { bottom: true }); });
    Wo.col = lin(o.sign);
    Wo.box(0, He + 1.2, D / 2 + 0.35, L - 0.3, 0.8, 0.12, { bottom: true });
    Wo.col = lin('#c9a248');
    Wo.box(0, He + 1.2, D / 2 + 0.43, L * 0.5, 0.45, 0.04, { bottom: true });
    Wo.col = lin('#2f5a46');
    Wo.box(0, He + 1.75, D / 2 + 0.35, L - 0.1, 0.18, 0.3, { bottom: true });
  }
  return K.geos();
}
function frontQuad(K, slot, L, y0, y1, z, far) {
  if (far) {
    var A = K.S(slot, 1);
    A.face([[-L / 2, y0, z, 0, 0], [L / 2, y0, z, 1, 0], [L / 2, y1, z, 1, 1], [-L / 2, y1, z, 0, 1]], [0, 0, 1]);
    // the windows' band, the part that lights at night
    var h = y1 - y0, Lw = K.S('lit', 1);
    Lw.face([[-L * 0.42, y0 + h * 0.22, z + 0.03, 0, 0], [L * 0.42, y0 + h * 0.22, z + 0.03, 1, 0], [L * 0.42, y0 + h * 0.78, z + 0.03, 1, 1], [-L * 0.42, y0 + h * 0.78, z + 0.03, 0, 1]], [0, 0, 1]);
    return;
  }
  var F = K.S(slot, 1);
  F.face([[-L / 2 + 0.02, y0, z, 0, 0], [L / 2 - 0.02, y0, z, 1, 0], [L / 2 - 0.02, y1, z, 1, 1], [-L / 2 + 0.02, y1, z, 0, 1]], [0, 0, 1]);
}

// 披 a lean-to shed: a single slope down to the front, a plank front
function kitShed(far) {
  var K = new KitBuild(far), L = 3.4, D = 2.6, hF = 2.1, hB = 2.6;
  var R = K.S('roofG', 1);
  R.grid(1, 1, function (s, t) { var x = (s * 2 - 1) * (L / 2 + 0.15); return [x, hB + 0.1 - t * (hB - hF + 0.25), -D / 2 - 0.15 + t * (D + 0.6), x, t * D]; }, [0, 1, 1]);
  var Bk = K.S('brick', 0.92);
  [[L / 2, 1], [-L / 2, -1]].forEach(function (g) {
    Bk.face([[g[0], 0, -D / 2, -D / 2, 0], [g[0], 0, D / 2, D / 2, 0], [g[0], hF, D / 2, D / 2, hF], [g[0], hB, -D / 2, -D / 2, hB]], [g[1], 0, 0]);
  });
  Bk.face([[L / 2, 0, -D / 2, 0, 0], [-L / 2, 0, -D / 2, L, 0], [-L / 2, hB, -D / 2, L, hB], [L / 2, hB, -D / 2, 0, hB]], [0, 0, -1]);
  var W = K.S('wood', 1);
  if (!far) W.col = lin('#4e3a2c');
  W.face([[-L / 2, 0, D / 2, 0, 0], [L / 2, 0, D / 2, L, 0], [L / 2, hF, D / 2, L, hF], [-L / 2, hF, D / 2, 0, hF]], [0, 0, 1]);
  if (!far) {
    W.col = lin('#2a201a');
    W.box(-L * 0.18, 0.95, D / 2 + 0.02, 0.9, 1.9, 0.04, { bottom: true });
  }
  return K.geos();
}

// 墙 a wall run, one metre long: body, coping, and for a plastered wall a
// grey brick 下碱 at its foot
function kitWall(o, far) {
  var K = new KitBuild(far), h = o.h, t = o.t;
  var A = K.S(o.body, 1);
  A.box(0, h / 2, 0, 1, h, t, { bottom: true });
  if (o.body === 'red' && !far) {
    K.S('brick', 1);
    K.acc.brick.box(0, 0.45, 0, 1, 0.9, t + 0.06, { bottom: true });
  }
  var cw = t / 2 + 0.24, ch = 0.34 + t * 0.12;
  var R = K.S(o.cap, 1);
  R.grid(1, 1, function (s, k) { var x = s - 0.5; return [x, h + k * ch, cw * (1 - k), x, k * cw]; }, [0, 1, 1]);
  R.grid(1, 1, function (s, k) { var x = s - 0.5; return [x, h + k * ch, -cw * (1 - k), x, k * cw]; }, [0, 1, -1]);
  if (!far) {
    K.S(o.cap, 0.45);
    R.grid(1, 1, function (s, k) { var x = s - 0.5; return [x, h, (k * 2 - 1) * cw, x, k]; }, [0, -1, 0]);
    K.S(o.cap, 0.8);
    R.bar([[-0.5, h + ch - 0.05, 0], [0.5, h + ch - 0.05, 0]], 0.2, 0.16);
  }
  return K.geos();
}

// 铺地 courtyard paving, one metre square
function kitPave(far) {
  var K = new KitBuild(far), A = K.S('pave', 1);
  A.face([[-0.5, 0.04, 0.5, -0.5, 0.5], [0.5, 0.04, 0.5, 0.5, 0.5], [0.5, 0.04, -0.5, 0.5, -0.5], [-0.5, 0.04, -0.5, -0.5, -0.5]], [0, 1, 0]);
  if (!far) {
    // the cross of stone paths a Beijing court is divided by
    K.S('pave', 1.25);
    A.face([[-0.05, 0.045, 0.5, 0, 0], [0.05, 0.045, 0.5, 0, 0], [0.05, 0.045, -0.5, 0, 0], [-0.05, 0.045, -0.5, 0, 0]], [0, 1, 0]);
    A.face([[-0.5, 0.045, 0.04, 0, 0], [0.5, 0.045, 0.04, 0, 0], [0.5, 0.045, -0.04, 0, 0], [-0.5, 0.045, -0.04, 0, 0]], [0, 1, 0]);
  }
  return K.geos();
}

// 垂花门: the painted inner gate with its hanging posts, near only
function kitChuihua() {
  var K = new KitBuild(false), W = 3.2, D = 2.4, He = 3.1;
  kitRoof(K, 'roofG', { L: W, D: D, ov: 0.55, wallTop: He, H: D * 0.32, ends: 'juan', xov: 0.25 });
  var Wd = K.S('wood', 1);
  Wd.col = lin('#8a2a1e');
  [-1, 1].forEach(function (s) {
    Wd.box(s * W * 0.42, He / 2, -D * 0.3, 0.24, He, 0.24, { bottom: true });              // 后檐柱 to the ground
    Wd.box(s * W * 0.42, He - 0.45, D * 0.36, 0.2, 0.9, 0.2, { bottom: true });            // 垂柱, hung from the beam
  });
  Wd.col = lin('#d4ae54');
  [-1, 1].forEach(function (s) { Wd.box(s * W * 0.42, He - 0.96, D * 0.36, 0.26, 0.16, 0.26, { bottom: true }); });
  Wd.col = lin('#2c5a6e');
  Wd.box(0, He - 0.12, D * 0.36, W, 0.24, 0.22, { bottom: true });
  Wd.box(0, He - 0.12, -D * 0.3, W, 0.24, 0.22, { bottom: true });
  Wd.col = lin('#2f5a3e');
  Wd.box(0, He - 0.48, D * 0.36, W * 0.8, 0.32, 0.06, { bottom: true });                    // 花罩
  Wd.box(0, (He - 0.6) / 2, -D * 0.3 + 0.02, W * 0.78, He - 0.6, 0.08, { bottom: true });   // 屏门
  var Bk = K.S('brick', 1.1);
  Bk.box(0, 0.2, 0, W + 0.4, 0.4, D + 0.4, { bottom: true });
  return K.geos();
}

// 井 a well with its windlass; 杂物 a little clutter; 葡萄架 a grape trellis
function kitWell() {
  var K = new KitBuild(false), Bk = K.S('brick', 1.1);
  Bk.box(0, 0.35, 0, 1.1, 0.7, 1.1, { bottom: true });
  K.S('brick', 0.15);
  Bk.box(0, 0.705, 0, 0.6, 0.02, 0.6, { bottom: true });
  var W = K.S('wood', 1);
  W.col = lin('#4e3a2c');
  W.box(-0.45, 1.0, 0, 0.1, 0.9, 0.1, { bottom: true }); W.box(0.45, 1.0, 0, 0.1, 0.9, 0.1, { bottom: true });
  W.box(0, 1.35, 0, 1.0, 0.14, 0.14);
  return K.geos();
}
function kitClutter() {
  var K = new KitBuild(false), W = K.S('wood', 1);
  W.col = lin('#6a4c34'); W.box(0, 0.3, 0, 0.8, 0.6, 0.6, { bottom: true });
  W.col = lin('#5a4030'); W.box(0.7, 0.22, 0.2, 0.5, 0.44, 0.5, { bottom: true });
  var B = K.S('brick', 0.6);
  B.box(-0.7, 0.35, 0.1, 0.55, 0.7, 0.55, { bottom: true });            // a water jar
  K.S('brick', 0.25);
  B.box(-0.1, 0.18, -0.7, 1.2, 0.36, 0.7, { bottom: true });            // a coal heap
  return K.geos();
}
function kitTrellis() {
  var K = new KitBuild(false), W = K.S('wood', 1);
  W.col = lin('#5a4434');
  [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]].forEach(function (p) { W.box(p[0], 1.2, p[1], 0.1, 2.4, 0.1, { bottom: true }); });
  for (var i = -2; i <= 2; i++) W.box(i * 0.8, 2.42, 0, 0.06, 0.06, 2.6);
  W.box(0, 2.42, -1.2, 3.4, 0.08, 0.08); W.box(0, 2.42, 1.2, 3.4, 0.08, 0.08);
  var T = K.S('tree', 1);
  T.col = lin('#5c7c3a');
  T.grid(4, 3, function (s, t) {
    var x = (s - 0.5) * 3.6, z = (t - 0.5) * 2.8;
    return [x, 2.5 + 0.18 * Math.sin(s * 7 + t * 5), z, x, z];
  }, [0, 1, 0]);
  return K.geos();
}

// ---------------------------------------------------------------------------
//  TREES: six kinds that grow in a Beijing court and street, and a plain far
//  version of each. Near trees are one mesh: brown trunk, green crown.
// ---------------------------------------------------------------------------
var TREE_SPECS = [
  { name: '槐', leaf: '#4c6a36', bark: '#56473b' },   // scholar tree: broad and round
  { name: '枣', leaf: '#5a7440', bark: '#5a4436' },   // jujube: thin, crooked, open
  { name: '柳', leaf: '#7b9746', bark: '#5c4c3c' },   // willow: weeping
  { name: '杨', leaf: '#5c7a4e', bark: '#8a8778' },   // poplar: tall and narrow
  { name: '柏', leaf: '#33503a', bark: '#5a4a3e' },   // cypress: dark, dense
  { name: '海棠', leaf: '#5c883c', bark: '#4e3c30' }  // crab-apple: small, bright
];
function treeLimb(acc, a, b, r0, r1) {
  var d = new THREE.Vector3().subVectors(b, a), len = d.length();
  var geo = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
  var m4 = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize()), new THREE.Vector3(1, 1, 1));
  acc.add(geo, m4, new THREE.Color(1, 1, 1), function (i, lv, uv) { return [uv.getX(i) * 2, uv.getY(i) * len]; });
  geo.dispose();
}
function treeShape(type, rnd, limb, clump) {
  var V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
  var a0 = rnd() * 6.28;
  if (type === 0) {
    var top = V(0.3, 3.0, -0.2);
    limb(V(0, -0.2, 0), top, 0.36, 0.26);
    for (var i = 0; i < 3; i++) { var a = a0 + i * 2.1; limb(top, V(Math.cos(a) * 1.7, 5.4, Math.sin(a) * 1.7), 0.2, 0.1); }
    for (var c = 0; c < 7; c++) { var b = a0 + c * 0.9; clump(V(Math.cos(b) * 2.0, 5.8 + (rnd() - 0.5) * 1.4, Math.sin(b) * 2.0), 1.7 + rnd() * 0.6, 1, 0.82, 1); }
    clump(V(0, 7.4, 0), 1.9, 1, 0.8, 1);
  } else if (type === 1) {
    var t1 = V(0.4, 2.2, 0.2);
    limb(V(0, -0.2, 0), t1, 0.2, 0.14);
    for (var j = 0; j < 4; j++) {
      var aj = a0 + j * 1.6, mid = V(t1.x + Math.cos(aj) * 0.8, 3.2 + rnd() * 0.5, t1.z + Math.sin(aj) * 0.8);
      var tip = V(mid.x + Math.cos(aj + 0.6) * 1.0, 4.4 + rnd() * 0.8, mid.z + Math.sin(aj + 0.6) * 1.0);
      limb(t1, mid, 0.1, 0.07); limb(mid, tip, 0.07, 0.04);
      clump(tip, 0.95 + rnd() * 0.35, 1.1, 0.7, 1.1);
      if (rnd() < 0.6) clump(mid.clone().add(V(0, 0.4, 0)), 0.8, 1.1, 0.7, 1.1);
    }
  } else if (type === 2) {
    var t2 = V(0.6, 2.6, 0);
    limb(V(0, -0.2, 0), t2, 0.32, 0.24);
    for (var k = 0; k < 4; k++) { var ak = a0 + k * 1.57; clump(V(t2.x + Math.cos(ak) * 1.2, 5.2 + rnd() * 0.6, Math.sin(ak) * 1.2), 1.6, 1, 0.8, 1); }
    // the weeping fringe: long, narrow, hanging
    for (var w = 0; w < 8; w++) { var aw = a0 + w * 0.79; clump(V(t2.x + Math.cos(aw) * 2.4, 3.9 + rnd() * 0.5, Math.sin(aw) * 2.4), 1.0, 0.7, 1.9, 0.7); }
  } else if (type === 3) {
    limb(V(0, -0.2, 0), V(0.2, 9.0, 0.1), 0.27, 0.1);
    for (var p = 0; p < 7; p++) clump(V((rnd() - 0.5) * 0.8, 4.0 + p * 1.3, (rnd() - 0.5) * 0.8), 1.25 - p * 0.06, 0.85, 1.35, 0.85);
  } else if (type === 4) {
    limb(V(0, -0.2, 0), V(0.2, 2.0, 0), 0.44, 0.34);
    [[3.0, 2.0, 3, 1.6], [5.0, 1.6, 3, 1.3], [7.0, 1.2, 2, 0.9], [8.8, 0.9, 1, 0]].forEach(function (ring) {
      for (var q = 0; q < ring[2]; q++) { var aq = a0 + q * 6.28 / ring[2] + ring[0]; clump(V(Math.cos(aq) * ring[3], ring[0], Math.sin(aq) * ring[3]), ring[1] + rnd() * 0.3, 1, 0.95, 1); }
    });
  } else {
    var t5 = V(0.1, 1.3, 0);
    limb(V(0, -0.2, 0), t5, 0.13, 0.09);
    for (var m = 0; m < 5; m++) { var am = a0 + m * 1.26; clump(V(Math.cos(am) * 1.0, 2.6 + (rnd() - 0.5) * 0.8, Math.sin(am) * 1.0), 0.85 + rnd() * 0.2, 1, 0.85, 1); }
  }
}
function kitTreeNear(type) {
  var rnd = TEXGEN.rng(7100 + type * 97), bark = new GeoAcc(), leaf = new GeoAcc(), seed = 0;
  treeShape(type, rnd, function (a, b, r0, r1) { treeLimb(bark, a, b, r0, r1); },
    function (p, r, sx, sy, sz) { addTuftLite(leaf, p, r, sx, sy, sz, type * 50 + (seed++), 0.85 + rnd() * 0.3); });
  var spec = TREE_SPECS[type], bc = lin(spec.bark), lc = lin(spec.leaf);
  var P = bark.p.concat(leaf.p), N = bark.n.concat(leaf.n), U = bark.uv.concat(leaf.uv), Cc = [];
  for (var i = 0; i < bark.c.length; i += 3) Cc.push(bark.c[i] * bc[0], bark.c[i + 1] * bc[1], bark.c[i + 2] * bc[2]);
  for (var j = 0; j < leaf.c.length; j += 3) Cc.push(leaf.c[j] * lc[0], leaf.c[j + 1] * lc[1], leaf.c[j + 2] * lc[2]);
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.computeBoundingSphere();
  g.userData.ownUVs = true;
  return { tree: g };
}
// a lighter tuft than the court trees': two or three clumps a cluster
function addTuftLite(acc, c, r, sx, sy, sz, seed, tint) {
  var rnd = TEXGEN.rng(seed * 13 + 7);
  var n = r > 1.4 ? 2 : 1, k = n === 1 ? 0.86 : 0.7;
  for (var i = 0; i < n; i++) {
    var a = rnd() * 6.28, d = n === 1 ? r * 0.1 : r * (0.25 + 0.3 * rnd());
    addClump(acc, new THREE.Vector3(c.x + Math.cos(a) * d * sx, c.y + (rnd() - 0.4) * r * 0.4 * sy, c.z + Math.sin(a) * d * sz),
      r * (k + 0.14 * rnd()), sx, sy, sz, seed * 7 + i, tint * (0.9 + 0.2 * rnd()));
  }
}
function kitTreeFar(type) {
  var K = new KitBuild(true), rnd = TEXGEN.rng(8100 + type * 31), spec = TREE_SPECS[type];
  var A = K.S('wood', 1);
  A.col = lin(spec.bark);
  var trunkH = [3.2, 2.4, 2.8, 6.0, 2.2, 1.4][type];
  A.box(0, trunkH / 2, 0, 0.45, trunkH, 0.45, { bottom: true });
  var lc = lin(spec.leaf);
  var soft = [];
  function blob(x, y, z, r, sy) {
    var g = new THREE.IcosahedronGeometry(1, 0);
    var pos = g.attributes.position, base = A.n;
    soft.push([base, base + pos.count, x, y, z, sy]);
    for (var i = 0; i < pos.count; i += 3) {
      var tri = [];
      for (var k = 0; k < 3; k++) {
        var px = pos.getX(i + k), py = pos.getY(i + k), pz = pos.getZ(i + k);
        var j = 0.88 + 0.24 * Math.abs(Math.sin(px * 9.1 + py * 5.3 + pz * 7.7 + type));
        var shade = 0.72 + 0.28 * (py * 0.5 + 0.5);
        A.col = [lc[0] * shade, lc[1] * shade, lc[2] * shade];
        tri.push(A.v(x + px * r * j, y + py * r * sy * j, z + pz * r * j, 0, 0));
      }
      A.idx.push(tri[0], tri[1], tri[2]);
    }
    g.dispose();
    return base;
  }
  var S = [
    [[0, 6.2, 0, 2.9, 0.8]],
    [[0.5, 4.4, 0, 2.0, 0.8]],
    [[0.6, 4.8, 0, 2.6, 0.95], [0.6, 3.6, 0, 2.9, 0.5]],
    [[0.1, 8.0, 0, 1.6, 3.0]],
    [[0.1, 5.4, 0, 2.2, 1.7]],
    [[0.1, 2.7, 0, 1.6, 0.75]]
  ][type];
  S.forEach(function (b) { blob(b[0], b[1], b[2], b[3], b[4]); });
  var out = K.geos(), g = out.far, P = g.attributes.position, N = g.attributes.normal;
  soft.forEach(function (b) {
    for (var i = b[0]; i < b[1]; i++) {
      var nx = P.getX(i) - b[2], ny = (P.getY(i) - b[3]) / (b[5] * b[5]) + 0.25, nz = P.getZ(i) - b[4];
      var l = Math.hypot(nx, ny, nz) || 1;
      N.setXYZ(i, nx / l, ny / l, nz / l);
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
//  the kit registry, built once
//  near: { slot: geometry }   far: { far, farLit }   dims: nominal metres
// ---------------------------------------------------------------------------
var KIT = null;
function buildKit() {
  if (KIT) return KIT;
  KIT = {};
  function def(name, mk, opts) {
    opts = opts || {};
    KIT[name] = { near: mk(false), far: opts.nearOnly ? null : mk(true), nearOnly: !!opts.nearOnly };
  }
  def('house', function (f) { return kitHouse({ L: 10, D: 6, He: 3.2, rise: 0.3 }, f); });
  def('houseJ', function (f) { return kitHouse({ L: 10, D: 6, He: 3.1, rise: 0.27, ends: 'juan' }, f); });
  def('two', function (f) { return kitHouse({ L: 10, D: 7, He: 6.4, rise: 0.3, two: true }, f); });
  def('shop2', function (f) { return kitHouse({ L: 10, D: 7, He: 6.4, rise: 0.3, two: true, lowFront: 'shopF', sill: 0 }, f); });
  def('shop1', function (f) { return kitHouse({ L: 8, D: 8, He: 3.8, rise: 0.28, front: 'shopF', sign: '#1e2a24' }, f); });
  def('gate', function (f) { return kitHouse({ L: 4.4, D: 5.4, He: 3.6, rise: 0.34, front: 'gateF', sill: 0, base: 0.35, step: true }, f); });
  def('shed', kitShed);
  def('wall', function (f) { return kitWall({ h: 3.2, t: 0.5, body: 'brick', cap: 'roofG' }, f); });
  def('wallR', function (f) { return kitWall({ h: 4.4, t: 0.9, body: 'red', cap: 'roofY' }, f); });
  def('wallRG', function (f) { return kitWall({ h: 4.4, t: 0.9, body: 'red', cap: 'roofGr' }, f); });
  def('wallRK', function (f) { return kitWall({ h: 4.0, t: 0.8, body: 'red', cap: 'roofG' }, f); });
  def('pave', kitPave);
  def('chuihua', kitChuihua, { nearOnly: true });
  def('well', kitWell, { nearOnly: true });
  def('clutter', kitClutter, { nearOnly: true });
  def('trellis', kitTrellis, { nearOnly: true });
  for (var t = 0; t < TREE_SPECS.length; t++) {
    KIT['tr' + t] = { near: kitTreeNear(t), far: kitTreeFar(t), nearOnly: false };
  }
  return KIT;
}

// materials, per world (cheap; the textures are shared)
function kitMaterials(lampList) {
  function std(hex, o) {
    var m = new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.85, metalness: 0 });
    if (o) Object.keys(o).forEach(function (k) { m[k] = o[k]; });
    return m;
  }
  function tiles(hex) {
    var set = TEXGEN.sets.tile, r = 1 / (4 * 0.27);
    var m = std(hex, { vertexColors: true });
    m.map = texRepeat(set.map, r, r / 0.92); m.normalMap = texRepeat(set.normal, r, r / 0.92);
    m.roughnessMap = texRepeat(set.rough, r, r / 0.92); m.roughness = 1;
    return patchKit(m, 'roof');
  }
  function glowing(m, k) { m.emissive = new THREE.Color(1.0, 0.62, 0.32); m.emissiveIntensity = 0; lampList.push({ m: m, base: k }); return m; }
  var front = kitAtlas('front', 512, 128, drawHouseFront), gate = kitAtlas('gate', 256, 256, drawGateFront), shop = kitAtlas('shop', 512, 256, drawShopFront);
  return {
    roofG: tiles('#5c5e60'), roofY: tiles('#d9a63a'), roofGr: tiles('#4f8a5c'),
    brick: patchKit(dress(std('#908b82', { vertexColors: true }), 'wallBrick', 1, { normal: 0.8 }), 'world'),
    red: patchKit(dress(std('#a33c2c', { vertexColors: true }), 'plaster', 1, { normal: 0.6 }), 'world'),
    pave: patchKit(dress(std('#8f8b83', { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'brick', 1, { normal: 0.5 }), 'world'),
    front: glowing(patchKit(new THREE.MeshStandardMaterial({ map: front.map, emissiveMap: front.glow, roughness: 0.8 }), 'atlas'), 1.0),
    gateF: glowing(patchKit(new THREE.MeshStandardMaterial({ map: gate.map, emissiveMap: gate.glow, roughness: 0.75 }), 'atlas'), 1.2),
    shopF: glowing(patchKit(new THREE.MeshStandardMaterial({ map: shop.map, emissiveMap: shop.glow, roughness: 0.8 }), 'atlas'), 1.15),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    tree: dress(std('#ffffff', { vertexColors: true }), 'foliage', 1, { normal: 1.0 }),
    farLit: glowing(patchKit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'lit'), 0.6)
  };
}
// which slots take the per-instance tint
var KIT_TINTED = { roofG: 1, roofY: 1, roofGr: 1, brick: 1, red: 1, pave: 1, tree: 1, wood: 1 };
var KIT_ATTRS = { front: 1, gateF: 1, shopF: 1 };

// ---------------------------------------------------------------------------
//  FABRIC: placements are collected first, then sorted into tiles once the
//  extent is known, then built.
//  put(kind, x, z, rot, sx, sy, sz, tint, variant, lit, y): position in
//  units; sx/sy/sz in metres-per-kit-metre (the M scale is applied here)
// ---------------------------------------------------------------------------
var STRIDE = 12;
function Fabric(M) { this.M = M; this.items = []; this.tiles = []; this.lodTiles = []; this.group = null; }
Fabric.prototype.put = function (kind, x, z, rot, sx, sy, sz, tint, v, lit, y) {
  this.items.push(kind, x, y || 0, z, rot || 0, sx || 1, sy || 1, sz || 1,
    tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1, v || 0, lit || 0);
};
Fabric.prototype.tree = function (type, x, z, s, tint, y) {
  var k = 0.86 + 0.28 * ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;
  var tt = tint || [k * (0.94 + 0.1 * Math.sin(z * 0.37)), k, k * (0.92 + 0.08 * Math.cos(x * 0.29))];
  this.put('tr' + type, x, z, (x * 7.31 + z * 3.17) % 6.283, s, s, s, tt, 0, 0, y);
};

// tiles: a fine grid with two levels of detail over `inner`, a coarse
// far-only grid for everything outside it
Fabric.prototype.build = function (inner, tileM, mats) {
  var M = this.M, ts = tileM * M, cs = ts * 3;
  var nx = Math.max(1, Math.ceil((inner.x1 - inner.x0) / ts)), nz = Math.max(1, Math.ceil((inner.z1 - inner.z0) / ts));
  var fine = [], coarse = {}, all = [];
  function tileFor(x, z) {
    var i = Math.floor((x - inner.x0) / ts), j = Math.floor((z - inner.z0) / ts);
    if (i >= 0 && j >= 0 && i < nx && j < nz) {
      var id = j * nx + i;
      if (!fine[id]) all.push(fine[id] = { x0: inner.x0 + i * ts, z0: inner.z0 + j * ts, x1: inner.x0 + (i + 1) * ts, z1: inner.z0 + (j + 1) * ts, lod: true, items: {} });
      return fine[id];
    }
    var ci = Math.floor(x / cs), cj = Math.floor(z / cs), key = ci + ',' + cj;
    if (!coarse[key]) all.push(coarse[key] = { x0: ci * cs, z0: cj * cs, x1: (ci + 1) * cs, z1: (cj + 1) * cs, lod: false, items: {} });
    return coarse[key];
  }
  var it = this.items, n = it.length / (STRIDE + 1);
  for (var r = 0; r < n; r++) {
    var o = r * (STRIDE + 1), T = tileFor(it[o + 1], it[o + 3]);
    (T.items[it[o]] = T.items[it[o]] || []).push(o);
  }
  var group = new THREE.Group();
  group.name = 'fabric';
  var self = this;
  this.mats = mats;
  all.forEach(function (T) { self.buildTile(T, group); });
  this.tiles = all;
  this.lodTiles = all.filter(function (T) { return T.lod && T.nd; });
  this.buildNear(mats, group);
  this.group = group;
  return group;
};

var _fm4 = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3(), _fnm = new THREE.Matrix3();
// one tile: its far mesh is baked now; its near placements are kept as
// arrays, to be poured into the shared near meshes when the eye comes close
Fabric.prototype.buildTile = function (T, group) {
  var M = this.M, it = this.items;
  var kinds = Object.keys(T.items);
  if (!kinds.length) return;
  var nd = T.lod ? {} : null, any = false;
  // far: everything in one mesh, one draw; only the window bands carry the
  // per-house lit flag
  var fb = new FarBake(), zeros = null;
  kinds.forEach(function (kind) {
    var tpl = KIT[kind], idx = T.items[kind], n = idx.length;
    if (!tpl) return;
    if (!T.lod && tpl.nearOnly) return;
    var mats4 = new Float32Array(n * 16), tints = new Float32Array(n * 3), vars = new Float32Array(n), lits = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var o = idx[i];
      _fq.setFromAxisAngle(_Y, it[o + 4]);
      _fm4.compose(_fp.set(it[o + 1], it[o + 2], it[o + 3]), _fq, _fs.set(it[o + 5] * M, it[o + 6] * M, it[o + 7] * M));
      mats4.set(_fm4.elements, i * 16);
      tints[i * 3] = it[o + 8]; tints[i * 3 + 1] = it[o + 9]; tints[i * 3 + 2] = it[o + 10];
      vars[i] = it[o + 11]; lits[i] = it[o + 12];
    }
    if (tpl.far) {
      if (tpl.far.far) fb.add(tpl.far.far, mats4, tints, zeros && zeros.length >= n ? zeros : (zeros = new Float32Array(Math.max(n, 256))), n);
      if (tpl.far.farLit) fb.add(tpl.far.farLit, mats4, tints, lits, n);
    }
    if (nd) { nd[kind] = { m: mats4, t: tints, v: vars, l: lits, n: n }; any = true; }
  });
  var farG = new THREE.Group();
  var fg = fb.geometry();
  if (fg) {
    var mesh = new THREE.Mesh(fg, this.mats.farLit);
    mesh.castShadow = false; mesh.receiveShadow = false;
    farG.add(mesh);
  }
  group.add(farG);
  T.farG = farG;
  T.near = false;
  if (any) T.nd = nd;
};

// the near meshes: one InstancedMesh per kind and part for the whole city,
// holding only the placements of the tiles near the eye. Its parts share one
// set of instance buffers, so a refill writes each placement once.
Fabric.prototype.buildNear = function (mats, group) {
  var caps = {}, self = this;
  this.lodTiles.forEach(function (T) { Object.keys(T.nd).forEach(function (k) { caps[k] = (caps[k] || 0) + T.nd[k].n; }); });
  var near = {}, nearG = new THREE.Group();
  nearG.name = 'fabric-near';
  Object.keys(caps).forEach(function (kind) {
    var cap = caps[kind], tpl = KIT[kind];
    var S = {
      cap: cap, count: 0, meshes: [],
      mat: new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16),
      col: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
      v: new THREE.InstancedBufferAttribute(new Float32Array(cap), 1),
      l: new THREE.InstancedBufferAttribute(new Float32Array(cap), 1)
    };
    [S.mat, S.col, S.v, S.l].forEach(function (a) { a.setUsage(THREE.DynamicDrawUsage); });
    Object.keys(tpl.near).forEach(function (slot) {
      var mat = mats[slot];
      if (!mat) return;
      var src = tpl.near[slot], g = new THREE.BufferGeometry();
      g.index = src.index;
      Object.keys(src.attributes).forEach(function (a) { g.setAttribute(a, src.attributes[a]); });
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
      if (KIT_ATTRS[slot]) { g.setAttribute('aVar', S.v); g.setAttribute('aLit', S.l); }
      var im = new THREE.InstancedMesh(g, mat, 1);
      im.instanceMatrix = S.mat;
      if (KIT_TINTED[slot]) im.instanceColor = S.col;
      im.count = 0; im.visible = false; im.frustumCulled = false;
      im.castShadow = false; im.receiveShadow = false;
      nearG.add(im);
      S.meshes.push(im);
    });
    near[kind] = S;
  });
  group.add(nearG);
  this.near = near;
};

// pour the near tiles' placements into the shared near meshes
Fabric.prototype.refill = function () {
  var near = this.near, tiles = this.lodTiles;
  Object.keys(near).forEach(function (kind) {
    var S = near[kind], off = 0;
    for (var i = 0; i < tiles.length; i++) {
      var T = tiles[i], d = T.near && T.nd[kind];
      if (!d) continue;
      S.mat.array.set(d.m, off * 16); S.col.array.set(d.t, off * 3);
      S.v.array.set(d.v, off); S.l.array.set(d.l, off);
      off += d.n;
    }
    S.count = off;
    if (off) {
      [[S.mat, 16], [S.col, 3], [S.v, 1], [S.l, 1]].forEach(function (p) {
        p[0].updateRange.offset = 0; p[0].updateRange.count = off * p[1]; p[0].needsUpdate = true;
      });
    }
    S.meshes.forEach(function (im) { im.count = off; im.visible = off > 0; });
  });
};

// LOD: a tile is drawn in detail when the camera is close to it
Fabric.prototype.updateLOD = function (cam) {
  var M = this.M, near = (IS_TOUCH ? FAB_NEAR_M * 0.65 : FAB_NEAR_M) * M;
  var px = cam.position.x, py = cam.position.y, pz = cam.position.z, any = false;
  for (var i = 0; i < this.lodTiles.length; i++) {
    var T = this.lodTiles[i];
    var dx = Math.max(T.x0 - px, 0, px - T.x1), dz = Math.max(T.z0 - pz, 0, pz - T.z1);
    var d = Math.sqrt(dx * dx + dz * dz + py * py * 0.7);
    var want = T.near ? d < near * 1.15 : d < near;
    if (want !== T.near) {
      T.near = want;
      T.farG.visible = !want;
      any = true;
    }
  }
  if (any) this.refill();
  return any;
};
Fabric.prototype.dispose = function () {
  if (!this.group) return;
  this.group.traverse(function (o) {
    if (!o.isMesh) return;
    // the instance buffers are the fabric's own; a near mesh's other buffers
    // are the template's, and are simply uploaded again by the next world
    if (o.isInstancedMesh && o.dispose) o.dispose();
    o.geometry.dispose();
  });
  this.group = null; this.tiles = []; this.lodTiles = []; this.items = []; this.near = {};
};

// far baking: transform each instance's far geometry into one buffer
function FarBake() { this.p = []; this.n = []; this.c = []; this.l = []; this.idx = []; this.count = 0; }
FarBake.prototype.add = function (g, mats4, tints, lits, n) {
  var pos = g.attributes.position.array, nor = g.attributes.normal.array, col = g.attributes.color.array;
  var ind = g.index ? g.index.array : null, vc = pos.length / 3;
  for (var i = 0; i < n; i++) {
    var e = mats4.subarray(i * 16, i * 16 + 16);
    _fm4.fromArray(e);
    _fnm.getNormalMatrix(_fm4);
    var q = _fnm.elements, base = this.count;
    var tr = tints[i * 3], tg = tints[i * 3 + 1], tb = tints[i * 3 + 2], li = lits[i];
    for (var v = 0; v < vc; v++) {
      var x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      this.p.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      var nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
      var ox = q[0] * nx + q[3] * ny + q[6] * nz, oy = q[1] * nx + q[4] * ny + q[7] * nz, oz = q[2] * nx + q[5] * ny + q[8] * nz;
      var ln = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
      this.n.push(ox / ln, oy / ln, oz / ln);
      this.c.push(col[v * 3] * tr, col[v * 3 + 1] * tg, col[v * 3 + 2] * tb);
      this.l.push(li);
    }
    if (ind) for (var k = 0; k < ind.length; k++) this.idx.push(ind[k] + base);
    else for (var k2 = 0; k2 < vc; k2++) this.idx.push(base + k2);
    this.count += vc;
  }
};
FarBake.prototype.geometry = function () {
  if (!this.count) return null;
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
  g.setAttribute('aLit', new THREE.Float32BufferAttribute(this.l, 1));
  g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
  g.computeBoundingSphere();
  return g;
};
