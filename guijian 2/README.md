# 古建模 Gujianmo — Parametric Chinese Architecture Generator

*古建* historic architecture, *建模* modelling.

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
| 脊兽 ridge beasts | 9 / 7 / 5 / 3 / 1 by rank, led by 仙人骑凤 | 清会典 |
| 斗栱 出踩 | 3 斗口 per 拽架; 九踩 / 七踩 / 五踩 by grade | 工程做法则例 |
| 上檐出 | 21 斗口 from the 挑檐桁, so a bracketed hall adds its 拽架 | 工程做法则例 |
| 额枋 | 大额枋 6.6, 由额垫板 2, 小额枋 4.8 斗口 high | 工程做法则例 |
| 平板枋 | 3.5 × 2 斗口 | 工程做法则例 |
| 须弥座 | 圭角 10 · 下枋 8 · 下枭 7 · 束腰 8 · 上枭 7 · 上枋 9 份 | 清式营造则例 |
| 冲三 corner run-out | 3 椽径 in plan, as well as 翘四 up | 清式营造则例 |
| 椽当 | rafters at 3 斗口 centres (one 椽径 gap) | 工程做法则例 |

---

## 色彩 — the five 正色

Colour here is not a palette, it is a rank system. Everything the generator
paints is built from the five correct colours:

| | | where it goes |
|---|---|---|
| 赤 chi | the sun and fire | 朱红 columns, doors, walls — 崇高 and 富贵 |
| 黄 huang | the centre of the five phases | 黄琉璃 tile: after the Ming, the emperor's roof and no one else's |
| 青 qing | covers blue *and* green | 梁枋彩画 and the eave work |
| 白 bai | — | 汉白玉 platform, 粉墙 |
| 黑 hei | the water phase, so it wards fire | 灰黑 tile, and the roof of a library |

The regional split falls straight out of them. 北方官式 spends them at full
strength — 红墙黄瓦, 色彩强烈鲜明, 彰显皇家威严. 江南 spends almost none:
粉墙黛瓦 is 白 and 黑 by themselves, 宁静素雅, a building painted like a 水墨画.
The eight 预设 are combinations of these, not free choices, and `ZHENGSE` in
`src/palette.js` is the single place the pigments are defined.

Values are the pigments as they photograph on standing buildings, which is one
step back from the pigment out of the tube — but only one step. Draining them
is the other way to be wrong.

## 彩画 — the three grades

A painted 额枋 is divided along its length, and the division is the same at
every grade: **箍头** collar at each end, **藻头** inboard of it, **枋心** across
the middle third. What fills them is the rank:

| grade | 枋心 | 藻头 | gold | used on |
|---|---|---|---|---|
| 和玺 hexi | gold field inside its own 圭线 | gold wedges | heavy | 皇家正殿 |
| 旋子 xuanzi | plain, one gold line | 旋花 rosettes, gold-centred | an accent | general halls, side halls, temples |
| 苏式 sushi | a 包袱 hung below the beam line | one small motif | a thread | 内廷 and 园林 — 典雅活泼 |

The ground alternates 青 and 绿 bay to bay, and the 大额枋 and 小额枋 of one bay
swap, which is what makes a painted colonnade read as alternating from any
angle. Picking a 预设 sets the grade that goes with its rank; the 画等 control
overrides it.

The painting is drawn onto a canvas sized to each bay's real clear span
(`TEXGEN.caihuaTexture`, textures.js), so every bay gets its own
箍头/藻头/枋心 division -- 一间一段. It was previously a run of identical
panels divided evenly along the facade, which put 枋心 across columns. The
canvas is cached by grade, length and colours, so a rebuild reuses it.

---

## Files

