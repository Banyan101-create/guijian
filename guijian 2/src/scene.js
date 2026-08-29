
var scene = new THREE.Scene();

// subtle vertical gradient sky for depth (kept close to the original mood)
(function makeSkyBackground() {
  var c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  var ctx = c.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#2a2f3a');
  g.addColorStop(0.5, '#1b1d22');
  g.addColorStop(1.0, '#131418');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  var tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  scene.background = tex;
})();
scene.fog = new THREE.Fog(0x1b1d22, 45, 100);

var camera = new THREE.PerspectiveCamera(42, window.innerWidth/window.innerHeight, 0.1, 200);
camera.position.set(12, 8, 13);

var renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.getElementById('wrap').appendChild(renderer.domElement);

var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 3.5;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.495;

// procedural sky-ish environment for PBR reflections
function makeEnvMap() {
  var c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  var ctx = c.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#c2c9d0');
  g.addColorStop(0.45, '#e2e0da');
  g.addColorStop(0.55, '#8e8a80');
  g.addColorStop(1.0, '#3b3a36');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  var tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  var pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  var env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose(); tex.dispose();
  return env;
}
scene.environment = makeEnvMap();

var hemi = new THREE.HemisphereLight(0xdfe3e6, 0x59493a, 0.55);
scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff4e6, 2.0);
sun.position.set(9, 14, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
sun.shadow.camera.far = 50;
sun.shadow.bias = -0.0009;
scene.add(sun);
var rim = new THREE.DirectionalLight(0xa8b4c4, 0.16);
rim.position.set(-9, 5, -8);
scene.add(rim);

var ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color:C('#2c2b26'), roughness:0.97, metalness:0 })
);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);


// ============================================================================
//  PROCEDURAL TEXTURES — drawn greyscale so the material colour tints them,
//  keeping every colour picker functional while adding real surface detail.
// ============================================================================
var TEX = {};
var MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

