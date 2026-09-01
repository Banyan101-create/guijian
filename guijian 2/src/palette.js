// ============================================================================
//  色彩 — THE FIVE 正色
//  Chinese official architecture is not painted from a free palette. It is
//  painted from five "correct" colours, and every scheme below is a combination
//  of them rather than a choice of hues:
//
//    赤 chi    the sun and fire. 朱红 on columns, doors and walls — 崇高, 富贵.
//    黄 huang  the centre of the five phases. 黄琉璃 tile, and after the Ming the
//              highest statement of 皇权 — the emperor's roof and no one else's.
//    青 qing   covers both blue and green. It lives on the 梁枋 in the 彩画 and
//              along the eaves, the colour that agrees with a timber frame.
//    白 bai    汉白玉 platforms and 粉墙 — the ground the other colours stand on.
//    黑 hei    灰黑 clay tile. Sober and practical, and the water phase, which is
//              why it roofs libraries.
//
//  The regional split falls straight out of them. 北方官式 spends them at full
//  strength — 红墙黄瓦, 色彩强烈鲜明, 彰显皇家威严. 江南 spends almost none:
//  粉墙黛瓦 is 白 and 黑 by themselves, 宁静素雅, a building painted like a 水墨画.
//
//  The values are the pigments as they photograph on standing buildings, which
//  is a step back from the pigment straight out of the tube — but only a step.
//  Draining them entirely is the other way to be wrong.
// ============================================================================
var ZHENGSE = {
  chi:    '#8b2f26',   // 朱红, as laid on columns — darker, lacquered
  chiWall:'#9a3a29',   // 红墙, a 红土 wash: brighter and more orange than the columns
  huang:  '#a8802c',   // 黄琉璃
  qing:   '#1f5570',   // 青, the blue half — 梁枋 ground
  lv:     '#2c6b48',   // 青, the green half — 绿琉璃 and the alternating 彩画 ground
  bai:    '#cbc5b3',   // 汉白玉 台基
  fen:    '#e3ded0',   // 粉墙
  hei:    '#262a30',   // 黛瓦 / 黑琉璃
  hui:    '#3d434a',   // 灰瓦
  jin:    '#b8933f'    // 金 — never a 正色, only ever a highlight on the 彩画
};

var PRESETS = {
  // 黄琉璃 imperial — 红墙黄瓦 at full strength. Emperor only.
  imperial: { roof:ZHENGSE.huang, trim:ZHENGSE.bai,  wood:ZHENGSE.chi, beam:ZHENGSE.qing,
              caihua:ZHENGSE.lv,  dg:'#24596b', wall:ZHENGSE.chiWall, lattice:'#82372a',
              base:ZHENGSE.bai,   rail:'#d2ccbb', caihuaType:'hexi' },
  // 绿琉璃 — princes, high officials, temples: one rank below the yellow roof
  official: { roof:ZHENGSE.lv,    trim:'#c4bea9', wood:'#7e3823', beam:ZHENGSE.qing,
              caihua:'#2f6b52',   dg:'#2a5d66', wall:'#96432c', lattice:'#672c1c',
              base:'#bdb7a3',     rail:'#c2bca8', caihuaType:'xuanzi' },
  // 蓝琉璃 azure — 天坛 and the altars to the sky
  heaven:   { roof:'#2a5382',     trim:'#c9c3af', wood:ZHENGSE.chi, beam:ZHENGSE.qing,
              caihua:ZHENGSE.jin, dg:'#24596b', wall:ZHENGSE.chiWall, lattice:'#82372a',
              base:ZHENGSE.bai,   rail:'#d2ccbb', caihuaType:'hexi' },
  // 黑琉璃 — 文渊阁 and the military halls: 黑 is the water phase, and water wards fire
  library:  { roof:ZHENGSE.hei,   trim:'#bab4a2', wood:'#452a1d', beam:'#22434f',
              caihua:'#35766a',   dg:'#2c5860', wall:'#6e5133', lattice:'#3f2618',
              base:'#ada798',     rail:'#b6b0a0', caihuaType:'xuanzi' },
  // 灰瓦 vernacular — commoners and small temples; timber left dark and unpainted
  temple:   { roof:ZHENGSE.hui,   trim:'#bdb7a4', wood:'#5f3020', beam:'#75632e',
              caihua:'#24576a',   dg:'#665a2c', wall:'#9a7746', lattice:'#4c2a18',
              base:'#b0aa99',     rail:'#bab4a2', caihuaType:'xuanzi' },
  // 江南 — 粉墙黛瓦. 白 and 黑 alone, and the 苏式 painting of the garden courts
  jiangnan: { roof:ZHENGSE.hei,   trim:'#d9d5c6', wood:'#302219', beam:'#38281d',
              caihua:'#4c392b',   dg:'#38281d', wall:ZHENGSE.fen, lattice:'#302219',
              base:'#a8a290',     rail:'#d5d1c3', caihuaType:'sushi' },
  // 岭南 — southern; ochre walls, green tile, and a hotter red than the north uses
  lingnan:  { roof:'#35664f',     trim:'#d0c7af', wood:'#8a3a22', beam:'#a07c2c',
              caihua:'#a53d24',   dg:'#856327', wall:'#c9a662', lattice:'#6b2c18',
              base:'#b2aa94',     rail:'#c5bca3', caihuaType:'sushi' },
  // 藏式 — crimson, deep gold and white, outside the 五色 system proper
  tibetan:  { roof:'#ab8632',     trim:'#d6d2c6', wood:'#6d211a', beam:'#85261d',
              caihua:'#c0a03a',   dg:'#78231a', wall:'#8c261b', lattice:'#5c1a14',
              base:'#cbc7ba',     rail:'#d6d2c6', caihuaType:'hexi' }
};

