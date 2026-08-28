# 古建生成器 — Parametric Chinese Architecture Generator

A browser-based parametric generator for traditional Chinese timber architecture.
Produces halls (大殿) and pagodas (塔) whose dimensions derive from the historical
building manuals rather than arbitrary values, and exports print-ready OBJ.

**Original work.** Not derived from any existing generator's code or design.

---

## The core idea

Every dimension derives from **one module**. Nothing is a magic number.

- **Qing 斗口 (doukou)** system — 《工程做法则例》, 1734
- **Song 材份 (caifen)** system — 《营造法式》, 1103

Move the module and the whole building scales correctly, because column
diameter, bay widths, bracket spacing, eave depth, rafter size and corner rise
are all multiples of it. This is why the output looks proportionally right at
any size, and it's the single most important thing to preserve when editing.

---

## Encoded rules

| Rule | Value | Source |
|---|---|---|
| 柱径 column diameter | 6 斗口 | 工程做法则例 |
| 柱高 column height | 60 斗口 (10× dia) | 梁思成《清式营造则例》 |
| 攒当 bracket spacing | 11 斗口 | 工程做法则例 |
| 明间 central bay | 77 斗口 (7 攒) | 工程做法则例 |
| 次间/梢间 | −11 斗口 per bay outward | 工程做法则例 |
| 椽径 rafter diameter | 1.5 斗口 | derived (⅓ 檩径) |
| 出檐 eave projection | 21 斗口 = 14 檐椽 + 7 飞椽 (2:1) | 工程做法则例 |
| 举架 roof curve | 0.5 → 0.65 → 0.75 → 0.9 (9-purlin 大式) | 工程做法则例 |
| 举折 Song curve | rise = span/3, then halving folds | 营造法式 |
| 平水 | 4 斗口 (大式) | 工程做法则例 |
| 冲三翘四 corner | out 3 椽径, rise 4 椽径 | 清式营造则例 |
| 生起 corner column rise | +2寸 per 2 bays (Song only) | 营造法式 |
| 侧脚 column lean | 1/100 front, 8/1000 side | 营造法式 |
| 收分 column taper | 1/100 小式, 7/1000 大式 | 工程做法则例 |
| 推山 hip ridge | recursive −10% per step | 工程做法则例 |
| 收山 gable inset | one 檩径 | 工程做法则例 |
| 通进深 depth | 通面阔 × 5/8 | 大式 convention |
| Pagoda taper | 0.953 per storey | 应县木塔 measured (陈明达 1980) |

---

## Files

```
src/
  scene.js      renderer, lighting, environment map, camera
  constants.js  斗口/材份 tables, 举架 ladders, deriveDimensions()
  roof.js       rectangular roof engine (庑殿/歇山), eave assembly, ridges
  pagoda.js     polygonal 攒尖 roof engine, storey stacking, 塔刹 finial
  hall.js       base, columns, walls, lattice, dougong, balustrade, caihua, steps
  palette.js    six historically-grounded colour presets
  app.js        rebuild(), UI wiring, OBJ export with vertex welding
```

Load order matters: `scene → constants → roof → pagoda → hall → palette → app`.

---

## Validation

Ratios were checked against measured buildings:

| Check | Ours | Real |
|---|---|---|
| depth : width | 0.63 | 佛光寺 0.52, 太和殿 0.56 |
| roof rise : depth | 0.31–0.37 | ~1:3 documented |
| pagoda h:w (9-storey 楼阁) | 2.33 | 应县木塔 2.22 |
| pagoda h:w (13-eave 密檐) | 4.02 | 嵩岳寺塔 ~4.0 |
| taper sequence | 968→923→879→838→798 | 968→927→883→842→798 (0.5% err) |

Automated: 1,424 UI states, 320 hall builds, 216 pagoda builds — no exceptions,
no NaN vertices, no inverted normals.

---

## Export

`exportOBJ()` walks the scene, **flattens InstancedMesh instances** (otherwise
every rafter is lost), **welds coincident vertices per part**, drops degenerate
triangles, and **fan-fills any remaining boundary loops**.

Result: **watertight**. Verified across 110 configurations (all bay/purlin/roof
type/class combinations plus every pagoda variant) — zero boundary edges, zero
non-manifold edges. Loads in Cura / PrusaSlicer / Bambu Studio with no repair
prompt. Typical hall: 54,216 → 24,836 vertices (54% welded), 1.46 MB.

Three subtleties worth knowing before editing this code:

1. **Weld per part, never globally.** Global welding fuses vertices where two
   separate solids happen to touch, turning shared edges into non-manifold ones.
   Parts stay separate closed solids; slicers union them at slice time.
2. **Normalise negative zero.** `sin(2*PI)` returns -2.4e-16, which formats as
   `"-0.00000"` while its twin formats as `"0.00000"`. Different keys means seam
   vertices never weld. `nz()` double-rounds to fix this.
3. **Find boundaries with undirected edge counts.** Directed-edge detection gives
   false positives wherever winding is inconsistent, and patching those
   already-closed regions is what creates non-manifold geometry.

**Colour space:** hex values are sRGB but Three r128 feeds them in as linear
while `outputEncoding = sRGBEncoding` converts linear -> sRGB on output. Passing
them unconverted brightens everything ~70% (deep red renders as salmon). Every
material colour goes through `C()` which calls `convertSRGBToLinear()`, and every
CanvasTexture sets `encoding = sRGBEncoding`. Don't remove either.

Note that Three.js's own primitives are not watertight — a bare cylinder has 6
boundary edges, a sphere 30, a torus 56. The fan-fill pass handles this.

## Known issues / next steps

1. **Grade and size are independent** — you can build an 18 m hall on grade-11
   timber, giving 1.9 m columns. Physically absurd; real builders matched grade
   to size. Consider constraining or warning.
3. **平水 makes the top step steeper than its coefficient** (45.9° vs 42°). This
   is correct behaviour, documented here so nobody "fixes" it.
3. Not yet built: 攒尖顶 for halls, 重檐 double-eave, 走兽 roof figurines,
   save/load designs, texture maps (currently flat PBR colours only).

---

## Running

Single file: open `chinese_hall_roof_prototype.html` in a browser.
Modular: serve `src/` with the load order above. Three.js r128 via CDN.