function makeCanvas(w, h, draw) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;          // stone read at a grazing angle needs all of it
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// Each albedo above is drawn as a height field as well as a colour, so a Sobel
// pass turns it into a matching normal map. This is what makes a joint read as
// a recess instead of a printed line. Wraps at the edges so the normal map
// tiles exactly like the albedo it came from.
function normalFromHeight(tex, strength) {
  var src = tex.image, w = src.width, h = src.height;
  var d = src.getContext('2d').getImageData(0, 0, w, h).data;
  var out = document.createElement('canvas');
  out.width = w; out.height = h;
  var octx = out.getContext('2d');
  var img = octx.createImageData(w, h);
  function H(x, y) { return d[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255; }
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var dx = (H(x-1,y-1) + 2*H(x-1,y) + H(x-1,y+1)
              - H(x+1,y-1) - 2*H(x+1,y) - H(x+1,y+1)) * strength;
      var dy = (H(x-1,y+1) + 2*H(x,y+1) + H(x+1,y+1)
              - H(x-1,y-1) - 2*H(x,y-1) - H(x+1,y-1)) * strength;
      var len = Math.sqrt(dx*dx + dy*dy + 1);
      var i = (y * w + x) * 4;
      img.data[i]     = (dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1  / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  var t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;
  // a normal map carries vectors, not colour -- it must stay linear
  return t;
}

// ----------------------------------------------------------------------------
//  BoxGeometry gives every face UVs of 0..1 whatever its real size, so a 9-unit
//  platform tier and a 0.24-unit step tread would show the same number of
//  bricks: courses smear on the big faces, go chunky on the small ones, and
//  never line up between neighbouring parts. Rewriting the UVs in world units
//  gives one texel density across the whole building; each material's
//  map.repeat then means "tiles per world unit".
// ----------------------------------------------------------------------------
function worldScaleUVs(root) {
  root.traverse(function (o) {
    if (!o.isMesh) return;
    var geo = o.geometry, p = geo.parameters;
    if (!p || geo.userData.uvScaled) return;
    var uv = geo.attributes.uv;
    if (!uv) return;
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some(function (m) { return m && (m.map || m.normalMap); })) return;

    if (p.depth !== undefined && p.width !== undefined && uv.count === 24) {
      // BoxGeometry face order is +X -X +Y -Y +Z -Z, four verts each
      var f = [[p.depth, p.height], [p.depth, p.height],
               [p.width, p.depth],  [p.width, p.depth],
               [p.width, p.height], [p.width, p.height]];
      for (var i = 0; i < 6; i++) {
        for (var v = 0; v < 4; v++) {
          var k = i * 4 + v;
          uv.setXY(k, uv.getX(k) * f[i][0], uv.getY(k) * f[i][1]);
        }
      }
    } else if (p.radiusTop !== undefined) {
      // Cylinder u wraps the circumference: round it to whole tiles or the
      // grain tears open at the seam.
      var circ = Math.max(1, Math.round(Math.PI * (p.radiusTop + p.radiusBottom)));
      for (var q = 0; q < uv.count; q++)
        uv.setXY(q, uv.getX(q) * circ, uv.getY(q) * p.height);
    } else return;

    uv.needsUpdate = true;
    geo.userData.uvScaled = true;
  });
}

function initTextures() {
  // 筒瓦 barrel tiles: vertical half-round columns with row shadows
  TEX.tile = makeCanvas(512, 512, function(ctx, w, h) {
    var cols = 8, rows = 6, cw = w/cols, rh = h/rows;
    for (var x = 0; x < w; x++) {
      var ph = (x / cw) * Math.PI * 2;
      var shade = 178 + 77 * Math.pow(0.5 + 0.5*Math.cos(ph), 0.55);
      ctx.fillStyle = 'rgb(' + [shade,shade,shade].join(',') + ')';
      ctx.fillRect(x, 0, 1, h);
    }
    for (var r = 0; r < rows; r++) {
      // each course laps the one below: a hard shadow line, then a short ramp
      var y = r * rh;
      var lap = ctx.createLinearGradient(0, y, 0, y + rh*0.22);
      lap.addColorStop(0.0, 'rgba(30,30,30,0.55)');
      lap.addColorStop(1.0, 'rgba(30,30,30,0.0)');
      ctx.fillStyle = lap;
      ctx.fillRect(0, y, w, rh*0.22);
      // the rounded end of each barrel where it laps the course below: a soft
      // highlight on the crown, a crescent of shade under it
      for (var c2 = 0; c2 < cols; c2++) {
        var cx = c2*cw + cw/2, cy = y + rh*0.10, cr = cw*0.27;
        var dome = ctx.createRadialGradient(cx, cy - cr*0.35, cr*0.1, cx, cy, cr);
        dome.addColorStop(0.0, 'rgba(255,255,255,0.42)');
        dome.addColorStop(0.7, 'rgba(255,255,255,0.10)');
        dome.addColorStop(1.0, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = dome;
        ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(60,60,60,0.28)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, cr, 0.15*Math.PI, 0.85*Math.PI); ctx.stroke();
      }
    }
  });

  // wood grain: long vertical streaks with knots
  TEX.wood = makeCanvas(128, 512, function(ctx, w, h) {
    ctx.fillStyle = 'rgb(238,238,238)';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 60; i++) {
      var x = Math.random()*w, wd = 1 + Math.random()*2.5;
      var sh = 198 + Math.random()*46;
      ctx.strokeStyle = 'rgba(' + [sh,sh,sh].join(',') + ',0.55)';
      ctx.lineWidth = wd;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (Math.random()-0.5)*14, h*0.33,
                        x + (Math.random()-0.5)*14, h*0.66, x, h);
      ctx.stroke();
    }
  });

  // plaster: soft noise
  TEX.plaster = makeCanvas(256, 256, function(ctx, w, h) {
    ctx.fillStyle = 'rgb(242,242,242)';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 4200; i++) {
      var sh = 214 + Math.random()*40;
      ctx.fillStyle = 'rgba(' + [sh,sh,sh].join(',') + ',0.25)';
      ctx.fillRect(Math.random()*w, Math.random()*h, 1+Math.random()*2, 1+Math.random()*2);
    }
  });

  // 条石 dressed ashlar: solid blocks standing proud of a recessed joint, each
  // with a chamfered arris. Drawn as blocks rather than as lines on a flat
  // ground so normalFromHeight() has a real step to work from -- lines alone
  // give you painted-on joints that vanish under any light.
  TEX.stone = makeCanvas(512, 512, function(ctx, w, h) {
    var rows = 6, cols = 3, bh = h/rows, bw = w/cols, joint = 6;

    // block tones are indexed by column so the pair straddling the tile seam
    // gets one colour instead of two
    var tone = [];
    for (var r0 = 0; r0 < rows; r0++) {
      tone[r0] = [];
      for (var c0 = 0; c0 < cols; c0++) tone[r0][c0] = 222 + Math.random()*26;
    }

    ctx.fillStyle = 'rgb(132,132,132)';         // the recessed joint itself
    ctx.fillRect(0, 0, w, h);

    for (var r = 0; r < rows; r++) {
      var off = (r % 2) * bw/2;
      for (var b = -1; b <= cols; b++) {
        var x = off + b*bw, y = r*bh;
        var t = tone[r][((b % cols) + cols) % cols];
        var fx = x + joint/2, fy = y + joint/2, fw = bw - joint, fh = bh - joint;

        ctx.fillStyle = 'rgb(' + [t,t,t].join(',') + ')';
        ctx.fillRect(fx, fy, fw, fh);

        // 3 px chamfer: lit on the top and left arris, shaded on the other two
        ctx.fillStyle = 'rgba(255,255,255,0.50)';
        ctx.fillRect(fx, fy, fw, 3);
        ctx.fillRect(fx, fy, 3, fh);
        ctx.fillStyle = 'rgba(58,58,58,0.38)';
        ctx.fillRect(fx, fy + fh - 3, fw, 3);
        ctx.fillRect(fx + fw - 3, fy, 3, fh);

        // tooled face: fine chisel speckle
        for (var i = 0; i < 320; i++) {
          var sh = t - 14 + Math.random()*28;
          ctx.fillStyle = 'rgba(' + [sh,sh,sh].join(',') + ',0.30)';
          ctx.fillRect(fx + Math.random()*fw, fy + Math.random()*fh, 2, 2);
        }
      }
    }
  });

  TEX.tileN    = normalFromHeight(TEX.tile,    2.2);
  TEX.woodN    = normalFromHeight(TEX.wood,    1.2);
  TEX.plasterN = normalFromHeight(TEX.plaster, 1.0);
  TEX.stoneN   = normalFromHeight(TEX.stone,   3.0);
}

// Hex colours are sRGB. With outputEncoding = sRGB the renderer converts
// linear -> sRGB on output, so feeding sRGB in unconverted brightens everything
// twice -- deep red renders as salmon. Convert on the way in.
function C(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

function texClone(t, rx, ry) {
  var c = t.clone();
  c.needsUpdate = true;
  c.repeat.set(rx, ry);
  return c;
}

initTextures();

var buildingGroup = new THREE.Group();
scene.add(buildingGroup);

// ============================================================================
