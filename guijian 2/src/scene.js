
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1d22);
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
function makeCanvas(w, h, draw) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function initTextures() {
  // 筒瓦 barrel tiles: vertical half-round columns with row shadows
  TEX.tile = makeCanvas(256, 256, function(ctx, w, h) {
    var cols = 8, rows = 6;
    for (var x = 0; x < w; x++) {
      var ph = (x / (w/cols)) * Math.PI * 2;
      var shade = 196 + 59 * Math.pow(0.5 + 0.5*Math.cos(ph), 0.6);
      ctx.fillStyle = 'rgb(' + [shade,shade,shade].join(',') + ')';
      ctx.fillRect(x, 0, 1, h);
    }
    ctx.fillStyle = 'rgba(40,40,40,0.35)';
    for (var r = 0; r < rows; r++) {
      ctx.fillRect(0, r*(h/rows), w, 3);
      // 瓦当 tile-end discs on each row edge
      for (var c2 = 0; c2 < cols; c2++) {
        ctx.beginPath();
        ctx.arc(c2*(w/cols) + (w/cols)/2, r*(h/rows)+2, 4, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(230,230,230,0.5)';
        ctx.fill();
        ctx.fillStyle = 'rgba(40,40,40,0.35)';
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

  // stone blocks: courses with mortar lines
  TEX.stone = makeCanvas(256, 256, function(ctx, w, h) {
    ctx.fillStyle = 'rgb(240,240,240)';
    ctx.fillRect(0, 0, w, h);
    var rows = 4, bw = w/3;
    for (var r = 0; r < rows; r++) {
      var off = (r % 2) * bw/2;
      ctx.strokeStyle = 'rgba(90,90,90,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, r*(h/rows)); ctx.lineTo(w, r*(h/rows)); ctx.stroke();
      for (var b = -1; b < 4; b++) {
        ctx.beginPath();
        ctx.moveTo(off + b*bw, r*(h/rows)); ctx.lineTo(off + b*bw, (r+1)*(h/rows));
        ctx.stroke();
      }
      for (var i = 0; i < 90; i++) {
        var sh = 212 + Math.random()*40;
        ctx.fillStyle = 'rgba(' + [sh,sh,sh].join(',') + ',0.3)';
        ctx.fillRect(Math.random()*w, r*(h/rows)+2 + Math.random()*(h/rows-4), 2, 2);
      }
    }
  });
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