```
src/
  textures.js   procedural albedo / normal / roughness sets, 菱花 lattice, 彩画 painter
  scene.js      renderer, Preetham sky, sun path, PMREM environment, fog, camera, texture cache
  geom.js       mergeStatic (draw-call batching), sweepGeometry, frustum + lathe helpers
  render.js     on-demand loop, HQ still (MSAA + SSAO), walk mode, double-click focus, keys
  constants.js  斗口/材份 tables, 举架 ladders, deriveDimensions()
  roof.js       roof faces (庑殿/歇山 + polygonal), ridges, 吻兽, eave tiles, rafters
  pagoda.js     storey stacking, 塔刹 finial
  hall.js       须弥座, balustrade, steps, columns, 额枋 + 彩画, 斗栱, walls, 槅扇
  palette.js    the five 正色 and the eight presets
  site.js       courtyard, 御路, palace wall and gate (never exported)
  app.js        rebuild(), materials, OBJ export with per-part welding
  ui.js         control surface
```

Load order matters: `textures → scene → geom → render → constants → roof →
pagoda → hall → palette → site → app → ui`. Three.js r128, its OrbitControls
and its `Sky` come from the CDN.

Bay widths are **unequal** (77 斗口 at the 明间, −11 per bay outward), so
anything that has to line up with a bay — columns, 槅扇, 斗栱 — must take its
positions from `bayAxes(D, scale)`. Dividing the facade evenly is the one thing
that will silently put panels across columns.

---

## 真实感 — what makes it read as a building

**Light is modelled, not painted.** The sky is the Preetham analytic daylight
model (three's `Sky`), and the sun follows its real path over Beijing (39.9 N)
at the equinox -- up due east at 06:00, 50 degrees at noon, down due west at
18:00. The same sky is rendered into a PMREM environment map, so every surface
is lit by and reflects the actual sky above it; a ground disc in that
environment returns bounce light at the paving's albedo, which keeps the
underside of a deep eave dark instead of glowing blue. Fog colour is read back
from the rendered horizon, so the ground meets the sky without a seam. Three
weathers (晴 / 霾 / 阴) change turbidity, haze and sun strength together.

**Everything has a real size.** `M` (scene units per metre) is derived from the
斗口 grade, so the structure stays modular while the parts a person touches are
cut from metres: risers 15 cm, balustrades 0.9 m, door leaves about 0.95 m,
bricks 48 × 24 cm, a palace wall 6.5 m. The old generator had three 45 cm steps
on a default hall; it now has nine.

**A place, not a stage.** The hall stands in a 城砖-paved court with a raised
御路 to its steps, inside a 6.5 m palace wall with a glazed coping and a 9 × 9
studded gate; beyond it, instanced halls of the palace city recede into the
haze, and a ring of hills sits on the horizon in aerial-perspective colour. The
wall takes the scheme's wall colour, so a 江南 hall gets 粉墙. 环境 → 旷野 drops
the court for open ground. None of it is exported.

**The roof is built the way a roof is.** Each slope is its own closed shell with
a tiled top and a timber soffit. The 歇山 front and back slopes run unbroken from
ridge to eave and overhang the 山花 as the 出山; below the break the sides are a
hipped skirt (撒头). The section is the exact Bezier, not a polyline, so it has no
facets. Ridges are swept along the true surface curve, so a hip ridge follows
the concave 举架 instead of spanning it with daylight underneath. The eave
carries 瓦当 and 滴水 on the tile rhythm, 飞椽 over 檐椽 at 3 斗口 centres fanning
into the corner as 翼角椽, the 角梁 with its 套兽, and the corner runs out in plan
(冲三) as well as up (翘四).

**Tiles at their real spacing.** 瓦垄 spacing follows the building's rank (a
larger 样 on a larger hall) -- about 36 cm on a grade-6 hall, which is roughly
110 runs across the front. The tile texture carries 筒瓦 barrels, 板瓦 channels
and laps (压七露三); it runs down every face, including the hip ends, where the
old single grid laid it across the slope.

**Materials.** Every surface has albedo, normal and roughness maps, drawn at load
from seeded noise (textures.js): glossy glaze on tile crowns, dull dirty
channels, lacquer with 断纹 cracks, weathered 红土 lime render, 汉白玉 ashlar
with fine joints, 金砖 paving, rubbed 干摆 brick. Courtyard tone is varied with
vertex colour over a subdivided plane, so the texture repeat disappears.

