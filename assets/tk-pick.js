/* Pick your way in: Ritual | Passport switch + the opening box at 60%.
   Also: every same-page link to #reserve scrolls so the whole section sits centred on screen. */
(function () {
  'use strict';

  /* ---------- Reserve links → centred section ---------- */
  function headerOffset() {
    // Only a header that stays on screen (sticky/fixed) covers the section.
    var h = document.querySelector('[data-tk-header]');
    if (!h) return 0;
    var pos = getComputedStyle(h).position;
    return pos === 'sticky' || pos === 'fixed' ? h.offsetHeight : 0;
  }
  function scrollToReserve(e) {
    var sec = document.getElementById('reserve');
    if (!sec) return;
    if (e) e.preventDefault();
    var header = headerOffset();
    var view = window.innerHeight - header;
    var r = sec.getBoundingClientRect();
    var top = window.scrollY + r.top - header;
    var y = r.height <= view ? top - (view - r.height) / 2 : top;
    var smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
    try { history.replaceState(null, '', '#reserve'); } catch (er) {}
  }
  window.TK = window.TK || {};
  window.TK.scrollToReserve = scrollToReserve;
  if (!window.__tkReserveBound) {
    window.__tkReserveBound = true;
    // Delegated, so it covers href="#reserve" and href="/#reserve" (header) alike; href stays as the no-JS fallback.
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href*="#reserve"]');
      if (!a || !document.getElementById('reserve')) return;
      var u; try { u = new URL(a.href, location.href); } catch (er) { return; }
      if (u.hash !== '#reserve' || u.pathname !== location.pathname) return;
      scrollToReserve(e);
    });
    if (location.hash === '#reserve') {
      var go = function () { requestAnimationFrame(function () { scrollToReserve(); }); };
      if (document.readyState === 'complete') go(); else addEventListener('load', go);
    }
  }

  /* ---------- the section ---------- */
  if (customElements.get('tk-pick')) return;
  // [x, y passport, y ritual (or x ritual for letter), rotate, delay]
  var POSE = {
    bottle:   function (p) { return [0, p ? -76 : -60, 0, 0.1]; },
    letter:   function (p) { return [p ? -6 : 18, p ? -140 : -100, -12, 0.22]; },
    pass:     function () { return [4, -110, 9, 0.32]; },
    contract: function () { return [-10, -130, -6, 0.4]; },
    card:     function () { return [6, -170, 7, 0.48]; }
  };
  customElements.define('tk-pick', class extends HTMLElement {
    connectedCallback() {
      if (this.__init) return; this.__init = 1;
      var self = this;
      this.plan = 'passport'; this.open = false;
      this.q = function (s) { return self.querySelector(s); };
      this.qa = function (s) { return Array.prototype.slice.call(self.querySelectorAll(s)); };
      var opts = this.qa('[data-plan]');
      opts.forEach(function (b, i) {
        b.addEventListener('click', function () { self.set(b.dataset.plan); });
        b.addEventListener('keydown', function (e) {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
          e.preventDefault(); var o = opts[(i + 1) % 2]; o.focus(); self.set(o.dataset.plan);
        });
      });
      this.q('[data-front]').addEventListener('click', function () { self.open = !self.open; self.render(); });
      this.render();
      // opens by itself 600 ms after it scrolls into view
      var scene = this.q('[data-scene]');
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
          if (!es[0].isIntersecting) return; io.disconnect();
          setTimeout(function () { self.open = true; self.render(); }, 600);
        }, { threshold: 0.4 });
        io.observe(scene);
      } else { this.open = true; this.render(); }
    }
    set(plan) { this.plan = plan; this.open = true; this.render(); }
    render() {
      var p = this.plan === 'passport', open = this.open, self = this;
      this.q('[data-knob]').className = 'za-knob' + (p ? ' za-knob-p' : '');
      this.qa('[data-plan]').forEach(function (b) { var on = b.dataset.plan === self.plan; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
      this.q('[data-flap]').className = 'cb-flap ' + (open ? 'cb-flap-open' : 'cb-flap-shut');
      this.q('[data-front]').setAttribute('aria-label', open ? 'Close the box' : 'Open the box');
      this.q('[data-boxsub]').textContent = p ? 'THE PASSPORT' : 'THE RITUAL';
      this.q('[data-scene]').setAttribute('aria-label', p ? 'The Passport box: bottle, letter, numbered passport, contract and gatherings invitation' : 'The Ritual box: bottle and a stranger’s letter');
      this.qa('[data-item]').forEach(function (el) {
        var k = el.dataset.item, v = POSE[k](p), show = k === 'bottle' || k === 'letter' || p, vis = open && show;
        el.style.transform = vis ? 'translate(' + v[0] + 'px,' + v[1] + 'px) rotate(' + v[2] + 'deg)' : 'translate(0,90px) rotate(0deg)';
        el.style.opacity = vis ? 1 : 0;
        el.style.transitionDelay = (vis ? v[3] : 0) + 's';
      });
      this.qa('[data-pass-only]').forEach(function (li) { li.classList.toggle('za-off', !p); });
      this.qa('[data-pass-show]').forEach(function (el) { el.hidden = !p; });
      this.qa('[data-rit-show]').forEach(function (el) { el.hidden = p; });
      var price = this.q('[data-price]'); price.textContent = p ? price.dataset.pass : price.dataset.rit;
      var cta = this.q('[data-cta]'); cta.textContent = p ? 'Reserve the Passport' : 'Reserve the Ritual';
      cta.href = (this.dataset.base || '/products/tekila-anxiety') + '?edition=' + this.plan;
    }
  });
})();
