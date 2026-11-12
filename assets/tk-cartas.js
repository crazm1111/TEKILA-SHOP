/* Cartas: a bag of sealed letters. Write one (stored as Pending in the Cartas Google Sheet via its
   Apps Script web app), then open one and stamp it. The sheet's Status column decides what is shown. */
(function () {
  'use strict';
  if (customElements.get('tk-cartas')) return;
  var MIN = 120;
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
  var toLetter = function (l) { return { no: pad(l.number), voice: l.type === 'voice', src: l.audio || '', text: l.text || '', stamps: l.stamps || {} }; };
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
      this.audio = this.q('[data-audio]');
      this.letters = [];
      this.mine = ss('tk-carta-mine') || '';
      this.credits = parseInt(ss('tk-carta-credit') || '0', 10) || 0;
      this.pos = {};
      try { this.stamped = JSON.parse(ls('tk-stamped') || '{}'); } catch (e) { this.stamped = {}; }
      var fallback = []; try { fallback = JSON.parse(this.q('[data-voices]').textContent); } catch (e) {}
      this.fallback = fallback.filter(function (v) { return v.src; }).map(function (v) { return { no: pad(v.number), voice: true, src: v.src, text: '', stamps: {}, fallback: true }; });

      this.bindWrite();
      this.bindOpen();
      this.q('[data-start]').addEventListener('click', function () { self.stopAudio(); self.hidePeek(); self.go('write'); var t = self.q('[data-text]'); setTimeout(function () { t.focus(); }, 50); });
      this.q('[data-back-bag]').addEventListener('click', function () { self.stopAudio(); self.go('bag'); });
      document.addEventListener('tk:sound', function (e) { if (e.detail.owner !== self.audio) self.stopAudio(); });
      document.addEventListener('tk:mute', function (e) { if (e.detail.muted) self.stopAudio(); });
      this.load();
      this.go('bag');
    }

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
      var list = raw.map(toLetter);
      if (!list.some(function (l) { return l.voice; })) {
        // Sample voice letters fill the bag until real ones exist; a real letter with the same number wins.
        var taken = {}; list.forEach(function (l) { taken[l.no] = 1; });
        list = this.fallback.filter(function (f) { return !taken[f.no]; }).concat(list);
      }
      this.letters = list.slice(0, this.shown);
      this.renderBag();
    }
    find(no) { for (var i = 0; i < this.letters.length; i++) if (this.letters[i].no === no) return this.letters[i]; return null; }

    /* ---------- scenes ---------- */
    go(step) {
      this.step = step;
      this.qa('[data-scene]').forEach(function (s) { s.hidden = s.dataset.scene !== step; });
      if (step === 'bag') this.renderBagChrome();
    }
    renderBagChrome() {
      this.q('[data-bagline]').textContent = this.credits > 0 ? 'Your letter is in. Now pick any letter and open it.' : 'Strangers sealed their heaviest moment in here. Leave yours, open any one you like.';
      this.q('[data-seat]').hidden = !!this.mine;
      this.q('[data-hint]').hidden = !(this.credits > 0);
      this.q('[data-start]').hidden = this.credits > 0;
      this.qa('.env').forEach(function (e) { e.classList.toggle('env-ready', this.credits > 0 && e.dataset.no !== this.mine); this.ariaEnv(e); }, this);
    }
    ariaEnv(e) {
      var no = e.dataset.no, mine = no === this.mine, l = this.find(no);
      e.setAttribute('aria-label', (mine ? 'Your letter ' : 'Letter ') + no + (l && l.voice ? ', voice' : '') + (this.credits > 0 && !mine ? '. Press to open.' : '. Press for a taste.'));
    }

    /* ---------- the bag ---------- */
    renderBag() {
      var self = this, bag = this.q('[data-bag]');
      this.qa('.env').forEach(function (e) { e.remove(); });
      var list = this.letters.map(function (l) { return l.no; });
      if (this.mine && list.indexOf(this.mine) < 0) list.push(this.mine);
      var W = Math.max(200, bag.clientWidth || 350), H = 360;
      list.forEach(function (no, k) {
        var l = self.find(no), mine = no === self.mine;
        var p = self.pos[no] || (mine ? { x: Math.round(W / 2 - 50), y: 140, r: -4, z: 150 } : { x: Math.round(6 + rnd(k + 1) * (W - 112)), y: Math.round(18 + rnd(k + 40) * (H - 96)), r: Math.round(-26 + rnd(k + 90) * 52) });
        self.pos[no] = p;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'env' + (mine ? ' env-mine' : ' drift'); b.dataset.no = no;
        b.style.cssText = 'left:' + p.x + 'px;top:' + p.y + 'px;transform:rotate(' + p.r + 'deg);z-index:' + (p.z || k) + ';animation-delay:' + (rnd(k + 7) * -6).toFixed(2) + 's';
        b.innerHTML = '<span class="wax">T</span><span class="no">Nº ' + no + '</span>' + (l && l.voice ? '<span class="vo" aria-hidden="true"><i style="height:40%"></i><i style="height:100%"></i><i style="height:60%"></i><i style="height:80%"></i></span>' : '');
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
      var l = this.find(no), toast = this.q('[data-toast]'), self = this;
      toast.textContent = '';
      if (no === this.mine) { toast.textContent = 'That one’s yours.'; return; }
      if (this.credits > 0 && l) { this.stopAudio(); this.hidePeek(); this.credits--; ss('tk-carta-credit', String(this.credits)); this.open(l); return; }
      if (!l) return;
      clearTimeout(this.peekT); this.stopAudio();
      var peek = this.q('[data-peek]'), snip = this.q('[data-snip]');
      peek.hidden = false;
      if (l.voice) {
        this.q('[data-peek-label]').textContent = 'VOICE LETTER Nº ' + no + ' · SNIPPET';
        this.q('[data-peek-text]').textContent = 'You’re hearing the first 5 seconds…';
        this.q('[data-peek-more]').textContent = 'Write your letter to hear it all.';
        snip.hidden = false; var i = snip.firstElementChild; i.className = ''; void i.offsetWidth; i.className = 'snip-run';
        this.playAudio(l.src);
        this.tasteT = setTimeout(function () { self.stopAudio(); self.q('[data-peek-text]').textContent = 'That’s just a snippet.'; self.peekT = setTimeout(function () { self.hidePeek(); }, 3500); }, 5000);
      } else {
        var words = (l.text || '').replace(/\s+/g, ' ').trim().split(' ');
        var frag = words.slice(Math.min(3, Math.max(0, words.length - 10)), Math.min(words.length, 12)).join(' ');
        this.q('[data-peek-label]').textContent = 'CARTA Nº ' + no;
        this.q('[data-peek-text]').textContent = frag ? '…' + frag + '…' : '…';
        this.q('[data-peek-more]').textContent = 'Write yours to read the rest.';
        snip.hidden = true;
        b.classList.add('env-shake'); setTimeout(function () { b.classList.remove('env-shake'); }, 400);
        this.peekT = setTimeout(function () { self.hidePeek(); }, 3500);
      }
    }
    hidePeek() { clearTimeout(this.peekT); var p = this.q('[data-peek]'); if (p) p.hidden = true; }
    playAudio(src) {
      var a = this.audio; if (!a || !src) return;
      if (window.TK) { TK.claimSound(a); if (TK.muted) TK.setMuted(false); }
      if (a.getAttribute('src') !== src) a.src = src;
      a.currentTime = 0; a.muted = false; window.TK ? TK.play(a) : a.play();
    }
    stopAudio() { clearTimeout(this.tasteT); if (this.audio && !this.audio.paused) this.audio.pause(); this.setPlaying(false); }

    /* ---------- write + seal ---------- */
    bindWrite() {
      var self = this, t = this.q('[data-text]'), phone = this.q('[data-phone]'), sheet = this.q('[data-sheet]');
      var upd = function () {
        var len = t.value.trim().length;
        self.q('[data-prompt]').textContent = len < 40 ? 'WHAT WAS THE MOMENT?' : (len < 120 ? 'WHAT DID YOUR BODY DO?' : (len < 260 ? 'DID YOU GO ANYWAY?' : 'KEEP GOING IF YOU WANT. WE READ EVERY WORD.'));
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
        self.credits++; ss('tk-carta-credit', String(self.credits));
        self.q('[data-text]').value = '';
        self.renderBag(); self.go('bag');
      }, (window.TK && TK.reduced()) ? 900 : 2300);
    }

    /* ---------- open + stamps ---------- */
    bindOpen() {
      var self = this;
      this.q('[data-play]').addEventListener('click', function () {
        var a = self.audio;
        if (self.playing) { a.pause(); self.setPlaying(false); return; }
        self.playAudio(self.opened.src); self.setPlaying(true);
      });
      this.audio.addEventListener('ended', function () { self.setPlaying(false); });
      this.q('[data-stamp-open]').addEventListener('click', function () { self.renderStamps('pick'); var f = self.q('.sb'); if (f) f.focus(); });
    }
    setPlaying(on) {
      this.playing = on;
      var p = this.q('[data-play]'); if (!p) return;
      p.setAttribute('aria-label', on ? 'Pause the voice letter' : 'Play the voice letter');
      this.q('[data-i-play]').hidden = on; this.q('[data-i-pause]').hidden = !on;
      this.q('[data-wave]').className = 'wave' + (on ? ' wave-on' : '');
    }
    count(l, id) { return (l.stamps && +l.stamps[id]) || 0; }
    open(l) {
      this.opened = l;
      this.q('[data-open-label]').textContent = (l.voice ? 'VOICE LETTER Nº ' : 'CARTA Nº ') + l.no;
      this.q('[data-voice-row]').hidden = !l.voice;
      var t = this.q('[data-open-text]'); t.hidden = l.voice; t.textContent = l.text || '';
      this.qa('[data-open-paper] .stamp-sm').forEach(function (s) { s.remove(); });
      this.qa('[data-myno]').forEach(function (s) { s.textContent = this.mine; }, this);
      this.setPlaying(false);
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
      if (this.worker && !l.fallback) {
        api(this.worker, 'stamp', { number: parseInt(l.no, 10), type: s.id }).catch(function () {});
      }
    }
  });
})();
