/* =============================================================
   motion.js — the whole animation layer, ~10 KB, no dependencies.

   HOW TO USE IT (this is the entire API — it is all data attributes):

     data-reveal="rise|left|right|scale|mask"  animate in on scroll
     data-delay="0.15"                         extra delay, seconds
     data-stagger="90"                         on a PARENT: ms between children
     data-parallax="0.25"                      scroll speed multiplier
     data-tilt  [data-tilt-max="9"]            lean toward the pointer
     data-magnet [data-magnet-strength="0.4"]  pull toward the pointer
     data-count="60" [data-prefix] [data-suffix]  count up when revealed

   HOW IT STAYS AT 60fps:
     · one requestAnimationFrame loop drives parallax, tilt, magnets,
       counters and the fps badge — never one loop per effect
     · listeners only record numbers; nothing reads layout inside them
     · element positions are measured on resize, not on scroll
     · only transform/opacity are written, so no layout and no repaint
     · off-screen work is skipped, and the loop idles when the tab is hidden
   ============================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var coarse = matchMedia('(pointer: coarse)');

  /* ---------------------------------------------------------------
     state shared by the single frame loop
     --------------------------------------------------------------- */
  var scrollY = window.scrollY;
  var vh = window.innerHeight;
  var pointer = { x: -9999, y: -9999, inside: false };
  var parallaxItems = [];
  var magnetItems = [];
  var tiltItems = [];
  var counters = [];
  var running = true;

  function motionOn() { return root.dataset.motion === 'on'; }

  /* ===============================================================
     1. REVEALS
     =============================================================== */
  function assignStagger() {
    document.querySelectorAll('[data-stagger]').forEach(function (parent) {
      var step = parseFloat(parent.dataset.stagger) || 80;
      var i = 0;
      Array.prototype.forEach.call(parent.children, function (child) {
        var target = child.hasAttribute('data-reveal')
          ? child
          : child.querySelector('[data-reveal]');
        if (!target) return;
        var own = parseFloat(target.dataset.delay) || 0;
        target.style.setProperty('--d', (own + (i * step) / 1000).toFixed(3) + 's');
        i++;
      });
    });
    // delays declared directly on an element, outside any stagger group
    document.querySelectorAll('[data-reveal][data-delay]').forEach(function (el) {
      if (!el.style.getPropertyValue('--d')) {
        el.style.setProperty('--d', parseFloat(el.dataset.delay) + 's');
      }
    });
  }

  function settle(el) {
    // hand `transform` back once the reveal has finished, so pointer
    // effects on the same element have the property to themselves
    var delay = parseFloat(el.style.getPropertyValue('--d')) || 0;
    setTimeout(function () { el.classList.add('is-settled'); }, 950 + delay * 1000);
  }

  var pending = [];   // everything still waiting to be revealed

  function reveal(el) {
    if (el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    settle(el);
    revealObserver.unobserve(el);       // revealed once, then forgotten
    var i = pending.indexOf(el);
    if (i > -1) pending.splice(i, 1);
  }

  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) reveal(e.target); });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

  /* An IntersectionObserver samples once per frame. A jump — clicking an
     anchor in the nav, hitting End, restoring a scroll position — can carry
     an element from below the fold to above it between two samples, and the
     observer never sees it intersect: the element stays invisible forever.
     This sweep catches anything the page has already scrolled past. It only
     runs while `pending` still has entries, and empties itself as it goes. */
  var sweepAt = 0;
  function sweepPending(now) {
    if (!pending.length || now - sweepAt < 220) return;
    sweepAt = now;
    for (var i = pending.length - 1; i >= 0; i--) {
      var el = pending[i];
      if (el.getBoundingClientRect().top < vh * 0.9) reveal(el);
    }
  }

  /* ===============================================================
     2. HERO ENTRANCE — staggered, on load
     =============================================================== */
  function playHero() {
    var items = document.querySelectorAll('[data-hero-item]');
    items.forEach(function (el, i) {
      el.style.setProperty('--d', (0.12 + i * 0.11).toFixed(2) + 's');
    });
    // one frame later so the pre-state is guaranteed to have painted
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        items.forEach(function (el) { el.classList.add('is-in'); });
        setTimeout(function () {
          items.forEach(function (el) {
            el.style.willChange = 'auto';
            if (!el.classList.contains('line')) el.style.transform = '';
          });
        }, 2400);
      });
    });
  }

  /* ===============================================================
     3. COUNTERS
     =============================================================== */
  function startCounter(el) {
    if (!el || el._counting) return;
    el._counting = true;
    var to = parseFloat(el.dataset.count) || 0;
    var pre = el.dataset.prefix || '';
    var suf = el.dataset.suffix || '';
    if (!motionOn()) { el.textContent = pre + to + suf; return; }
    counters.push({ el: el, to: to, pre: pre, suf: suf, t: 0, dur: 1400 });
  }

  /* ===============================================================
     4. MEASUREMENTS (positions cached here, never inside the loop)
     =============================================================== */
  function measure() {
    vh = window.innerHeight;
    var docTop = window.scrollY;
    parallaxItems.forEach(function (p) {
      var r = p.el.getBoundingClientRect();
      p.top = r.top + docTop;
      p.h = r.height;
    });
    magnetItems.forEach(function (m) {
      var r = m.el.getBoundingClientRect();
      m.cx = r.left + r.width / 2;
      m.cy = r.top + r.height / 2;   // viewport-relative, refreshed on scroll
      m.w = r.width; m.h = r.height;
      m.top = r.top + docTop;
    });
  }

  function collect() {
    parallaxItems = Array.prototype.map.call(
      document.querySelectorAll('[data-parallax]'),
      function (el) {
        return { el: el, speed: parseFloat(el.dataset.parallax) || 0, vis: true, top: 0, h: 0, last: null };
      }
    );

    if (!coarse.matches) {
      magnetItems = Array.prototype.map.call(
        document.querySelectorAll('[data-magnet]'),
        function (el) {
          return {
            el: el,
            label: el.querySelector('span'),
            strength: parseFloat(el.dataset.magnetStrength) || 0.35,
            x: 0, y: 0, tx: 0, ty: 0, active: false,
            cx: 0, cy: 0, w: 0, h: 0, top: 0
          };
        }
      );

      tiltItems = Array.prototype.map.call(
        document.querySelectorAll('[data-tilt]'),
        function (el) {
          return {
            el: el,
            glow: el.querySelector('.card__glow'),
            max: parseFloat(el.dataset.tiltMax) || 8,
            rx: 0, ry: 0, trx: 0, try_: 0, gx: 0, gy: 0, hover: false
          };
        }
      );
      tiltItems.forEach(bindTilt);
    }
  }

  function bindTilt(t) {
    t.el.addEventListener('pointerenter', function () {
      t.hover = true;
      t.el.classList.remove('is-releasing');
      var r = t.el.getBoundingClientRect();
      t.r = r;
    });
    t.el.addEventListener('pointermove', function (e) {
      if (!t.r) t.r = t.el.getBoundingClientRect();
      var nx = (e.clientX - t.r.left) / t.r.width - 0.5;
      var ny = (e.clientY - t.r.top) / t.r.height - 0.5;
      t.try_ = nx * t.max * 2;
      t.trx = -ny * t.max * 2;
      t.gx = e.clientX - t.r.left;
      t.gy = e.clientY - t.r.top;
    });
    t.el.addEventListener('pointerleave', function () {
      t.hover = false;
      t.trx = 0; t.try_ = 0; t.r = null;
      t.el.classList.add('is-releasing');
      t.el.style.transform = '';
      t.rx = 0; t.ry = 0;
    });
  }

  /* ===============================================================
     5. THE SINGLE FRAME LOOP
     =============================================================== */
  var frames = 0, fpsClock = 0, fpsEl = document.getElementById('fps');
  var fpsVal = fpsEl && fpsEl.querySelector('.fps__val');
  var lastT = 0;

  function frame(now) {
    if (!running) { requestAnimationFrame(frame); return; }
    var dt = lastT ? now - lastT : 16.7;
    lastT = now;

    /* -- fps badge -------------------------------------------------- */
    frames++;
    fpsClock += dt;
    if (fpsClock >= 500) {
      var fps = Math.min(Math.round((frames * 1000) / fpsClock), 144);
      if (fpsVal) fpsVal.textContent = fps;
      if (fpsEl) fpsEl.classList.toggle('is-low', fps < 50);
      frames = 0; fpsClock = 0;
    }

    if (motionOn() && !reduced.matches) {
      /* -- parallax ------------------------------------------------- */
      var mid = scrollY + vh / 2;
      for (var i = 0; i < parallaxItems.length; i++) {
        var p = parallaxItems[i];
        if (p.top + p.h < scrollY - 200 || p.top > scrollY + vh + 200) continue;
        var y = Math.round((mid - (p.top + p.h / 2)) * p.speed * 10) / 10;
        if (y !== p.last) {
          p.el.style.transform = 'translate3d(0,' + y + 'px,0)';
          p.last = y;
        }
      }

      /* -- magnetic buttons ----------------------------------------- */
      for (var m = 0; m < magnetItems.length; m++) {
        var b = magnetItems[m];
        var by = b.top - scrollY;                 // live viewport position
        if (by + b.h < -100 || by > vh + 100) continue;
        var bcx = b.cx, bcy = by + b.h / 2;
        var dx = pointer.x - bcx, dy = pointer.y - bcy;
        var reach = Math.max(b.w, b.h) / 2 + 70;
        var dist = Math.hypot(dx, dy);
        if (pointer.inside && dist < reach) {
          var fall = 1 - dist / reach;
          b.tx = dx * b.strength * fall;
          b.ty = dy * b.strength * fall;
          if (!b.active) { b.active = true; b.el.classList.add('is-magnetised'); b.el.classList.remove('is-releasing'); }
        } else {
          b.tx = 0; b.ty = 0;
          if (b.active) { b.active = false; b.el.classList.remove('is-magnetised'); b.el.classList.add('is-releasing'); }
        }
        b.x += (b.tx - b.x) * 0.16;
        b.y += (b.ty - b.y) * 0.16;
        if (Math.abs(b.x) < 0.05 && Math.abs(b.y) < 0.05 && !b.active) {
          if (b.el.style.transform) b.el.style.transform = '';
        } else {
          b.el.style.transform = 'translate3d(' + b.x.toFixed(2) + 'px,' + b.y.toFixed(2) + 'px,0)';
          if (b.label) b.label.style.transform =
            'translate3d(' + (b.x * 0.28).toFixed(2) + 'px,' + (b.y * 0.28).toFixed(2) + 'px,0)';
        }
      }

      /* -- card tilt ------------------------------------------------- */
      for (var t = 0; t < tiltItems.length; t++) {
        var c = tiltItems[t];
        if (!c.hover && Math.abs(c.rx) < 0.01 && Math.abs(c.ry) < 0.01) continue;
        c.rx += (c.trx - c.rx) * 0.14;
        c.ry += (c.try_ - c.ry) * 0.14;
        if (c.hover) {
          c.el.style.transform =
            'perspective(900px) rotateX(' + c.rx.toFixed(2) + 'deg) rotateY(' + c.ry.toFixed(2) + 'deg) translateZ(6px)';
          if (c.glow) c.glow.style.transform = 'translate3d(' + c.gx + 'px,' + c.gy + 'px,0)';
        }
      }
    }

    sweepPending(now);

    /* -- counters ---------------------------------------------------- */
    for (var k = counters.length - 1; k >= 0; k--) {
      var n = counters[k];
      n.t += dt;
      var q = Math.min(n.t / n.dur, 1);
      var e = 1 - Math.pow(1 - q, 4);               // easeOutQuart
      n.el.textContent = n.pre + Math.round(n.to * e) + n.suf;
      if (q === 1) counters.splice(k, 1);
    }

    requestAnimationFrame(frame);
  }

  /* ===============================================================
     6. LISTENERS — they only ever record a number
     =============================================================== */
  function onScroll() { scrollY = window.scrollY; }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
  }, { passive: true });
  window.addEventListener('pointerleave', function () { pointer.inside = false; });
  window.addEventListener('blur', function () { pointer.inside = false; });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 140);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    lastT = 0; frames = 0; fpsClock = 0;
  });

  /* ===============================================================
     7. NAV + MOTION INDEX RAIL
     =============================================================== */
  var nav = document.getElementById('nav');
  var railItems = {};
  document.querySelectorAll('#rail li').forEach(function (li) { railItems[li.dataset.rail] = li; });

  var railSpy = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var li = railItems[e.target.dataset.section];
      if (!li) return;
      Object.keys(railItems).forEach(function (k) { railItems[k].classList.remove('is-active'); });
      li.classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -45% 0px' });

  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('is-stuck', window.scrollY > 24);
  }, { passive: true });

  /* ===============================================================
     8. MOTION ON / OFF — a real A/B, not a CSS class on one element
     =============================================================== */
  function clearInlineTransforms() {
    parallaxItems.forEach(function (p) { p.el.style.transform = ''; p.last = null; });
    magnetItems.forEach(function (b) {
      b.el.style.transform = ''; b.x = b.y = b.tx = b.ty = 0;
      if (b.label) b.label.style.transform = '';
    });
    tiltItems.forEach(function (c) {
      c.el.style.transform = ''; c.rx = c.ry = c.trx = c.try_ = 0;
      if (c.glow) c.glow.style.transform = '';
    });
  }

  function setMotion(on) {
    root.dataset.motion = on ? 'on' : 'off';
    var btn = document.getElementById('motion-toggle');
    if (btn) btn.setAttribute('aria-pressed', String(on));
    var label = document.getElementById('motion-state');
    if (label) label.textContent = on ? 'on' : 'off';
    var cmp = document.getElementById('compare-btn');
    if (cmp) cmp.querySelector('span').textContent = on ? 'Kill the motion & compare' : 'Bring the motion back';
    if (!on) {
      clearInlineTransforms();
      // nothing stays hidden when motion is off
      document.querySelectorAll('[data-reveal],[data-hero-item],.hero__title .line')
        .forEach(function (el) { el.classList.add('is-in'); });
      counters.length = 0;
      document.querySelectorAll('[data-count]').forEach(function (el) {
        el.textContent = (el.dataset.prefix || '') + el.dataset.count + (el.dataset.suffix || '');
      });
    }
  }

  document.getElementById('motion-toggle').addEventListener('click', function () {
    setMotion(!motionOn());
  });
  document.getElementById('compare-btn').addEventListener('click', function () {
    setMotion(!motionOn());
  });

  /* ===============================================================
     9. PAGE WEIGHT — measured, not claimed
     =============================================================== */
  function reportWeight() {
    if (!performance || !performance.getEntriesByType) return;
    var res = performance.getEntriesByType('resource');
    var nav0 = performance.getEntriesByType('navigation')[0];
    var bytes = (nav0 && nav0.transferSize) || 0;
    var count = 1;
    res.forEach(function (r) {
      bytes += r.transferSize || r.encodedBodySize || 0;
      count++;
    });
    var kb = Math.round(bytes / 1024);
    var txt = kb > 0 ? kb + ' KB' : '—';
    var f1 = document.getElementById('fact-weight');
    var f2 = document.getElementById('foot-weight');
    var f3 = document.getElementById('foot-req');
    var st = document.getElementById('stat-weight');
    if (f1) f1.textContent = txt;
    if (f2) f2.textContent = txt;
    if (f3) f3.textContent = count;
    if (st && kb > 0) {
      st.dataset.count = kb;
      st.dataset.suffix = ' KB';
      // with motion off there is no counter to run, so write the value straight in
      if (!motionOn() && !st._counting) st.textContent = kb + ' KB';
    }
  }

  /* ===============================================================
     10. BOOT
     =============================================================== */
  function init() {
    clearTimeout(window.__motionFuse);   // engine is alive; cancel the safety net
    collect();
    assignStagger();
    measure();

    document.querySelectorAll('[data-section]').forEach(function (s) { railSpy.observe(s); });

    if (reduced.matches) {
      setMotion(false);
      document.querySelectorAll('[data-count]').forEach(function (el) {
        el.textContent = (el.dataset.prefix || '') + el.dataset.count + (el.dataset.suffix || '');
      });
    } else {
      setMotion(true);
      document.querySelectorAll('[data-reveal]').forEach(function (el) {
        pending.push(el);
        revealObserver.observe(el);
      });
      // counters live inside .stat blocks that carry the reveal
      document.querySelectorAll('.stat').forEach(function (s) {
        new IntersectionObserver(function (ents, obs) {
          if (ents[0].isIntersecting) { startCounter(s.querySelector('[data-count]')); obs.disconnect(); }
        }, { threshold: 0.4 }).observe(s);
      });
      playHero();
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener('load', function () { reportWeight(); measure(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
