/* =============================================================
   ambient.js — the two canvases.

   1. #ambient-canvas : the perpetual, very slow particle drift behind
      the whole page. This is what stops the site feeling dead when
      the visitor is not touching anything.
   2. #field-canvas   : the interactive graphic in section 05. A dot
      grid that is pushed around by the pointer and, when nobody is
      pointing at it, breathes on its own.

   Both of them:
     · cap the device pixel ratio at 2 (a 3x phone would otherwise draw
       2.25x the pixels for no visible gain)
     · scale their detail to the viewport, so a phone draws far less
     · stop completely when scrolled out of view or the tab is hidden
     · never start at all under prefers-reduced-motion
   ============================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  function motionOn() { return root.dataset.motion === 'on' && !reduced.matches; }

  function fit(canvas) {
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * DPR));
    canvas.height = Math.max(1, Math.round(r.height * DPR));
    return { w: r.width, h: r.height };
  }

  /* ===============================================================
     1. AMBIENT DRIFT
     =============================================================== */
  (function ambient() {
    var canvas = document.getElementById('ambient-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d', { alpha: true });
    var size = fit(canvas);
    var dots = [];
    var raf = null;
    var hidden = false;

    var TINTS = ['255,74,28', '255,180,87', '232,227,216', '111,227,189'];

    function build() {
      size = fit(canvas);
      // density scales with area, and is deliberately low on phones
      var target = Math.round((size.w * size.h) / 19000);
      target = Math.max(18, Math.min(target, size.w < 700 ? 34 : 78));
      dots = [];
      for (var i = 0; i < target; i++) {
        dots.push({
          x: Math.random() * size.w,
          y: Math.random() * size.h,
          r: 0.5 + Math.random() * 1.9,
          vx: (Math.random() - 0.5) * 0.09,
          vy: -0.045 - Math.random() * 0.13,
          a: 0.1 + Math.random() * 0.4,
          tint: TINTS[(Math.random() * TINTS.length) | 0],
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    function draw(t) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x += d.vx; d.y += d.vy;
        if (d.y < -8) { d.y = size.h + 8; d.x = Math.random() * size.w; }
        if (d.x < -8) d.x = size.w + 8;
        if (d.x > size.w + 8) d.x = -8;
        // a slow shimmer so no two particles pulse together
        var a = d.a * (0.62 + 0.38 * Math.sin(t / 1800 + d.phase));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, 6.2832);
        ctx.fillStyle = 'rgba(' + d.tint + ',' + a.toFixed(3) + ')';
        ctx.fill();
      }
    }

    function loop(t) {
      if (!motionOn() || hidden) { raf = null; return; }
      draw(t);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (raf || !motionOn()) return;
      raf = requestAnimationFrame(loop);
    }

    build();
    if (reduced.matches) { draw(0); return; }   // one static frame, then nothing
    start();

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { build(); if (!raf) draw(0); }, 160);
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      hidden = document.hidden;
      if (!hidden) start();
    });

    // the header switch reaches the canvas too
    new MutationObserver(function () {
      if (motionOn()) start(); else if (raf) { cancelAnimationFrame(raf); raf = null; ctx.setTransform(DPR,0,0,DPR,0,0); ctx.clearRect(0, 0, size.w, size.h); }
    }).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  })();

  /* ===============================================================
     2. CURSOR-REACTIVE FIELD
     =============================================================== */
  (function field() {
    var canvas = document.getElementById('field-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d', { alpha: true });
    var size = fit(canvas);
    var pts = [];
    var gap = 0;
    var mouse = { x: -9999, y: -9999, on: false };
    var raf = null, visible = false, hidden = false;

    function build() {
      size = fit(canvas);
      gap = size.w < 620 ? 26 : 34;
      var cols = Math.ceil(size.w / gap) + 1;
      var rows = Math.ceil(size.h / gap) + 1;
      pts = [];
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          pts.push({ ox: x * gap, oy: y * gap, x: x * gap, y: y * gap, vx: 0, vy: 0, d: 0 });
        }
      }
    }

    function draw(t) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      var reach = Math.min(size.w, size.h) * 0.42;
      var idle = !mouse.on;

      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var tx = p.ox, ty = p.oy;

        if (idle) {
          // nobody is pointing at it — a slow diagonal swell keeps it alive
          var w = Math.sin((p.ox + p.oy) * 0.012 + t / 1400);
          tx = p.ox + w * 4.5;
          ty = p.oy + Math.cos((p.ox - p.oy) * 0.011 + t / 1700) * 4.5;
          p.d = (w + 1) / 2 * 0.45;
        } else {
          var dx = p.ox - mouse.x, dy = p.oy - mouse.y;
          var dist = Math.hypot(dx, dy);
          if (dist < reach) {
            var force = Math.pow(1 - dist / reach, 2.2);
            var ang = Math.atan2(dy, dx);
            tx = p.ox + Math.cos(ang) * force * 46;
            ty = p.oy + Math.sin(ang) * force * 46;
            p.d = force;
          } else {
            p.d += (0 - p.d) * 0.1;
          }
        }

        // critically-damped-ish spring back to the grid position
        p.vx = (p.vx + (tx - p.x) * 0.13) * 0.78;
        p.vy = (p.vy + (ty - p.y) * 0.13) * 0.78;
        p.x += p.vx; p.y += p.vy;

        var r = 1.1 + p.d * 3.1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 6.2832);
        ctx.fillStyle = p.d > 0.12
          ? 'rgba(255,74,28,' + (0.35 + p.d * 0.62).toFixed(3) + ')'
          : 'rgba(23,20,15,0.30)';
        ctx.fill();
      }
    }

    function loop(t) {
      if (!motionOn() || !visible || hidden) { raf = null; return; }
      draw(t);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && motionOn() && visible && !hidden) raf = requestAnimationFrame(loop); }

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.on = true;
    }
    canvas.addEventListener('pointermove', pos, { passive: true });
    canvas.addEventListener('pointerdown', pos, { passive: true });
    canvas.addEventListener('pointerleave', function () { mouse.on = false; });
    canvas.addEventListener('pointercancel', function () { mouse.on = false; });

    build();
    if (reduced.matches) { draw(0); return; }

    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      if (visible) start();
    }, { threshold: 0.05 }).observe(canvas);

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { build(); if (!raf) draw(0); }, 160);
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      hidden = document.hidden; if (!hidden) start();
    });

    new MutationObserver(function () {
      if (motionOn()) start();
      else if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (!motionOn()) { // leave the grid drawn, just still
        for (var i = 0; i < pts.length; i++) { pts[i].x = pts[i].ox; pts[i].y = pts[i].oy; pts[i].d = 0; pts[i].vx = pts[i].vy = 0; }
        mouse.on = false;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, size.w, size.h);
        ctx.fillStyle = 'rgba(23,20,15,0.30)';
        for (var j = 0; j < pts.length; j++) { ctx.beginPath(); ctx.arc(pts[j].ox, pts[j].oy, 1.1, 0, 6.2832); ctx.fill(); }
      }
    }).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  })();
})();