**Ambient occlusion.** Rendering is on demand. While the camera moves the scene
is drawn directly; once it stops, one more frame is drawn through the HQ path
(4x MSAA colour, a normal + depth pass, 16-sample SSAO, depth-aware blur) and
stays on screen at no further cost. The shadow map is only redrawn when the
sun or the geometry changes, never because the camera moved. 精细 turns HQ off.

**Draw calls.** `mergeStatic()` folds every non-instanced part into one mesh per
material after each build: a default hall goes from about 5,000 draw calls to
under 60. Each merged mesh keeps every original part's geometry and matrix in
`userData.parts`, and `exportOBJ()` exports those, so the OBJ is still one
closed part per piece.

## 视角 — viewing

正 / 侧 / 背 / 斜 / 顶 orbit the model; 人 stands you in the courtyard at eye height
looking up at the eaves; 近 flies to the front corner (翼角, 斗栱 and 走兽 in one
frame); 全 re-frames. Double-click anything to fly to it and orbit it at arm's
length. Arrow keys orbit, +/- zoom, F frames. 游 is a walk mode: WASD or arrows,
drag to look, shift to hurry, Esc to leave -- it climbs the 台基 by the steps
and won't walk you through a wall. The camera can look up from below the eave
line; it is kept above the paving, not above the horizon.

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
no NaN vertices, no inverted normals. After the realism pass: 58 builds across
both roof types, 大式/小式, 清/宋, grades 1–11, 3–11 bays, 5–11 purlins, every
preset and 18 pagoda configurations — no exceptions, no NaN positions or
instance matrices.

---

## Export

`exportOBJ()` walks the scene, **flattens InstancedMesh instances** (otherwise
every rafter is lost), **welds coincident vertices per part**, drops degenerate
triangles, and **fan-fills any remaining boundary loops**.

After the realism pass (merged meshes exported part by part): default hall
154,963 vertices / 273,578 triangles, 5-storey pagoda 271,878 / 483,916 — zero
boundary edges and zero non-manifold edges in both.

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

**Texel density:** `worldScaleUVs()` (scene.js) rewrites box, cylinder and plane
UVs in world units after every rebuild, because `BoxGeometry` hands each face
0..1 UVs whatever its real size. Because of it, `map.repeat` means **tiles per
world unit**; `dress()` sets it from each texture set's real size in metres and
`M`, so a brick is brick-sized at every grade. Geometry that lays its own UVs
(roof faces, sweeps, rings) sets `geometry.userData.ownUVs` and is skipped.
Cylinder UVs are rounded to a whole number of repeats so the grain never tears
at the seam.

**Normal maps:** every albedo canvas is drawn as a height field as well as a
colour, and `normalFromHeight()` Sobels it into a tiling normal map. Those must
stay **linear** — an sRGB normal map is silently wrong, not obviously wrong.

**Tile UVs are in tile units.** A roof face's `u` is its lateral coordinate
divided by the 瓦垄 spacing (+0.5, so a crest sits on the centreline) and `v` is
arc length up the slope from the eave divided by the course length; the tile
texture holds 4 × 4 cells, hence `repeat = 0.25`. 瓦当 are placed at the same
crests, so the end caps always land on the runs.

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
2. **平水 makes the top step steeper than its coefficient** (45.9° vs 42°). This
   is correct behaviour, documented here so nobody "fixes" it.
3. **The pagoda is built at 0.62 of the hall's scale per 斗口** but at full
   storey height, so a 13-storey 楼阁式 tower on a grade-1 module is taller than
   any that stood. The ratios match 应县木塔; the absolute size follows the grade.
4. Not yet built: 攒尖顶 for halls, 重檐 double-eave, interiors (藻井, 天花).

---

## Running

Single file: open `standalone.html` in a browser (regenerate it with
`python3 build-standalone.py` after editing `src/`).
Modular: serve the folder (`python3 -m http.server`) and open `index.html`.
Three.js r128 via CDN.
