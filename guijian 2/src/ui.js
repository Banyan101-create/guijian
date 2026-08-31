/* ============================================================================
   古建生成器 · control-surface layer
   ---------------------------------------------------------------------------
   Every control in index.html is still a plain <select> or <input>, and stays
   the single source of truth: app.js reads .value, applyPreset() writes .value,
   and save/load round-trips .value. This file hides those natives and draws a
   richer control over each one, writing back to the native element and firing
   the same 'input'/'change' events app.js already listens for.

   Loaded AFTER app.js on purpose. Listener order is registration order, so on
   every event app.js rebuilds first and this file re-reads the settled state
   (including the 生起 "Qing: n/a" case, which app.js decides).
   ============================================================================ */
(function () {
  'use strict';

  var $  = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  function fire(el) {
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // "歇山顶 hip-and-gable" -> ["歇山顶", "hip-and-gable"]; parenthetical dropped
  function splitLabel(text) {
    var parts = text.trim().split(/\s+/);
    return [parts[0] || '', (parts[1] || '').replace(/[()]/g, '')];
  }

  var syncers = [];   // run after every change, in registration order

  /* ------------------------------------------------------------ segmented */
  $$('[data-ctl="seg"]').forEach(function (row) {
    var sel = row.querySelector('select');
    if (!sel) return;

    var seg = document.createElement('div');
    seg.className = 'seg';
    var ind = document.createElement('span');
    ind.className = 'seg-ind';
    seg.appendChild(ind);

    var btns = Array.prototype.map.call(sel.options, function (opt) {
      var p = splitLabel(opt.textContent);
      var b = document.createElement('button');
      b.type = 'button';
      b.title = opt.textContent;
      b.innerHTML = '<em></em><i></i>';
      b.firstChild.textContent = p[0];
      b.lastChild.textContent  = p[1];
      b.addEventListener('click', function () {
        if (sel.value === opt.value) return;
        sel.value = opt.value;
        fire(sel);
      });
      seg.appendChild(b);
      return b;
    });

    sel.parentNode.appendChild(seg);
    sel.classList.add('native-hidden');

    syncers.push(function () {
      var i = Math.max(0, sel.selectedIndex);
      btns.forEach(function (b, k) {
        b.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
      // a hidden row (.pg while in hall mode, or a collapsed group) measures 0;
      // leave the indicator where it is until it can be measured for real
      var w = btns[i].offsetWidth;
      if (!w) return;
      ind.style.width = w + 'px';
      ind.style.transform = 'translateX(' + (btns[i].offsetLeft - 3) + 'px)';
    });
  });

  /* -------------------------------------------------------------- sliders */
  $$('[data-ctl="slider"]').forEach(function (row) {
    var input = row.querySelector('input[type=range]');
    if (!input) return;

    var box = document.createElement('div');
    box.className = 'slider';
    input.parentNode.insertBefore(box, input);
    box.appendChild(input);

    var min = +input.min, max = +input.max, step = +input.step || 1;
    var steps = Math.round((max - min) / step) + 1;
    var ticks = null;
    if (steps > 1 && steps <= 12) {
      ticks = document.createElement('div');
      ticks.className = 'ticks';
      for (var i = 0; i < steps; i++) ticks.appendChild(document.createElement('i'));
      box.appendChild(ticks);
    }

    syncers.push(function () {
      var v = +input.value;
      var f = max > min ? (v - min) / (max - min) : 0;
      input.style.setProperty('--fill', (f * 100).toFixed(2) + '%');
      if (ticks) {
        var on = Math.round((v - min) / step);
        for (var k = 0; k < ticks.children.length; k++)
          ticks.children[k].classList.toggle('on', k <= on);
      }
    });
  });

  /* ------------------------------------------------------------- switches */
  $$('[data-ctl="switch"]').forEach(function (row) {
    var input = row.querySelector('input[type=range]');
    if (!input) return;

    var out = row.querySelector('.row-val');
    var sw  = document.createElement('button');
    sw.type = 'button';
    sw.className = 'switch';
    sw.setAttribute('role', 'switch');
    sw.title = row.querySelector('.row-label').textContent.trim();
    sw.addEventListener('click', function () {
      if (row.classList.contains('is-na')) return;
      input.value = (+input.value > 0.5) ? '0' : '1';
      fire(input);
    });

    row.appendChild(sw);
    input.classList.add('native-hidden');

    syncers.push(function () {
      // app.js writes "Qing: n/a" into 生起's readout when the period rules it
      // out -- the rule is not applied then, so the switch must not read as on
      var na = !!out && out.textContent.indexOf('n/a') >= 0;
      sw.setAttribute('aria-checked', (!na && +input.value > 0.5) ? 'true' : 'false');
      row.classList.toggle('is-na', na);
      sw.setAttribute('aria-disabled', na ? 'true' : 'false');
    });
  });

  /* ------------------------------------------------------- preset gallery */
  (function () {
    var sel = $('preset');
    if (!sel) return;
    var P = (typeof PRESETS !== 'undefined') ? PRESETS : {};

    var grid = document.createElement('div');
    grid.className = 'presets';

    var cards = Array.prototype.map.call(sel.options, function (opt) {
      var p = P[opt.value] || {};
      var name = splitLabel(opt.textContent.split('·')[0]);
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'preset';
      card.title = opt.textContent;

      var strip = document.createElement('span');
      strip.className = 'strip';
      ['roof', 'wall', 'wood', 'trim'].forEach(function (k) {
        var chip = document.createElement('i');
        chip.style.background = p[k] || '#3a3a3f';
        strip.appendChild(chip);
      });

      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.innerHTML = '<em></em><i></i>';
      nm.firstChild.textContent = name[0];
      nm.lastChild.textContent  = name[1];

      card.appendChild(strip);
      card.appendChild(nm);
      card.addEventListener('click', function () {
        sel.value = opt.value;
        fire(sel);   // app.js's change handler runs applyPreset() + rebuild()
      });
      grid.appendChild(card);
      return card;
    });

    sel.parentNode.appendChild(grid);
    sel.classList.add('native-hidden');

    syncers.push(function () {
      cards.forEach(function (c, k) {
        c.setAttribute('aria-selected', k === sel.selectedIndex ? 'true' : 'false');
      });
    });
  })();

  /* ------------------------------------------------------ colour swatches */
  $$('.sw').forEach(function (sw) {
    var input = sw.querySelector('input[type=color]');
    var face  = sw.querySelector('.sw-face');
    if (!input || !face) return;
    syncers.push(function () {
      face.style.background = input.value;
      sw.title = sw.title.split(' — ')[0] + ' — ' + input.value.toUpperCase();
    });
  });

  /* ------------------------------------------------- 坡面 curve editor */
  // The graph is only a renderer/editor for five hidden range inputs, so save,
  // load and the derived readouts all keep working with no special cases. The
  // handle positions ARE the drawn curve, and the same numbers become
  // ROOF_CURVE, so what is on the graph is what gets built.
  (function () {
    var svg = $('curveEditor');
    if (!svg) return;

    var IN = { tiaoX: $('cTiaoX'), tiaoY: $('cTiaoY'),
               aoX: $('cAoX'), aoY: $('cAoY'), gaoY: $('cGaoY') };
    var DEFAULTS = { tiaoX: 15, tiaoY: 12, aoX: 58, aoY: 36, gaoY: 70 };

    // plot box inside the 300x276 viewBox -- near square, so the 举架 curve
    // reads as a curve rather than a shallow ramp
    var L = 30, R = 276, T = 24, B = 240;
    var W = R - L, H = B - T;
    var px = function (gx) { return L + gx * W; };
    var py = function (gy) { return B - gy * H; };

    var g = function (k) { return (+IN[k].value) / 100; };

    // --- the curve, in graph space -----------------------------------------
    // 凹 sits ON the curve at t = 0.5, so a quadratic Bezier through it needs
    // control = 2*mid - (start + end)/2.
    function geom() {
      var x0 = g('tiaoX'), y0 = g('tiaoY');
      var mx = g('aoX'),   my = g('aoY');
      var x1 = 1,          y1 = g('gaoY');
      var ctrlX = 2 * mx - (x0 + x1) / 2;
      var ctrlY = 2 * my - (y0 + y1) / 2;
      // normalise into the unit eave->ridge square that solveRoofProfile wants
      var spanX = Math.max(0.05, x1 - x0);
      var spanY = Math.max(0.08, y1 - y0);
      return {
        x0: x0, y0: y0, x1: x1, y1: y1, mx: mx, my: my,
        ctrlX: ctrlX, ctrlY: ctrlY,
        cx: (ctrlX - x0) / spanX,
        cy: (ctrlY - y0) / spanY
      };
    }

    // Keep the handle inside the region where the derived control point stays
    // in solveRoofProfile's monotonic range, so the drawn curve and the built
    // roof can never disagree -- clamping one but not the other is what would
    // make the graph lie.
    function clampAo(mx, my, x0, y0, y1) {
      var spanX = Math.max(0.05, 1 - x0), spanY = Math.max(0.08, y1 - y0);
      // cx in [0.05,0.95]  =>  ctrlX in [x0+0.05*spanX, x0+0.95*spanX]
      var loX = (x0 + 0.05 * spanX + (x0 + 1) / 2) / 2;
      var hiX = (x0 + 0.95 * spanX + (x0 + 1) / 2) / 2;
      var loY = (y0 + 0.00 * spanY + (y0 + y1) / 2) / 2;
      var hiY = (y0 + 0.95 * spanY + (y0 + y1) / 2) / 2;
      return { mx: Math.min(hiX, Math.max(loX, mx)),
               my: Math.min(hiY, Math.max(loY, my)) };
    }

    // --- multipliers handed to the geometry --------------------------------
    function multipliers(q) {
      return {
        // dragging 挑 right shortens the eave, left deepens it
        eave: 1.6 - (q.x0 / 0.28) * 1.12,
        // dragging 挑 up lifts the corners
        lift: (q.y0 / 0.30) * 2.5,
        // 高 is the total 举高
        rise: 0.55 + ((q.y1 - 0.25) / 0.75) * 0.75
      };
    }

    // --- grid ---------------------------------------------------------------
    (function grid() {
      var frag = '';
      for (var i = 0; i <= 8; i++) {
        var x = L + (i / 8) * W;
        frag += '<line class="' + (i % 4 ? '' : 'major') + '" x1="' + x.toFixed(1) +
                '" y1="' + T + '" x2="' + x.toFixed(1) + '" y2="' + B + '"/>';
      }
      for (var j = 0; j <= 8; j++) {
        var y = T + (j / 8) * H;
        frag += '<line class="' + (j % 4 ? '' : 'major') + '" x1="' + L +
                '" y1="' + y.toFixed(1) + '" x2="' + R + '" y2="' + y.toFixed(1) + '"/>';
      }
      $('cvGrid').innerHTML = frag;
    })();

    // build the readout once; render() then only writes numbers into it
    var cells = (function () {
      var rows = [['出檐 eave', 'eave'], ['起翘 lift', 'lift'],
                  ['举高 rise', 'rise'], ['凹率 curve', 'cy']];
      $('cvRead').innerHTML = rows.map(function (r) {
        return '<div class="d"><span>' + r[0] + '</span><b data-k="' + r[1] + '"></b></div>';
      }).join('');
      var map = {};
      $$('#cvRead b').forEach(function (b) { map[b.getAttribute('data-k')] = b; });
      return map;
    })();

    function curvePath(x0, y0, cxg, cyg, x1, y1) {
      return 'M' + px(x0).toFixed(1) + ' ' + py(y0).toFixed(1) +
             ' Q' + px(cxg).toFixed(1) + ' ' + py(cyg).toFixed(1) +
             ' ' + px(x1).toFixed(1) + ' ' + py(y1).toFixed(1);
    }

    // the 则例 curve, drawn once as a dashed ghost to measure deviation against
    (function referenceCurve() {
      var d = DEFAULTS, x0 = d.tiaoX / 100, y0 = d.tiaoY / 100, y1 = d.gaoY / 100;
      var ctrlX = 2 * (d.aoX / 100) - (x0 + 1) / 2;
      var ctrlY = 2 * (d.aoY / 100) - (y0 + y1) / 2;
      $('cvRef').setAttribute('d', curvePath(x0, y0, ctrlX, ctrlY, 1, y1));
    })();

    function render() {
      var q = geom();
      var sx = px(q.x0), sy = py(q.y0);
      var ex = px(q.x1), ey = py(q.y1);
      // draw from ROOF_CURVE, not from q: those are the numbers the roof was
      // actually built with, so the graph cannot show a shape the model isn't
      var spanX = Math.max(0.05, q.x1 - q.x0), spanY = Math.max(0.08, q.y1 - q.y0);
      var cxp = px(q.x0 + ROOF_CURVE.cx * spanX);
      var cyp = py(q.y0 + ROOF_CURVE.cy * spanY);
      var d = 'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) +
              ' Q' + cxp.toFixed(1) + ' ' + cyp.toFixed(1) +
              ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1);
      $('cvLine').setAttribute('d', d);
      $('cvArea').setAttribute('d', d + ' L' + ex.toFixed(1) + ' ' + py(q.y0).toFixed(1) + ' Z');
      $('cvBase').setAttribute('d',
        'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' H' + ex.toFixed(1) +
        ' M' + ex.toFixed(1) + ' ' + sy.toFixed(1) + ' V' + ey.toFixed(1));

      function place(circ, label, gx, gy, dy) {
        var cx = px(gx).toFixed(1), cy = py(gy).toFixed(1);
        $(circ).setAttribute('cx', cx);
        $(circ).setAttribute('cy', cy);
        var hit = $(circ).parentNode.querySelector('.cv-hit');
        if (hit) { hit.setAttribute('cx', cx); hit.setAttribute('cy', cy); }
        $(label).setAttribute('x', cx);
        $(label).setAttribute('y', (py(gy) + dy).toFixed(1));
      }
      place('cvTiao', 'cvTiaoT', q.x0, q.y0, -15);
      // the Bezier's own midpoint, so the dot always sits on the drawn line
      place('cvAo', 'cvAoT',
            0.25 * q.x0 + 0.5 * (q.x0 + ROOF_CURVE.cx * spanX) + 0.25 * q.x1,
            0.25 * q.y0 + 0.5 * (q.y0 + ROOF_CURVE.cy * spanY) + 0.25 * q.y1, -14);
      place('cvGao', 'cvGaoT', q.x1, q.y1, -15);

      var m = multipliers(q);
      function put(k, v, base) {
        cells[k].textContent = v;
        cells[k].classList.toggle('off', Math.abs(parseFloat(v) - base) > 0.005);
      }
      put('eave', m.eave.toFixed(2) + '×', 1);
      put('lift', m.lift.toFixed(2) + '×', 1);
      put('rise', m.rise.toFixed(2) + '×', 1);
      put('cy',   ROOF_CURVE.cy.toFixed(2), 0.33);
    }

    // Pull the stored handles back into the region where the derived control
    // point is inside solveRoofProfile's monotonic range. move() already clamps
    // while dragging, but 读取 load and any direct assignment do not go through
    // it -- without this the graph would draw a curve the roof cannot build.
    function normalise() {
      var x0 = g('tiaoX'), y0 = g('tiaoY');
      set('gaoY', Math.max(g('gaoY'), y0 + 0.12));
      var c = clampAo(g('aoX'), g('aoY'), x0, y0, g('gaoY'));
      set('aoX', c.mx);
      set('aoY', c.my);
    }

    // push the handle state into the geometry
    function apply() {
      normalise();
      var q = geom(), m = multipliers(q);
      ROOF_CURVE.cx = Math.min(0.95, Math.max(0.05, q.cx));
      ROOF_CURVE.cy = Math.min(0.95, Math.max(0.00, q.cy));
      ROOF_CURVE.eave = m.eave;
      ROOF_CURVE.lift = m.lift;
      ROOF_CURVE.rise = m.rise;
    }

    // Writing through the inputs keeps one source of truth. Integer steps also
    // throttle the rebuild: a drag across the box is at most ~100 of them.
    function set(k, v) {
      var el = IN[k];
      var n = Math.round(Math.min(+el.max, Math.max(+el.min, v * 100)));
      if (n === +el.value) return false;
      el.value = n;
      return true;
    }

    // Dragging used to fire a full rebuild per integer step -- 52k triangles for
    // a hall, 178k for a tall pagoda, which is what made the handles feel like
    // treacle. The graph is cheap, so redraw it synchronously for instant
    // feedback and let the geometry catch up at most once a frame. If a rebuild
    // costs more than a frame, wait out its own cost before the next one so the
    // pointer keeps getting serviced.
    var rafId = 0, lastCost = 0, lastRun = 0;

    function scheduleRebuild() {
      if (rafId) return;
      rafId = requestAnimationFrame(function () {
        rafId = 0;
        var now = performance.now();
        if (lastCost > 16 && now - lastRun < lastCost) { scheduleRebuild(); return; }
        var t0 = performance.now();
        rebuild();
        lastCost = performance.now() - t0;
        lastRun = performance.now();
      });
    }

    function flushRebuild() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      rebuild();                       // land on the exact final state
    }

    function commit(changed) {
      if (!changed) return;
      apply();                         // graph first: instant, and cheap
      render();
      scheduleRebuild();
    }

    // --- dragging ------------------------------------------------------------
    function local(evt) {
      var m = svg.getScreenCTM();
      if (!m) return null;
      var pt = svg.createSVGPoint();
      pt.x = evt.clientX; pt.y = evt.clientY;
      var p = pt.matrixTransform(m.inverse());
      return { gx: (p.x - L) / W, gy: (B - p.y) / H };
    }

    function move(which, gx, gy) {
      var q = geom(), changed = false;
      if (which === 'tiao') {
        // stay left of 凹 and below 高 so the curve cannot invert
        var x0 = Math.min(0.28, Math.max(0, Math.min(gx, q.mx - 0.06)));
        var y0 = Math.min(0.30, Math.max(0, Math.min(gy, q.y1 - 0.12)));
        changed = set('tiaoX', x0) | set('tiaoY', y0);
        // 凹 may now sit outside the valid region for the new endpoints
        var c = clampAo(g('aoX'), g('aoY'), x0, y0, q.y1);
        changed = changed | set('aoX', c.mx) | set('aoY', c.my);
      } else if (which === 'ao') {
        var c2 = clampAo(gx, gy, q.x0, q.y0, q.y1);
        changed = set('aoX', c2.mx) | set('aoY', c2.my);
      } else {
        var y1 = Math.min(1, Math.max(0.25, Math.max(gy, q.y0 + 0.12)));
        changed = set('gaoY', y1);
        var c3 = clampAo(g('aoX'), g('aoY'), q.x0, q.y0, y1);
        changed = changed | set('aoX', c3.mx) | set('aoY', c3.my);
      }
      commit(!!changed);
    }

    var dragging = null;
    $$('.cv-h', svg).forEach(function (h) {
      var which = h.getAttribute('data-h');

      h.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        dragging = which;
        h.classList.add('is-drag');
        // capture on the handle so the pointer can leave it mid-drag
        if (h.setPointerCapture) { try { h.setPointerCapture(e.pointerId); } catch (err) {} }
      });
      h.addEventListener('pointermove', function (e) {
        if (dragging !== which) return;
        var p = local(e);
        if (p) move(which, p.gx, p.gy);
      });
      function end(e) {
        if (dragging !== which) return;
        dragging = null;
        h.classList.remove('is-drag');
        if (h.releasePointerCapture) { try { h.releasePointerCapture(e.pointerId); } catch (err) {} }
        flushRebuild();
      }
      h.addEventListener('pointerup', end);
      h.addEventListener('pointercancel', end);

      h.addEventListener('keydown', function (e) {
        var step = e.shiftKey ? 0.05 : 0.01, dx = 0, dy = 0;
        if (e.key === 'ArrowLeft')       dx = -step;
        else if (e.key === 'ArrowRight') dx =  step;
        else if (e.key === 'ArrowUp')    dy =  step;
        else if (e.key === 'ArrowDown')  dy = -step;
        else return;
        e.preventDefault();
        var q = geom();
        var at = which === 'tiao' ? [q.x0, q.y0] : which === 'ao' ? [q.mx, q.my] : [q.x1, q.y1];
        move(which, at[0] + dx, at[1] + dy);
      });
      h.addEventListener('keyup', function () { flushRebuild(); });
    });

    $('cvReset').addEventListener('click', function () {
      var changed = false;
      Object.keys(DEFAULTS).forEach(function (k) {
        if (+IN[k].value !== DEFAULTS[k]) { IN[k].value = DEFAULTS[k]; changed = true; }
      });
      if (changed) flushRebuild();
    });

    // 读取 load assigns the five inputs directly and never fires an event, so
    // the curve is re-derived before every build and redrawn after it
    REBUILD_PRE.push(apply);
    syncers.push(render);

    apply();
    render();
  })();

  /* ------------------------------------------------------------- daylight */
  // These three drive the scene directly. They deliberately do NOT go through
  // rebuild(): relighting must not regenerate 50k triangles per slider pixel.
  (function () {
    var day = $('daylight'), sh = $('shadows'), gd = $('groundOn');
    if (!day) return;

    // 05:00 to 19:00 across the slider, named by the traditional double-hours
    // real 时辰 boundaries: 卯 5-7, 辰 7-9, 巳 9-11, 午 11-13, 未 13-15, 申 15-17, 酉 17-19
    var SHICHEN = [
      [7,  '卯时 dawn'],      [9,  '辰时 morning'],  [11, '巳时 forenoon'],
      [13, '午时 noon'],      [15, '未时 afternoon'], [17, '申时 late day'],
      [99, '酉时 dusk']
    ];
    function label(t) {
      var h = 5 + t * 14;
      var name = SHICHEN[SHICHEN.length - 1][1];
      for (var i = 0; i < SHICHEN.length; i++)
        if (h < SHICHEN[i][0]) { name = SHICHEN[i][1]; break; }
      var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
      if (mm === 60) { hh++; mm = 0; }
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ' ' + name;
    }

    syncers.push(function () {
      var t = (+day.value) / 100;
      applyDaylight(t);
      sun.castShadow = (+sh.value) > 0.5;
      ground.visible = (+gd.value) > 0.5;
      $('dayOut').textContent = label(t);
      $('shOut').textContent = sun.castShadow ? 'on' : 'off';
      $('gdOut').textContent = ground.visible ? 'on' : 'off';
    });

    [day, sh, gd].forEach(function (el) {
      el.addEventListener('input', sync);
    });
  })();

  /* --------------------------------------------------------- view toolbar */
  (function () {
    var bar = $('viewbar');
    if (!bar) return;
    var VIEWS = { front: [0, 8], side: [90, 8], iso: [42, 20], top: [42, 74] };

    $$('button[data-view]', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = VIEWS[b.getAttribute('data-view')];
        controls.autoRotate = false;
        spin.setAttribute('aria-pressed', 'false');
        viewPreset(v[0], v[1], 700);
      });
    });

    $('fitBtn').addEventListener('click', function () { frameModel(600); });

    // switching 大殿 <-> 高塔 changes the model's size by a lot; a hall left at a
    // 13-storey pagoda's zoom is a speck, so re-frame on that change only --
    // never on an ordinary edit, which would fight the user's own zoom.
    var lastType = $('buildingType').value;
    syncers.push(function () {
      var now = $('buildingType').value;
      if (now === lastType) return;
      lastType = now;
      frameModel(700);
    });

    var spin = $('spinBtn');
    controls.autoRotateSpeed = 0.9;
    spin.addEventListener('click', function () {
      var on = spin.getAttribute('aria-pressed') !== 'true';
      controls.autoRotate = on;
      spin.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  })();

  /* ------------------------------------------------------------ 随机 random */
  (function () {
    var btn = $('randBtn');
    if (!btn) return;

    function pickRange(id, lo, hi) {
      var el = $(id), step = +el.step || 1;
      var min = lo === undefined ? +el.min : lo;
      var max = hi === undefined ? +el.max : hi;
      var n = Math.floor((max - min) / step) + 1;
      el.value = min + Math.floor(Math.random() * n) * step;
    }
    function pickOption(id) {
      var el = $(id);
      el.selectedIndex = Math.floor(Math.random() * el.options.length);
    }
    function pickSwitch(id, onChance) {
      $(id).value = Math.random() < onChance ? '1' : '0';
    }

    btn.addEventListener('click', function () {
      // 建筑类型 is left alone -- it is what the entry screen asked for, and the
      // 形制 tab is right there. Ranges are trimmed to the ones that look like a
      // building: 0 tile ribs and a bare frame are legal but not worth rolling.
      ['pagodaStyle', 'classType', 'period', 'roofType'].forEach(pickOption);
      pickRange('storeys'); pickRange('sides');
      pickRange('doukou', 3, 9);
      pickRange('bays'); pickRange('purlins');
      pickRange('tiles', 16, 40);
      pickSwitch('tuishan', 0.8); pickSwitch('shengqi', 0.6);
      pickSwitch('cejiao', 0.8);  pickSwitch('railing', 0.75);
      pickSwitch('caihua', 0.85);
      pickOption('preset');
      applyPreset();
      rebuild();
    });
  })();

  /* --------------------------------------------- hall-only / pagoda-only */
  // buildPagoda() is reached before rebuild() ever reads 屋顶式样, 推山 or the
  // four 做法细则 rules, so those controls do nothing for a 高塔 -- hide them
  // rather than leave dead switches on screen.
  (function () {
    var hall   = $$('.hall-only');
    var pagoda = $$('.pagoda-only');
    syncers.push(function () {
      var isPagoda = $('buildingType').value === 'pagoda';
      hall.forEach(function (el)   { el.classList.toggle('is-off', isPagoda); });
      pagoda.forEach(function (el) { el.style.display = isPagoda ? 'block' : 'none'; });
    });
  })();

  /* ------------------------------------------------- current-model summary */
  (function () {
    var box = $('model');
    if (!box) return;
    // the leading Chinese token of the selected option, e.g. "大殿 hall" -> 大殿
    function cn(id) {
      var s = $(id);
      return s.options[s.selectedIndex].textContent.trim().split(/\s+/)[0];
    }
    syncers.push(function () {
      var pagoda = $('buildingType').value === 'pagoda';
      var rows = [
        ['三角面', $('stats').textContent.split(' ')[0] || '—'],
        ['类型',   cn('buildingType')],
        ['做法',   cn('classType')],
        ['年代',   cn('period')],
        [pagoda ? '塔式' : '屋顶', pagoda ? cn('pagodaStyle') : cn('roofType')],
        ['斗口',   $('dkOut').textContent]
      ];
      box.innerHTML = rows.map(function (r) {
        return '<div class="d"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
      }).join('');
    });
  })();

  /* --------------------------------------------------------- tab console */
  (function () {
    var tabs  = $$('.rail-tab');
    var panes = $$('.pane');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-tab');
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panes.forEach(function (p) {
          p.classList.toggle('is-active', p.getAttribute('data-pane') === name);
        });
        // segmented indicators in a hidden pane measure 0 and skip their sync
        sync();
      });
    });
  })();

  /* --------------------------------------------------- header spec strip */
  // app.js tags each derived figure with data-k; mirror the headline ones up
  // into the panel header so they read without opening the 数据 tab.
  (function () {
    var w = $('specW'), h = $('specH'), t = $('specT');
    var derived = $('derived'), stats = $('stats');
    if (!w) return;
    syncers.push(function () {
      var cw = derived.querySelector('[data-k="width"] b');
      var ch = derived.querySelector('[data-k="colH"] b');
      if (cw) w.textContent = cw.textContent;
      if (ch) h.textContent = ch.textContent;
      // "52,404 tris · 1771 meshes" -> "52,404"
      t.textContent = (stats.textContent.split(' ')[0]) || '—';
    });
  })();

  /* --------------------------------------------------------- mobile drawer */
  (function () {
    var btn = $('panelToggle'), panel = $('panel');
    if (!btn || !panel) return;
    var narrow = window.matchMedia('(max-width: 720px)');
    function fit() { panel.classList.toggle('is-closed', narrow.matches); }
    btn.addEventListener('click', function () {
      panel.classList.toggle('is-closed');
      setTimeout(sync, 300);
    });
    (narrow.addEventListener ? narrow.addEventListener.bind(narrow, 'change')
                             : narrow.addListener.bind(narrow))(fit);
    fit();
  })();

  /* ------------------------------------------------------------- wiring up */
  function sync() { for (var i = 0; i < syncers.length; i++) syncers[i](); }

  // rebuild() calls every hook on its way out, so this covers all of it: direct
  // control changes, 预设 presets (which rewrite the colour inputs), and 读取
  // load (which assigns .value without firing a single event).
  REBUILD_HOOKS.push(sync);

  window.addEventListener('resize', sync);

  sync();
  // fonts land after first paint and change button widths under the indicator
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);

  /* --------------------------------------------------------------- the gate */
  // Full-screen choice before the app is revealed. The scene is already built
  // by the time this file runs, so entering is just: set the type, let
  // rebuild() run if it actually changed, and uncover the canvas.
  (function () {
    var gate = $('gate');
    if (!gate) return;
    var sel = $('buildingType');
    var done = false;

    function enter(type) {
      if (done) return;
      done = true;
      if (sel.value !== type) { sel.value = type; fire(sel); }
      document.body.classList.add('entered');
      gate.classList.add('gone');
      introFlight();
      // sync() once the panel is uncovered: a segmented indicator can only be
      // measured for real when nothing is covering the pane it sits in
      setTimeout(function () { gate.remove(); sync(); }, 600);
    }

    $$('.gate-card', gate).forEach(function (card) {
      card.addEventListener('click', function () {
        enter(card.getAttribute('data-choose'));
      });
    });

    document.addEventListener('keydown', function (e) {
      if (done) return;
      if (e.key === '1') enter('hall');
      else if (e.key === '2') enter('pagoda');
    });
  })();

})();
