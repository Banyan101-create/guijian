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
//  The values are albedos: what the surface reflects, not what a photograph of
//  it shows. The renderer adds the sun, the sky and the glaze's own sheen, so a
//  value that matched a photo would come out a stop too bright.
//
//  脊 ridges are glazed in the roof's own colour on an official building (a
//  yellow roof has yellow ridges and yellow beasts); the 脊檐 swatch carries
//  that colour, so a southern hall can still have its white 灰塑 ridges.
// ============================================================================
var ZHENGSE = {
  chi:    '#8a2a21',   // 朱红, lacquered on columns
  chiWall:'#9c3e2b',   // 红墙, a 红土 wash: duller and more orange than the columns
  huang:  '#c28f2e',   // 黄琉璃
  qing:   '#1c4e72',   // 青, the blue half — 梁枋 ground
  lv:     '#2a7254',   // 青, the green half — 绿琉璃 and the alternating 彩画 ground
  bai:    '#d5d0c3',   // 汉白玉 台基
  fen:    '#e6e1d4',   // 粉墙
  hei:    '#2b2f35',   // 黛瓦 / 黑琉璃
  hui:    '#4a5058',   // 灰瓦
  jin:    '#c9a14a'    // 金 — never a 正色, only ever a highlight on the 彩画
};

var PRESETS = {
  // 黄琉璃 imperial — 红墙黄瓦 at full strength. Emperor only.
  imperial: { roof:ZHENGSE.huang, trim:'#b9872b', wood:ZHENGSE.chi, beam:ZHENGSE.qing,
              caihua:ZHENGSE.lv,  dg:'#1f5a78', wall:ZHENGSE.chiWall, lattice:'#86281d',
              base:ZHENGSE.bai,   rail:'#dcd8cc', caihuaType:'hexi' },
  // 绿琉璃 — princes, high officials, temples: one rank below the yellow roof
  official: { roof:'#2f6e4a',     trim:'#2b6646', wood:'#7e2f22', beam:ZHENGSE.qing,
              caihua:'#2f6b52',   dg:'#245f74', wall:'#96432c', lattice:'#6a2a1c',
              base:'#c9c4b4',     rail:'#d0cbbd', caihuaType:'xuanzi' },
  // 蓝琉璃 azure — 天坛 and the altars to the sky
  heaven:   { roof:'#244f86',     trim:'#22497c', wood:ZHENGSE.chi, beam:ZHENGSE.qing,
              caihua:ZHENGSE.lv,  dg:'#1f5a78', wall:ZHENGSE.chiWall, lattice:'#86281d',
              base:ZHENGSE.bai,   rail:'#dcd8cc', caihuaType:'hexi' },
  // 黑琉璃 — 文渊阁: 黑 is the water phase, and water wards fire
  library:  { roof:ZHENGSE.hei,   trim:'#2c3036', wood:'#3f281c', beam:'#21445a',
              caihua:'#2f7262',   dg:'#27566a', wall:'#7a5638', lattice:'#3c2417',
              base:'#bdb8aa',     rail:'#c4c0b2', caihuaType:'xuanzi' },
  // 灰瓦 vernacular — commoners and small temples; timber left dark and unpainted
  temple:   { roof:ZHENGSE.hui,   trim:'#4c5259', wood:'#5a2c1d', beam:'#6f5d2c',
              caihua:'#25566a',   dg:'#5f5428', wall:'#a07a4a', lattice:'#4a2816',
              base:'#b8b2a2',     rail:'#c2bcad', caihuaType:'xuanzi' },
  // 江南 — 粉墙黛瓦. 白 and 黑 alone, and the 苏式 painting of the garden courts
  jiangnan: { roof:'#33373d',     trim:'#3b4047', wood:'#2e2119', beam:'#3a2a1f',
              caihua:'#4c392b',   dg:'#3a2a1f', wall:ZHENGSE.fen, lattice:'#2e2119',
              base:'#aaa595',     rail:'#d6d2c5', caihuaType:'sushi' },
  // 岭南 — southern; ochre walls, green tile, 灰塑 ridges, a hotter red
  lingnan:  { roof:'#35664f',     trim:'#d6cfbd', wood:'#8a3420', beam:'#a07c2c',
              caihua:'#a53d24',   dg:'#856327', wall:'#c9a662', lattice:'#6b2c18',
              base:'#b6ae99',     rail:'#c8c0a8', caihuaType:'sushi' },
  // 藏式 — crimson, deep gold and white, outside the 五色 system proper
  tibetan:  { roof:'#b58b33',     trim:'#c99d3a', wood:'#6a1f18', beam:'#82241b',
              caihua:'#c0a03a',   dg:'#76221a', wall:'#8a2519', lattice:'#5a1913',
              base:'#d4d0c4',     rail:'#dbd7cb', caihuaType:'hexi' }
};

function val(id) { return parseFloat(document.getElementById(id).value); }
