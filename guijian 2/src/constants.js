//  MODULAR PROPORTION SYSTEM
//  Every dimension below derives from one module, per 《工程做法则例》(Qing,
//  1734) and 《营造法式》(Song, 1103). No invented constants.
// ============================================================================

// 斗口 grades 1..11 : 6.0寸 down to 1.0寸 in 0.5寸 steps (卷二十八)
var DOUKOU_CUN = [6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0];

// 举架 coefficient ladders, eave -> ridge, keyed by purlin count (Qing)
var JUJIA = {
  5:  [0.5, 0.7],
  7:  [0.5, 0.65, 0.8],
  9:  [0.5, 0.65, 0.75, 0.9],
  11: [0.5, 0.6, 0.65, 0.75, 0.9]
};

// Song 举折: total rise as a fraction of span, by building class
var JUZHE_RISE = { dian: 1/3, ting: 1/4 };

function deriveDimensions(grade, bays, purlins, isDaShi, isSong) {
  var dk = 1.0;                       // work in doukou units, scale at the end
  var D = {};
  D.doukouCun = DOUKOU_CUN[grade - 1];

  // --- vertical: column ---
  D.colDia    = 6 * dk;               // 檐柱径 = 6 斗口
  D.colH      = 60 * dk;              // 檐柱高 = 60 斗口 (= 10 diameters)
  D.colTopDia = D.colDia * (1 - (isDaShi ? 0.007 : 0.01) * 10); // 收分 taper
  D.cejiao    = { front: 1/100, side: 8/1000 };                 // 侧脚 lean

  // --- plan: bays. 明间 = 77 斗口 (7 攒 x 11), each outward bay -1 攒 ---
  D.zanDang = 11 * dk;
  var half = (bays - 1) / 2;
  D.bayWidths = [];
  for (var i = -half; i <= half; i++) {
    var steps = Math.abs(i);
    var w = 77 * dk - steps * D.zanDang;
    D.bayWidths.push(Math.max(44 * dk, w));   // floor at 4 攒
  }
  D.totalWidth = D.bayWidths.reduce(function(a,b){ return a+b; }, 0);

  // --- plan: depth. 通进深 = 通面阔 x 5/8 (documented 大式 rule), then
  // subdivided into 步架 keeping the canonical 廊步:其他 = 24:19.2 = 1.25:1 ratio ---
  D.totalDepth = D.totalWidth * 0.625;
  D.halfDepth  = D.totalDepth / 2;
  var halfSteps = (purlins - 1) / 2;
  var weights = [];
  for (var k = 0; k < halfSteps; k++) weights.push(k === 0 ? 1.25 : 1.0);
  var wSum = weights.reduce(function(a,b){ return a+b; }, 0);
  D.stepRuns = weights.map(function(w){ return (w / wSum) * D.halfDepth; });

  // --- roof curve: real purlin positions from 举架 / 举折 ---
  D.coeffs = JUJIA[purlins] || JUJIA[9];
  D.purlins = [{ x: D.halfDepth, y: 0 }];       // eave purlin at the outside
  var cx = D.halfDepth, cy = 0;
  for (var j = 0; j < D.stepRuns.length; j++) {
    cx -= D.stepRuns[j];
    cy += D.coeffs[j] * D.stepRuns[j];
    D.purlins.push({ x: Math.max(0, cx), y: cy });
  }
  D.pingShui = isDaShi ? 4 * dk : D.colDia - 1;   // 平水 above the melon column
  D.roofRise = cy + D.pingShui;
  D.purlins[D.purlins.length - 1].y += D.pingShui;

  if (isSong) {
    // 举折: fix total rise as a fraction of span, then fold top-down by halves
    var H = D.totalDepth * JUZHE_RISE.dian;
    var n = D.purlins.length;
    for (var q = 0; q < n; q++) {
      var t = q / (n - 1);                        // 0 = eave, 1 = ridge
      D.purlins[q].y = H * t;
    }
    var fold = H / 10;
    for (var f = n - 2; f > 0; f--) {
      D.purlins[f].y -= fold;
      fold /= 2;
    }
    D.roofRise = H;
  }

  // --- eave: 出檐 = 21 斗口 (檐椽 14 : 飞椽 7 = 2:1) ---
  D.rafterDia   = 1.5 * dk;                       // 椽径 = 1.5 斗口
  D.eaveRafter  = 14 * dk;
  D.flyRafter   = 7 * dk;
  D.eaveOut     = isDaShi ? (D.eaveRafter + D.flyRafter) : D.colH * 0.3;
  D.zhengXinHeng = 4.5 * dk;                      // 正心桁径
  D.tiaoYanHeng  = 3 * dk;                        // 挑檐桁径
  D.purlinDia    = D.rafterDia * 3;               // 檩径 = 3 椽径

  // --- 冲三翘四: corner rafter projects 3 椽径, rises 4 椽径 ---
  D.cornerOut  = 3 * D.rafterDia;
  D.cornerRise = 4 * D.rafterDia;

  // --- 生起: corner columns rise 2寸 per two bays (Song only) ---
  D.shengqi = isSong ? (bays - 1) * 0.5 * (2 / D.doukouCun) * dk : 0;

  // --- platform 台明 ---
  D.baseH = isDaShi ? D.colH * 0.2 : 2 * D.colDia;

  // --- bracket set 斗栱 ---
  D.dgUnit = dk;                                  // bracket sized on the module
  D.dgH    = isDaShi ? 12 * dk : 0;

  return D;
}


