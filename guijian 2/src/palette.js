var PRESETS = {
  // 黄琉璃 imperial yellow — emperor only. Vermilion walls, gilt-blue caihua.
  imperial: { roof:'#d4a017', trim:'#efe9d8', wood:'#8f1d13', beam:'#123f5c', caihua:'#1a6b7a',
              dg:'#15586e', wall:'#a82a17', lattice:'#7a1810', base:'#d8d2be', rail:'#e8e2ce' },
  // 绿琉璃 green — princes, high officials, temples
  official: { roof:'#1f6b3d', trim:'#e4dfcc', wood:'#7a2d16', beam:'#164a68', caihua:'#c9971f',
              dg:'#1d5f6b', wall:'#93361c', lattice:'#5e2110', base:'#cfc9b4', rail:'#e0dac6' },
  // 蓝琉璃 azure — Temple of Heaven, altars to the sky
  heaven:   { roof:'#1d4f8c', trim:'#eae6d6', wood:'#8f1d13', beam:'#123f5c', caihua:'#d4a017',
              dg:'#15586e', wall:'#a82a17', lattice:'#7a1810', base:'#d8d2be', rail:'#e8e2ce' },
  // 黑琉璃 black — libraries (water element, wards off fire) and military halls
  library:  { roof:'#23262b', trim:'#dcd7c6', wood:'#3f2418', beam:'#1c4152', caihua:'#2f7d6b',
              dg:'#265a63', wall:'#6b4a2c', lattice:'#3a2114', base:'#c4bfaa', rail:'#d6d1bd' },
  // 灰瓦 vernacular grey clay — commoners; timber left dark and unpainted
  temple:   { roof:'#3a4048', trim:'#ded8c4', wood:'#5e2a17', beam:'#7a6526', caihua:'#1d5a70',
              dg:'#6b5720', wall:'#9c7440', lattice:'#4a2612', base:'#c9c3ac', rail:'#dcd6c2' },
  // 江南 Jiangnan — 粉墙黛瓦, white walls and ink-dark tiles
  jiangnan: { roof:'#1e2126', trim:'#f4f0e2', wood:'#2a1c14', beam:'#33241a', caihua:'#4a3628',
              dg:'#33241a', wall:'#ece7d6', lattice:'#2a1c14', base:'#bdb7a2', rail:'#f0ece0' },
  // 岭南 Lingnan — southern; ochre walls, green tile, red-gold trim
  lingnan:  { roof:'#2d6b52', trim:'#f0e6cc', wood:'#8a3418', beam:'#a8781c', caihua:'#b03018',
              dg:'#8a6318', wall:'#d4a95c', lattice:'#6b2410', base:'#cfc6ac', rail:'#e6dcc0' },
  // 藏式 Tibetan-influenced — crimson, deep gold, white
  tibetan:  { roof:'#b8891f', trim:'#f2efe4', wood:'#6b1410', beam:'#8a1a14', caihua:'#c9a02a',
              dg:'#7a1812', wall:'#8f1810', lattice:'#5a100c', base:'#e8e4d6', rail:'#f2efe4' }
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

// 彩画 painted decoration band across the head tie-beams
function buildCaihua(hw, hd, y, beamH, baseMat, accentMat, goldMat, colR) {
  var g = new THREE.Group();
  var inset = (colR || 0.08) * 0.5;
  function band(len, isX, cx, cz) {
    var segs = Math.max(5, Math.round(len/0.55));
    for (var i = 0; i < segs; i++) {
      var f = -1 + ((i+0.5)/segs)*2;
      var segLen = (len*2/segs) * 0.82;
      var isAccent = (i % 2 === 0);
      var mat = isAccent ? accentMat : baseMat;
      var w = isX ? 0.075 : segLen;
      var d = isX ? segLen : 0.075;
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, beamH*0.55, d), mat);
      m.position.set(isX ? cx : f*len, y, isX ? f*len : cz);
      g.add(m);
      // gold medallion at the centre of each accent segment
      if (isAccent) {
        var gm = new THREE.Mesh(new THREE.BoxGeometry(
          isX ? 0.085 : segLen*0.3, beamH*0.26, isX ? segLen*0.3 : 0.085), goldMat);
        gm.position.set(isX ? cx : f*len, y, isX ? f*len : cz);
        g.add(gm);
      }
    }
  }
  band(hd-inset, true,  hw-inset, 0);
  band(hd-inset, true, -(hw-inset), 0);
  band(hw-inset, false, 0,  hd-inset);
  band(hw-inset, false, 0, -(hd-inset));
  g.traverse(function(m){ if(m.isMesh){ m.castShadow = true; } });
  return g;
}


function val(id){ return parseFloat(document.getElementById(id).value); }

