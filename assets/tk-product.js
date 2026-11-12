/* TEKILA product page: gallery, Ritual/Passport choice, number + name, batch week, reserve. */
(function () {
  'use strict';
  if (customElements.get('tk-pdp')) return;

  var fmt = function (cents) { return Math.round(cents / 100).toLocaleString('en-US') + ' EGP'; };

  customElements.define('tk-pdp', class extends HTMLElement {
    connectedCallback() {
      if (this.__init) return; this.__init = 1;
      var data = {}; try { data = JSON.parse(this.querySelector('[data-pdp]').textContent); } catch (e) {}
      this.data = data;
      this.taken = {}; (data.taken || []).forEach(function (n) { this.taken[+n] = true; }, this);
      this.plan = ''; this.pick = 0; this.name = ''; this.slam = 0;
      this.worker = (this.dataset.worker || '').replace(/\/$/, '');
      this.$ = function (s) { return this.querySelector(s); };
      this.$$ = function (s) { return Array.prototype.slice.call(this.querySelectorAll(s)); };

      this.step = 1;
      this.initGallery();
      this.initChoice();
      this.initPassport();
      this.initWeek();

      /* ?edition=ritual|passport pre-selects a card; no parameter = nothing selected, both cards open */
      var ed = new URLSearchParams(location.search).get('edition');
      if (ed === 'ritual' || ed === 'passport') this.choose(ed, true);
      this.render();
      if (window.TK) TK.observeVideos(this);
    }

    /* ---------- gallery ---------- */
    initGallery() {
      var gal = this.$('[data-gal]'); if (!gal) return;
      var slides = this.$$('.pd-slide'), thumbs = this.$$('[data-gal-thumb]'), n = this.$('[data-gal-n]');
      var g = 0, N = slides.length, x0 = null;
      var go = function (i) {
        g = (i + N) % N;
        slides.forEach(function (s, k) {
          var on = k === g;
          if (on) s.setAttribute('data-on', ''); else s.removeAttribute('data-on');
          s.setAttribute('aria-hidden', on ? 'false' : 'true');
          var v = s.querySelector('video');
          if (v) { if (on) { window.TK ? (TK.loadVideo(v), TK.reduced() || TK.play(v)) : v.play(); } else v.pause(); }
        });
        thumbs.forEach(function (t, k) { t.setAttribute('aria-current', k === g ? 'true' : 'false'); });
        if (n) n.textContent = g + 1;
      };
      this.$('[data-gal-prev]').addEventListener('click', function () { go(g - 1); });
      this.$('[data-gal-next]').addEventListener('click', function () { go(g + 1); });
      thumbs.forEach(function (t, k) { t.addEventListener('click', function () { go(k); }); });
      gal.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
      gal.addEventListener('pointerup', function (e) { if (x0 == null) return; var dx = e.clientX - x0; x0 = null; if (dx < -40) go(g + 1); else if (dx > 40) go(g - 1); });
      gal.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') go(g - 1); if (e.key === 'ArrowRight') go(g + 1); });
    }

    /* ---------- choice: the cards are role="radio" divs (they contain buttons and an input) ---------- */
    initChoice() {
      var self = this;
      this.cards = this.$$('[data-plan]');
      this.cards.forEach(function (c, i) {
        // Clicking an unselected card selects it; clicks inside the selected card never change the selection.
        c.addEventListener('click', function () { if (self.plan !== c.dataset.plan) self.choose(c.dataset.plan); });
        c.addEventListener('keydown', function (e) {
          if (e.target !== c) return;                       // typing in the name field etc.
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.choose(c.dataset.plan); return; }
          if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].indexOf(e.key) < 0) return;
          e.preventDefault();
          var d = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
          var next = self.cards[(i + d + self.cards.length) % self.cards.length];
          next.focus(); self.choose(next.dataset.plan);
        });
      });
      var rb = this.$('[data-reserve-ritual]');
      if (rb) rb.addEventListener('click', function () { self.reserve('ritual'); });
    }
    choose(plan, silent) {
      if (this.plan === plan) return;
      var v = this.data[plan];
      if (!v || !v.available) { this.msg(plan, plan === 'passport' ? 'All 100 passports are taken.' : 'Not available right now.'); return; }
      this.plan = plan; this.msg('ritual', ''); this.msg('passport', '');
      // selecting a card switches the Shopify variant
      try { var u = new URL(location.href); u.searchParams.set('edition', plan); u.searchParams.set('variant', v.id); history.replaceState(null, '', u); } catch (e) {}
      this.render();
    }

    /* ---------- passport: number → confirm → name → reserve ---------- */
    initPassport() {
      var self = this;
      this.$$('.tkp').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = +b.dataset.no; if (self.taken[n]) return;
          if (window.TK) TK.thunk();
          self.pick = n; self.slam++; self.wallMsg(''); self.render();
        });
      });
      var input = this.$('[data-name]');
      if (input) {
        input.addEventListener('input', function () { self.name = input.value; self.render(); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.passBtn(); } });
      }
      var back = this.$('[data-back]');
      if (back) back.addEventListener('click', function () { self.step = 1; self.render(); });
      var btn = this.$('[data-pass-btn]');
      if (btn) btn.addEventListener('click', function () { self.passBtn(); });
    }
    passBtn() {
      var name = this.name.trim();
      if (this.step === 1) {
        if (!this.pick) return;
        this.step = 2; this.render();
        var i = this.$('[data-name]'); if (i) setTimeout(function () { i.focus(); }, 60);
        return;
      }
      if (name.length >= 2) this.reserve('passport');
    }
    markTaken(n) {
      this.taken[n] = true;
      var b = this.$('.tkp[data-no="' + n + '"]');
      if (b) { b.disabled = true; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Passport ' + n + ', taken'); }
      if (this.pick === n) this.pick = 0;
      var left = 0; for (var i = 101; i <= 200; i++) if (!this.taken[i]) left++;
      var l = this.$('[data-left]'); if (l) l.textContent = left;
    }

    /* ---------- Fri→Thu week strip ---------- */
    initWeek() {
      var wrap = this.$('[data-week]'); if (!wrap || !window.TK) return;
      var cells = wrap.children, clock = this.$('[data-clock]');
      var names = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'], day = 864e5;
      TK.onTick(function (l) {
        var now = TK.cairoNow(), c = new Date(now), start = l.close - 6 * day;
        for (var k = 0; k < 7; k++) {
          var t = new Date(start + k * day), today = t.getUTCDate() === c.getUTCDate();
          var past = start + k * day < now && !today;
          cells[k].className = 'tc-day' + (k === 6 ? ' tc-end' : '') + (today ? ' tc-today' : '') + (past ? ' tc-past' : '');
          cells[k].firstChild.textContent = names[k];
          cells[k].lastChild.textContent = t.getUTCDate();
        }
        if (clock) clock.setAttribute('aria-label', 'Batch closes in ' + l.d + ' days ' + l.h + ' hours ' + l.m + ' minutes. Arrives ' + TK.fmtDate(TK.arrive(l.close)));
      });
    }

    /* ---------- render ---------- */
    render() {
      var pass = this.plan === 'passport', rit = this.plan === 'ritual', self = this;
      this.cards.forEach(function (c) {
        var on = c.dataset.plan === self.plan;
        c.setAttribute('aria-checked', on ? 'true' : 'false');
        c.classList.toggle('pd-collapsed', !!self.plan && !on);   // the other card goes compact
        c.tabIndex = (on || (!self.plan && c === self.cards[0])) ? 0 : -1;
      });
      this.$$('[data-show]').forEach(function (el) { el.hidden = el.dataset.show !== self.plan; });
      var price = this.$('[data-price]');
      if (price) price.textContent = pass ? fmt(this.data.passport.price) : (rit ? fmt(this.data.ritual.price) : 'From ' + fmt(this.data.ritual.price));

      var pick = this.taken[this.pick] ? 0 : this.pick;
      if (!pick && this.step === 2) this.step = 1;
      this.$$('[data-step]').forEach(function (el) { el.hidden = +el.dataset.step !== self.step; });
      this.$$('.tkp').forEach(function (b) { var mine = +b.dataset.no === pick; b.setAttribute('aria-pressed', mine ? 'true' : 'false'); if (!b.disabled) b.setAttribute('aria-label', 'Passport ' + b.dataset.no + (mine ? ', yours' : ', open')); });

      var name = this.name.trim();
      var cname = this.$('[data-cname]');
      if (cname) { cname.textContent = name || 'Your name'; if (name) cname.removeAttribute('data-empty'); else cname.setAttribute('data-empty', ''); }
      var st = this.$('[data-cstamp]');
      if (st) {
        st.hidden = !pick;
        if (pick && st.__n !== this.slam) { st.__n = this.slam; st.className = 'pd-cstamp pd-slam' + (this.slam % 2 ? '' : ' pd-s2'); this.$('[data-cno]').textContent = pick; }
      }
      var c2 = this.$('[data-cno2]'); if (c2) c2.textContent = pick || '';
      var cert = this.$('[data-cert]');
      if (cert) cert.setAttribute('aria-label', 'Your TEKILA certificate' + (name ? ' for ' + name : '') + (pick ? ', Embajador number ' + pick : ''));

      // the Passport card's one button
      var btn = this.$('[data-pass-btn]');
      if (btn && !this.busy) {
        var label, ok;
        if (this.step === 1) { ok = !!pick; label = pick ? 'Confirm Nº ' + pick : 'Choose your number'; }
        else { ok = name.length >= 2; label = ok ? 'Reserve Passport Nº ' + pick : 'Add your name'; }
        btn.textContent = label; btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
      }
    }
    msg(plan, t) { var m = this.$('[data-msg="' + plan + '"]'); if (m) m.textContent = t; }
    wallMsg(t) { var m = this.$('[data-wall-msg]'); if (m) m.textContent = t; }

    /* Live check that a number is still free: the Worker if configured, otherwise re-read
       tekila.taken_numbers by re-rendering this section (fresh, no extra backend). */
    async isFree(n) {
      try {
        if (this.worker) {
          var r = await fetch(this.worker + '/passport/' + n, { headers: { accept: 'application/json' } });
          if (r.ok) { var j = await r.json(); return j.available !== false; }
          return true;
        }
        var res = await fetch(location.pathname + '?section_id=' + encodeURIComponent(this.dataset.section) + '&_=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return true;
        var html = await res.text(), m = html.match(/data-pdp>([\s\S]*?)<\/script>/);
        if (!m) return true;
        var d = JSON.parse(m[1]);
        (d.taken || []).forEach(function (x) { if (!this.taken[+x]) this.markTaken(+x); }, this);
        return (d.taken || []).map(Number).indexOf(n) < 0;
      } catch (e) { return true; }   // can't check: don't block the sale; Flow still records the number
    }

    /* ---------- reserve → cart → the theme's normal next step ---------- */
    async reserve(plan) {
      if (this.busy) return;
      var pass = plan === 'passport', v = this.data[plan], self = this;
      var btn = pass ? this.$('[data-pass-btn]') : this.$('[data-reserve-ritual]');
      if (pass && (!this.pick || this.name.trim().length < 2)) return;
      this.busy = true; btn.setAttribute('aria-busy', 'true'); this.msg(plan, '');
      var big = this.$('[data-bigstamp]');
      try {
        if (pass) {
          var n = this.pick;
          if (!(await this.isFree(n))) {
            this.markTaken(n); this.pick = 0; this.step = 1; this.busy = false; btn.removeAttribute('aria-busy');
            this.render(); this.wallMsg('Nº ' + n + ' was just taken. Pick another.');
            var wall = this.$('.pd-scroll'); if (wall) wall.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return;
          }
          // the big TEKILA stamp slams onto the certificate, then hand over ~600 ms after it lands
          if (big) { big.hidden = true; void big.offsetWidth; big.hidden = false; }
          if (window.TK) TK.thunk();
          var reduced = window.TK ? TK.reduced() : false;
          await new Promise(function (r) { setTimeout(r, (reduced ? 0 : 550) + 600); });
        }
        var props = { _batch: window.TK ? TK.batchLabel() : '' };
        if (pass) { props['Passport Nº'] = String(this.pick); props['Name on passport'] = this.name.trim(); }
        await fetch('/cart/clear.js', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        var res = await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ items: [{ id: v.id, quantity: 1, properties: props }] }) });
        if (!res.ok) { var err = {}; try { err = await res.json(); } catch (e) {} throw new Error(err.description || 'Could not reserve right now.'); }
        location.href = this.dataset.checkout === 'false' ? '/cart' : '/checkout';
      } catch (e) {
        if (big) big.hidden = true;
        this.msg(plan, e.message || 'Something went wrong. Try again.');
        this.busy = false; btn.removeAttribute('aria-busy'); this.render();
      }
    }
  });
})();