function buildBalustrade(hw, hd, y, mat) {
  var g = new THREE.Group();
  var postH = 0.30, postW = 0.085;
  var railH = 0.075;
  var spacing = 0.62;
  var edges = [
    { fx:1, fz:0, len:hd, cx:hw,  cz:0 },
    { fx:-1,fz:0, len:hd, cx:-hw, cz:0 },
    { fx:0, fz:-1,len:hw, cx:0,   cz:-hd }
  ];
  var postGeo = new THREE.BoxGeometry(postW, postH, postW);
  var capGeo  = new THREE.BoxGeometry(postW*1.5, postW*0.7, postW*1.5);

  edges.forEach(function(e){
    var n = Math.max(2, Math.round((e.len*2)/spacing));
    for (var i = 0; i <= n; i++) {
      var f = -1 + (i/n)*2;
      var px = e.fx !== 0 ? e.cx : f*hw;
      var pz = e.fz !== 0 ? e.cz : f*hd;
      var post = new THREE.Mesh(postGeo, mat);
      post.position.set(px, y + postH/2, pz);
      g.add(post);
      var cap = new THREE.Mesh(capGeo, mat);
      cap.position.set(px, y + postH + postW*0.3, pz);
      g.add(cap);
    }
    // top and mid rails
    var isX = e.fx !== 0;
    [postH*0.92, postH*0.45].forEach(function(ry, k){
      var rg = new THREE.BoxGeometry(
        isX ? postW*0.85 : hw*2, k===0 ? railH : railH*0.7, isX ? hd*2 : postW*0.85);
      var rail = new THREE.Mesh(rg, mat);
      rail.position.set(isX ? e.cx : 0, y + ry, isX ? 0 : e.cz);
      g.add(rail);
    });
  });
  g.traverse(function(m){ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// ============================================================================
//  彩画 — THE THREE GRADES
//  A painted beam is not one band of colour. It is divided along its length,
//  and the same division carries every grade:
//
//    箍头  the collar at each end, against the column
//    藻头  the zone inboard of it, where the grade's own motif sits
//    枋心  the centre panel, roughly the middle third — the part you read first
//
//  The grade is a rank statement, like the roof colour and the 脊兽 count:
//    和玺  the highest. Gold 圭线 bounding every zone and a gold 枋心, on a
//          ground that alternates 青 and 绿 bay to bay. 皇家正殿 only.
//    旋子  one below. 旋花 rosettes fill the 藻头, the 枋心 stays plain but for
//          one gold line. General palace halls, side halls and temples.
//    苏式  the garden grade. The 枋心 gives way to a 包袱, a pale bundle hung
//          across the centre of the beam inside a coloured border — 典雅活泼,
//          for the 内廷 and the 园林 rather than the throne hall.
//
//  Gold spends down the ladder: heavy on 和玺, an accent on 旋子, a thread on 苏式.
// ============================================================================
function buildCaihua(hw, hd, y, beamH, mats, colR, grade) {
  var g = new THREE.Group();
  var G = grade || 'hexi';

  // 彩画 is paint on the outward face of the 额枋, so it has to sit on that face
  // and not inside it. buildColumns() gives the beam a 10:8 section, so its
  // half-thickness is 0.4 of its height, and every plate below is centred on
  // that plane -- a plate of depth d then stands d/2 proud of the beam and the
  // rest of it hides in the timber. That is also the relief ladder: the deeper
  // the plate, the further forward it reads.
  var face = beamH * 0.40;
  var D0 = beamH * 0.10;                // ground
  var D1 = beamH * 0.14;                // 箍头 and 藻头 fields
  var D2 = beamH * 0.18;                // 枋心 and the rosettes
  var D3 = beamH * 0.23;                // the gold lines, furthest forward

  var cache = {};
  function box(w, h, d) {
    var k = w.toFixed(4) + ',' + h.toFixed(4) + ',' + d.toFixed(4);
    return cache[k] || (cache[k] = new THREE.BoxGeometry(w, h, d));
  }
  function disc(r, h) {
    var k = 'c' + r.toFixed(4) + ',' + h.toFixed(4);
    return cache[k] || (cache[k] = new THREE.CylinderGeometry(r, r, h, 10));
  }

  // Everything is laid out along a 1-D run and then dropped onto whichever side
  // of the building it belongs to, so the four faces cannot drift apart.
  function put(geo, mat, isX, sgn, along, dy, rotX) {
    var m = new THREE.Mesh(geo, mat);
    var at = sgn * ((isX ? hw : hd) + face);
    m.position.set(isX ? at : along, y + (dy || 0), isX ? along : at);
    if (isX) m.rotation.y = Math.PI / 2;
    if (rotX) m.rotation.x = rotX;
    g.add(m);
    return m;
  }

  function band(len, isX, sgn) {
    var run = len * 2;
    // 一间一段: the painting is divided per bay, so size the panels to the bay
    var panels = Math.max(3, Math.round(run / 1.75));
    var pw = run / panels;
    var h = beamH * 0.86;                 // its height on the beam

    for (var i = 0; i < panels; i++) {
      var c = -len + (i + 0.5) * pw;
      // 青绿相间: adjacent panels swap ground colour, which is the rule that
      // makes a painted colonnade read as alternating from any angle
      var ground = (i % 2 === 0) ? mats.qing : mats.lv;
      var other  = (i % 2 === 0) ? mats.lv   : mats.qing;

      put(box(pw * 0.995, h, D0), ground, isX, sgn, c);

      var guW = pw * 0.13;                // 箍头
      var fxW = pw * (G === 'sushi' ? 0.40 : 0.34);   // 枋心
      [-1, 1].forEach(function (sd) {
        put(box(guW, h * 1.02, D1), other, isX, sgn, c + sd * (pw / 2 - guW / 2));
        // the 箍头 is edged in gold at every grade -- it is the one line that
        // never drops off the ladder
        put(box(pw * 0.014, h * 1.04, D3), mats.gold, isX, sgn, c + sd * (pw / 2 - guW));
      });

      var zt = (pw / 2 - guW) - fxW / 2;  // the 藻头 run, each side of the 枋心

      if (G === 'hexi') {
        // 枋心: a gold field bounded by its own 圭线
        put(box(fxW, h * 0.84, D2), mats.gold, isX, sgn, c);
        put(box(fxW * 0.84, h * 0.44, D3), other, isX, sgn, c);
        [-1, 1].forEach(function (sd) {
          put(box(pw * 0.014, h * 1.02, D3), mats.gold, isX, sgn, c + sd * fxW / 2);
          // 藻头: gold wedges running out towards each 箍头
          var zc = c + sd * (fxW / 2 + zt / 2);
          put(box(zt * 0.70, h * 0.68, D1), mats.gold, isX, sgn, zc);
          put(box(zt * 0.38, h * 0.34, D2), ground, isX, sgn, zc);
        });
      } else if (G === 'xuanzi') {
        // 枋心: plain ground, one gold line through it, bounded but not filled
        put(box(fxW, h * 0.14, D2), mats.gold, isX, sgn, c);
        [-1, 1].forEach(function (sd) {
          put(box(pw * 0.014, h * 0.86, D3), mats.gold, isX, sgn, c + sd * fxW / 2);
          // 藻头: a pair of 旋花 rosettes each side, gold-centred
          [0.32, 0.70].forEach(function (f) {
            var zc = c + sd * (fxW / 2 + zt * f);
            var r = Math.min(zt * 0.20, h * 0.32);
            put(disc(r, D2), other, isX, sgn, zc, 0, Math.PI / 2);
            put(disc(r * 0.42, D3), mats.gold, isX, sgn, zc, 0, Math.PI / 2);
          });
        });
      } else {
        // 苏式 包袱: a pale bundle slung across the middle of the beam, hanging
        // below the beam line inside a border of the alternate colour
        put(box(fxW, h * 1.20, D1), other, isX, sgn, c, -h * 0.12);
        put(box(fxW * 0.86, h * 1.02, D2), mats.pale, isX, sgn, c, -h * 0.12);
        put(box(fxW * 0.58, h * 0.30, D3), mats.accent, isX, sgn, c, -h * 0.34);
        [-1, 1].forEach(function (sd) {
          put(box(pw * 0.012, h * 1.22, D3), mats.gold, isX, sgn, c + sd * fxW / 2, -h * 0.12);
          // 藻头 keeps one small motif -- 苏式 is the least crowded of the three
          var zc = c + sd * (fxW / 2 + zt * 0.5);
          put(box(zt * 0.32, h * 0.36, D1), mats.accent, isX, sgn, zc);
        });
      }
    }
  }

  // butt the four runs at the corners rather than letting them cross
  band(hd - face, true,   1);
  band(hd - face, true,  -1);
  band(hw - face, false,  1);
  band(hw - face, false, -1);
  g.traverse(function (m) { if (m.isMesh) { m.castShadow = true; } });
  return g;
}

function val(id){ return parseFloat(document.getElementById(id).value); }

