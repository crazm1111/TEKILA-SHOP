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

      this.initGallery();
      this.initChoice();
      this.initPassport();
      this.initWeek();
      this.$('[data-cta]').addEventListener('click', this.reserve.bind(this));

      /* ?edition=ritual|passport pre-selects a card */
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

    /* ---------- choice ---------- */
    initChoice() {
      var self = this;
      this.cards = this.$$('[data-plan]');
      this.cards.forEach(function (c, i) {
        c.addEventListener('click', function () { self.choose(c.dataset.plan); });
        c.addEventListener('keydown', function (e) {
          if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].indexOf(e.key) < 0) return;
          e.preventDefault();
          var d = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
          var next = self.cards[(i + d + self.cards.length) % self.cards.length];
          next.focus(); self.choose(next.dataset.plan);
        });
      });
    }
    choose(plan, silent) {
      var v = this.data[plan];
      if (!v || !v.available) { this.msg(plan === 'passport' ? 'All 100 passports are taken.' : 'Not available right now.'); return; }
      this.plan = plan; this.msg('');
      try { var u = new URL(location.href); u.searchParams.set('edition', plan); u.searchParams.set('variant', v.id); history.replaceState(null, '', u); } catch (e) {}
      this.render();
    }

    /* ---------- passport number + name ---------- */
    initPassport() {
      var self = this;
      this.$$('.tkp').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = +b.dataset.no; if (self.taken[n]) return;
          if (window.TK) TK.thunk();
          self.pick = n; self.slam++; self.msg(''); self.render();
        });
      });
      var input = this.$('[data-name]');
      if (input) input.addEventListener('input', function () { self.name = input.value; self.render(); });
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
      var pass = this.plan === 'passport', rit = this.plan === 'ritual';
      this.cards.forEach(function (c) { c.setAttribute('aria-checked', c.dataset.plan === this.plan ? 'true' : 'false'); c.tabIndex = (c.dataset.plan === this.plan || (!this.plan && c === this.cards[0])) ? 0 : -1; }, this);
      this.$$('[data-show]').forEach(function (el) { el.hidden = el.dataset.show !== this.plan; }, this);
      var price = this.$('[data-price]');
      if (price) price.textContent = pass ? fmt(this.data.passport.price) : (rit ? fmt(this.data.ritual.price) : 'From ' + fmt(this.data.ritual.price));

      var pick = this.taken[this.pick] ? 0 : this.pick;
      this.$$('.tkp').forEach(function (b) { var mine = +b.dataset.no === pick; b.setAttribute('aria-pressed', mine ? 'true' : 'false'); if (!b.disabled) b.setAttribute('aria-label', 'Passport ' + b.dataset.no + (mine ? ', yours' : ', open')); });

      var name = this.name.trim();
      var cname = this.$('[data-cname]');
      if (cname) { cname.textContent = name || 'Your name'; if (name) cname.removeAttribute('data-empty'); else cname.setAttribute('data-empty', ''); }
      var st = this.$('[data-cstamp]');
      if (st) {
        st.hidden = !pick;
        if (pick && st.__n !== this.slam) { st.__n = this.slam; st.className = 'pd-cstamp pd-slam' + (this.slam % 2 ? '' : ' pd-s2'); this.$('[data-cno]').textContent = pick; }
      }
      var cert = this.$('[data-cert]');
      if (cert) cert.setAttribute('aria-label', 'Your TEKILA certificate' + (name ? ' for ' + name : '') + (pick ? ', Embajador number ' + pick : ''));

      var ready = rit || (pass && pick && name.length >= 2);
      var cta = this.$('[data-cta]');
      cta.textContent = !this.plan ? 'Choose the Ritual or the Passport'
        : pass ? (!pick ? 'Choose your number first' : (name.length < 2 ? 'Add your name for the passport' : 'Reserve Passport Nº ' + pick))
        : 'Reserve the Ritual';
      cta.setAttribute('aria-disabled', ready ? 'false' : 'true');
      this.ready = ready;
    }
    msg(t) { var m = this.$('[data-msg]'); if (m) m.textContent = t; }

    /* ---------- reserve: live number check → cart → checkout ---------- */
    async reserve() {
      var cta = this.$('[data-cta]');
      if (!this.ready || this.busy) {
        if (!this.plan) this.msg('Choose the Ritual or the Passport first.');
        else if (this.plan === 'passport' && !this.pick) this.msg('Pick a passport number first.');
        else if (this.plan === 'passport') this.msg('Add the name for your passport.');
        return;
      }
      this.busy = true; cta.setAttribute('aria-busy', 'true');
      var pass = this.plan === 'passport', v = this.data[this.plan];
      var batch = window.TK ? TK.batchLabel() : '';
      try {
        if (pass && this.worker) {
          var ok = true;
          try {
            var r = await fetch(this.worker + '/passport/' + this.pick, { headers: { accept: 'application/json' } });
            if (r.ok) { var j = await r.json(); ok = j.available !== false; }
          } catch (e) { /* worker unreachable: don't block the sale, Flow still records the number */ }
          if (!ok) { var n = this.pick; this.markTaken(n); this.render(); this.msg('Nº ' + n + ' was just taken. Pick another number.'); return; }
        }
        var props = { _batch: batch };
        if (pass) { props['Passport Nº'] = String(this.pick); props['Name on passport'] = this.name.trim(); }
        if (window.TK) TK.thunk();
        await fetch('/cart/clear.js', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        var res = await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ items: [{ id: v.id, quantity: 1, properties: props }] }) });
        if (!res.ok) { var err = {}; try { err = await res.json(); } catch (e) {} throw new Error(err.description || 'Could not reserve right now.'); }
        cta.textContent = 'Held for you. Taking you to checkout…';
        location.href = this.dataset.checkout === 'false' ? '/cart' : '/checkout';
      } catch (e) {
        this.msg(e.message || 'Something went wrong. Try again.');
      } finally {
        this.busy = false; cta.removeAttribute('aria-busy');
      }
    }
  });
})();
