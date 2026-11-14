/* Cartas: real letters from strangers who got anxious (stored in the Cartas Google Sheet via its
   Apps Script web app; the sheet's Status column decides what is shown).
   Tap a letter: the envelope opens and the paper fills the screen with only a slice from the middle
   readable. Write and seal your own letter to read every letter in full and stamp it. */
(function () {
  'use strict';
  if (customElements.get('tk-cartas')) return;
  var MIN = 50;
  var STAMPS = [
    { id: 'yo', ini: 'YT', word: 'Yo también', sub: 'I’ve been there', x: 14, y: 14, r: -8 },
    { id: 'gracias', ini: 'G', word: 'Gracias', sub: 'Thank you for writing this', x: 18, y: 18, r: 6 },
    { id: 'respira', ini: 'R', word: 'Respira', sub: 'Breathe, it passes', x: 16, y: 16, r: -12 }
  ];
  var pad = function (n) { return String(n).padStart(4, '0'); };
  var rnd = function (i) { var x = Math.sin(i * 78.233 + 1.7) * 43758.5453; return x - Math.floor(x); };
  var ss = function (k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } };
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  var sfx = function (fn) { if (window.TK && TK[fn]) TK[fn](); };
  var track = function (n) { if (window.TK && TK.track) TK.track(n); };
  var reduced = function () { return !!(window.TK && TK.reduced()); };
  /* The readable slice in the half-blurred letter: about 2-3 lines from the middle (max ~140 characters). */
  var slice = function (text) {
    var w = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!w.length) return '…';
    var n = Math.min(24, w.length), start = Math.max(0, Math.floor((w.length - n) / 2)), frag = w.slice(start, start + n);
    while (frag.length > 6 && frag.join(' ').length > 140) frag.pop();
    var s = frag.join(' '); if (s.length > 140) s = s.slice(0, 139);
    return '…' + s.replace(/[.,;:!?]+$/, '') + '…';
  };
  var toLetter = function (l) { return { no: pad(l.number), text: l.text || '', stamps: l.stamps || {} }; };
  /* Backend calls. Apps Script URLs (script.google.com/.../exec) take ?action= and text/plain JSON
     posts (no CORS preflight); any other URL is treated as the older REST worker. */
  var api = function (base, action, data) {
    var gas = /script\.google(usercontent)?\.com/.test(base);
    if (action === 'list') return fetch(gas ? base + '?action=list&limit=' + data.limit : base + '/cartas?limit=' + data.limit, { headers: { accept: 'application/json' } });
    if (gas) return fetch(base, { method: 'POST', body: JSON.stringify(Object.assign({ action: action }, data)) });
    var path = action === 'stamp' ? '/cartas/' + data.number + '/stamp' : '/cartas';
    return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify(action === 'stamp' ? { type: data.type } : data) });
  };

  customElements.define('tk-cartas', class extends HTMLElement {
    connectedCallback() {
      if (this.__init) return; this.__init = 1;
      var self = this;
      this.worker = (this.dataset.worker || '').replace(/\/$/, '');
      this.shown = parseInt(this.dataset.shown || '20', 10);
      this.q = function (s) { return self.querySelector(s); };
      this.qa = function (s) { return Array.prototype.slice.call(self.querySelectorAll(s)); };
      this.letters = [];
      this.mine = ss('tk-carta-mine') || '';
      this.pos = {};
      try { this.stamped = JSON.parse(ls('tk-stamped') || '{}'); } catch (e) { this.stamped = {}; }

      // the letter overlay lives on <body> so position:fixed covers the whole screen
      this.ov = this.q('[data-ov]'); document.body.appendChild(this.ov);
      this.oq = function (s) { return self.ov.querySelector(s); };
      this.oq('[data-ov-close]').addEventListener('click', function () { self.closeLetter(); });
      this.oq('[data-ov-write]').addEventListener('click', function () { track('letter_gate_tap'); self.closeLetter(true); self.write(); });
      this.ov.addEventListener('click', function (e) { if (e.target === self.ov) self.closeLetter(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !self.ov.hidden) self.closeLetter(); });

      this.bindWrite();
      this.q('[data-stamp-open]').addEventListener('click', function () { self.renderStamps('pick'); var f = self.q('.sb'); if (f) f.focus(); });
      this.q('[data-start]').addEventListener('click', function () { track('letter_write_tap'); self.write(); });
      this.q('[data-seat]').addEventListener('click', function () { self.write(); });
      this.q('[data-back-bag]').addEventListener('click', function () { self.go('bag'); });
      this.load();
      this.go('bag');
    }
    unlocked() { return !!this.mine || ls('tk-carta-wrote') === '1'; }
    write() { this.go('write'); var t = this.q('[data-text]'); this.q('[data-scene="write"]').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); setTimeout(function () { t.focus({ preventScroll: true }); }, 400); }

    /* ---------- data ---------- */
    async load() {
      // Show the last bag this visitor saw right away (Apps Script takes 1-2s), then refresh it.
      var cached = null; try { cached = JSON.parse(ls('tk-cartas-bag') || 'null'); } catch (e) {}
      this.setLetters(cached || []);
      if (!this.worker) return;
      try {
        var r = await api(this.worker, 'list', { limit: this.shown });
        if (!r.ok) return;
        var j = await r.json(); if (!j.letters) return;
        ls('tk-cartas-bag', JSON.stringify(j.letters));
        if (!cached || this.step === 'bag') this.setLetters(j.letters);
      } catch (e) {}
    }
    setLetters(raw) {
      this.letters = raw.filter(function (l) { return l.type !== 'voice' && l.text; }).map(toLetter).slice(0, this.shown);
      this.renderBag();
    }
    find(no) { for (var i = 0; i < this.letters.length; i++) if (this.letters[i].no === no) return this.letters[i]; return null; }

    /* ---------- scenes ---------- */
    go(step) {
      this.step = step;
      this.qa('[data-scene]').forEach(function (s) { s.hidden = s.dataset.scene !== step; });
      // no sticky Reserve bar while writing/sealing, so it isn't mistaken for the Seal button
      document.documentElement.classList.toggle('tk-no-sbar', step === 'write' || step === 'sealing');
      document.dispatchEvent(new CustomEvent('tk:sbar'));
      if (step === 'bag') this.renderBagChrome();
    }
    renderBagChrome() {
      var open = this.unlocked();
      this.q('[data-bagline]').hidden = !open;
      this.q('[data-hint]').textContent = open ? 'Tap any letter to read it in full' : 'Tap a letter to read it';
      this.q('[data-start]').hidden = !!this.mine;
      this.qa('.env').forEach(function (e) {
        var no = e.dataset.no, mine = no === this.mine;
        e.classList.toggle('env-ready', open && !mine);
        e.setAttribute('aria-label', (mine ? 'Your letter ' : 'Letter ') + no + (mine ? '' : '. Press to read.'));
      }, this);
    }

    /* ---------- the bag ---------- */
    renderBag() {
      var self = this, bag = this.q('[data-bag]');
      this.qa('.env').forEach(function (e) { e.remove(); });
      var list = this.letters.map(function (l) { return l.no; });
      if (this.mine && list.indexOf(this.mine) < 0) list.push(this.mine);
      var W = Math.max(200, bag.clientWidth || 350), H = 360;
      list.forEach(function (no, k) {
        var mine = no === self.mine;
        var p = self.pos[no] || (mine ? { x: Math.round(W / 2 - 50), y: 140, r: -4, z: 150 } : { x: Math.round(6 + rnd(k + 1) * (W - 112)), y: Math.round(18 + rnd(k + 40) * (H - 110)), r: Math.round(-26 + rnd(k + 90) * 52) });
        self.pos[no] = p;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'env' + (mine ? ' env-mine' : ' drift'); b.dataset.no = no;
        b.style.cssText = 'left:' + p.x + 'px;top:' + p.y + 'px;transform:rotate(' + p.r + 'deg);z-index:' + (p.z || k) + ';animation-delay:' + (rnd(k + 7) * -6).toFixed(2) + 's';
        b.innerHTML = '<span class="wax">T</span><span class="no">Nº ' + no + '</span>';
        self.drag(b, W, H);
        b.addEventListener('click', function () { if (b.__moved) { b.__moved = false; return; } self.tap(no, b); });
        bag.appendChild(b);
      });
      this.renderBagChrome();
    }
    drag(b, W, H) {
      var self = this, d = null;
      b.addEventListener('pointerdown', function (e) { var p = self.pos[b.dataset.no]; d = { sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y }; b.__moved = false; try { b.setPointerCapture(e.pointerId); } catch (er) {} });
      b.addEventListener('pointermove', function (e) {
        if (!d) return; var dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (!b.__moved && Math.abs(dx) + Math.abs(dy) <= 6) return;
        if (!b.__moved) { b.__moved = true; b.classList.remove('drift'); b.style.zIndex = 200; }
        var p = self.pos[b.dataset.no]; p.x = Math.max(-20, Math.min(W - 80, d.ox + dx)); p.y = Math.max(0, Math.min(H - 50, d.oy + dy));
        b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; b.style.transform = 'rotate(0deg)';
      });
      var end = function () { if (!d) return; d = null; if (b.__moved) { var p = self.pos[b.dataset.no]; p.z = 100 + (Date.now() % 100); b.style.zIndex = p.z; b.style.transform = 'rotate(' + p.r + 'deg)'; } };
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
    }
    tap(no, b) {
      var l = this.find(no), toast = this.q('[data-toast]');
      toast.textContent = '';
      if (no === this.mine) { toast.textContent = 'That one’s yours.'; return; }
      if (!l) return;
      track('letter_open');
      if (this.unlocked()) { this.open(l); return; }
      this.openLetter(l, b);
    }

    /* ---------- the half-blurred letter: envelope rises, opens, paper fills the screen ---------- */
    openLetter(l, from) {
      var self = this, ov = this.ov, env = this.oq('[data-ov-env]'), paper = this.oq('[data-ov-paper]');
      clearTimeout(this.ovT1); clearTimeout(this.ovT2);
      this.oq('[data-ov-label]').textContent = 'CARTA Nº ' + l.no;
      this.oq('[data-ov-slice]').textContent = slice(l.text);
      ov.className = 'cl-ov'; ov.hidden = false;
      this.lockPage(true);
      this.lastFocus = from;
      if (reduced()) { ov.classList.add('cl-in', 'cl-paper-on'); this.oq('[data-ov-close]').focus(); return; }
      // start the big envelope exactly where the tapped one sits, then fly it to the centre
      var r = from.getBoundingClientRect(), W = 220, H = 146;
      var cx = innerWidth / 2, cy = innerHeight * 0.42;
      env.style.transition = 'none';
      env.style.transform = 'translate(' + Math.round(r.left + r.width / 2 - cx) + 'px,' + Math.round(r.top + r.height / 2 - cy) + 'px) scale(' + (r.width / W).toFixed(3) + ')';
      void env.offsetWidth;
      env.style.transition = '';
      requestAnimationFrame(function () { ov.classList.add('cl-in'); env.style.transform = ''; });
      this.ovT1 = setTimeout(function () { ov.classList.add('cl-open'); sfx('thunk'); }, 480);
      this.ovT2 = setTimeout(function () { ov.classList.add('cl-paper-on'); self.oq('[data-ov-close]').focus({ preventScroll: true }); }, 820);
    }
    /* Freeze the page behind the letter without it jumping (fixed body, restore the scroll after). */
    lockPage(on) {
      var b = document.body;
      if (on) { if (this.lockY != null) return; this.lockY = window.scrollY; b.style.position = 'fixed'; b.style.top = -this.lockY + 'px'; b.style.left = '0'; b.style.right = '0'; }
      else if (this.lockY != null) { var y = this.lockY; this.lockY = null; b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = ''; window.scrollTo(0, y); }
    }
    closeLetter(silent) {
      var ov = this.ov; clearTimeout(this.ovT1); clearTimeout(this.ovT2);
      ov.classList.remove('cl-in', 'cl-open', 'cl-paper-on'); this.lockPage(false);
      setTimeout(function () { ov.hidden = true; }, reduced() ? 0 : 250);
      if (!silent && this.lastFocus) try { this.lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }

    /* ---------- write + seal ---------- */
    bindWrite() {
      var self = this, t = this.q('[data-text]'), phone = this.q('[data-phone]'), sheet = this.q('[data-sheet]');
      var upd = function () {
        var len = t.value.trim().length;
        self.q('[data-prompt]').textContent = len < 20 ? 'WHAT WAS THE MOMENT?' : (len < MIN ? 'WHAT DID YOUR BODY DO?' : (len < 200 ? 'DID YOU GO ANYWAY?' : 'KEEP GOING IF YOU WANT. WE READ EVERY WORD.'));
        self.q('[data-counter]').textContent = len < MIN ? (MIN - len) + ' more characters to seal' : len + ' characters';
        self.q('[data-to-send]').disabled = len < MIN;
      };
      t.addEventListener('input', upd);
      var phoneOk = function () { return phone.value.replace(/\D/g, '').length >= 10; };
      phone.addEventListener('input', function () { phone.setAttribute('aria-invalid', phone.value && !phoneOk() ? 'true' : 'false'); self.q('[data-seal]').disabled = !phoneOk(); });
      this.q('[data-to-send]').addEventListener('click', function () { sheet.hidden = false; setTimeout(function () { phone.focus(); }, 50); });
      var close = function () { sheet.hidden = true; self.q('[data-to-send]').focus(); };
      this.q('[data-close-send]').addEventListener('click', close);
      sheet.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      this.q('[data-back]').addEventListener('click', function () { self.go('bag'); });
      this.q('[data-seal]').addEventListener('click', function () { self.seal(); });
    }
    async seal() {
      var self = this, btn = this.q('[data-seal]'), err = this.q('[data-send-err]');
      var text = this.q('[data-text]').value.trim(), phone = this.q('[data-phone]').value.trim(), priv = this.q('[data-private]').checked;
      err.textContent = '';
      if (!this.worker) { err.textContent = 'Letters open very soon. Keep this one for now.'; return; }
      btn.disabled = true; btn.textContent = 'Sealing…';
      var number = null;
      try {
        var r = await api(this.worker, 'seal', { text: text, phone: phone, private: priv, hp: (this.q('[data-hp]') || {}).value || '' });
        var j = {}; try { j = await r.json(); } catch (e) {}
        if (!r.ok || !j.number) throw new Error(j.error || 'We could not seal it. Try again in a minute.');
        number = j.number;
      } catch (e) {
        err.textContent = e.message || 'We could not seal it. Try again in a minute.';
        btn.disabled = false; btn.textContent = 'Seal & send'; return;
      }
      btn.textContent = 'Seal & send';
      this.mine = pad(number); ss('tk-carta-mine', this.mine);
      var line = text.split(/[\n.!?]/)[0].trim(); if (line.length > 42) line = line.slice(0, 40).replace(/\s+\S*$/, '') + '…';
      ss('tk-letter-line', line); document.dispatchEvent(new CustomEvent('tk:letter', { detail: { line: line } }));
      this.q('[data-sheet]').hidden = true;
      this.qa('[data-myno]').forEach(function (s) { s.textContent = self.mine; });
      this.go('sealing');
      setTimeout(function () { sfx('thunk'); }, 380);
      setTimeout(function () {
        ls('tk-carta-wrote', '1'); track('letter_sealed');
        self.q('[data-text]').value = '';
        self.renderBag(); self.go('bag');
      }, (window.TK && TK.reduced()) ? 900 : 2300);
    }

    /* ---------- open in full + stamps ---------- */
    count(l, id) { return (l.stamps && +l.stamps[id]) || 0; }
    open(l) {
      this.opened = l;
      this.q('[data-open-label]').textContent = 'CARTA Nº ' + l.no;
      this.q('[data-open-text]').textContent = l.text || '';
      this.qa('[data-open-paper] .stamp-sm').forEach(function (s) { s.remove(); });
      this.qa('[data-myno]').forEach(function (s) { s.textContent = this.mine; }, this);
      this.renderStamps(this.stamped[l.no] ? 'done' : 'idle');
      this.go('open');
      this.q('[data-open-label]').scrollIntoView({ block: 'nearest' });
    }
    renderStamps(mode) {
      var self = this, l = this.opened, mine = this.stamped[l.no];
      var total = STAMPS.reduce(function (a, s) { return a + self.count(l, s.id); }, 0);
      this.q('[data-total]').textContent = 'Stamped ' + total + (total === 1 ? ' time' : ' times');
      this.q('[data-stamp-idle]').hidden = mode !== 'idle';
      var pick = this.q('[data-stamp-pick]'); pick.hidden = mode !== 'pick';
      this.q('[data-stamp-open]').setAttribute('aria-expanded', mode === 'pick' ? 'true' : 'false');
      this.q('[data-mine-seat]').hidden = !(mode === 'done' && this.mine);
      var done = this.q('[data-stamp-done]'); done.hidden = mode !== 'done';
      if (mode === 'pick') {
        pick.querySelectorAll('.sb').forEach(function (b) { b.remove(); });
        STAMPS.forEach(function (s, i) {
          var n = self.count(l, s.id), b = document.createElement('button');
          b.type = 'button'; b.className = 'sb'; b.style.animationDelay = (i * 60) + 'ms';
          b.setAttribute('aria-label', s.word + ': ' + s.sub + ', ' + n + ' stamps');
          b.innerHTML = '<span class="sb-ic" aria-hidden="true"></span><span class="sb-txt"><span class="sb-word"></span><span class="sb-sub"></span></span><span class="sb-n"></span>';
          b.querySelector('.sb-ic').textContent = s.ini; b.querySelector('.sb-word').textContent = s.word; b.querySelector('.sb-sub').textContent = s.sub; b.querySelector('.sb-n').textContent = n;
          b.addEventListener('click', function () { self.stamp(s); });
          pick.appendChild(b);
        });
      }
      if (mode === 'done' && mine) {
        var s = STAMPS.filter(function (x) { return x.id === mine; })[0];
        if (s) {
          var others = Math.max(0, this.count(l, s.id) - 1);
          done.innerHTML = '<span class="sb-ic sb-ic-on" aria-hidden="true"></span><span><b></b> · you and ' + others + ' others</span>';
          done.querySelector('.sb-ic').textContent = s.ini; done.querySelector('b').textContent = s.word;
          var m = document.createElement('span'); m.className = 'stamp-sm'; m.style.cssText = 'right:' + s.x + 'px;bottom:' + s.y + 'px;transform:rotate(' + s.r + 'deg)';
          m.innerHTML = '<span class="wide" style="font-size:14px"></span>'; m.firstChild.textContent = s.word;
          this.q('[data-open-paper]').appendChild(m);
        }
      }
    }
    stamp(s) {
      var l = this.opened; if (this.stamped[l.no]) return;
      sfx('thunk');
      l.stamps = l.stamps || {}; l.stamps[s.id] = this.count(l, s.id) + 1;
      this.stamped[l.no] = s.id; ls('tk-stamped', JSON.stringify(this.stamped));
      this.renderStamps('done');
      if (this.worker) {
        api(this.worker, 'stamp', { number: parseInt(l.no, 10), type: s.id }).catch(function () {});
      }
    }
  });
})();
