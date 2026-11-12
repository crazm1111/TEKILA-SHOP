/* TEKILA core: Cairo batch clock, WebAudio sounds, global mute, lazy videos. No dependencies. */
(function () {
  'use strict';
  var TK = (window.TK = window.TK || {});
  var DAY = 864e5;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------- storage (never throws) ---------- */
  TK.get = function (store, k) { try { return window[store].getItem(k); } catch (e) { return null; } };
  TK.set = function (store, k, v) { try { window[store].setItem(k, v); } catch (e) {} };

  /* ---------- Cairo time ----------
     Returns ms "shifted" so getUTC* reads Cairo wall-clock time.
     Uses Intl so it stays right if Egypt switches DST on again; falls back to UTC+2. */
  TK.cairoOffset = function (at) {
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(at));
      var o = {}; p.forEach(function (x) { o[x.type] = +x.value; });
      return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(at / 1000) * 1000;
    } catch (e) { return 2 * 3600e3; }
  };
  TK.cairoNow = function () { var n = Date.now(); return n + TK.cairoOffset(n); };
  /* next batch close = Thursday 23:59 Cairo */
  TK.nextClose = function (now) {
    now = now || TK.cairoNow();
    var c = new Date(now);
    var close = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), 23, 59, 0) + ((4 - c.getUTCDay() + 7) % 7) * DAY;
    if (close <= now) close += 7 * DAY;
    return close;
  };
  TK.arrive = function (close) { return (close || TK.nextClose()) + 10 * DAY; };
  TK.fmtDate = function (t) { var x = new Date(t); return x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()]; };
  TK.pad = function (n) { return String(n).padStart(2, '0'); };
  /* batch number = floor((close - batch_start close) / 7 days) + 1 */
  TK.batchNo = function (close) {
    close = close || TK.nextClose();
    var s = document.documentElement.getAttribute('data-batch-start');
    var fallback = parseInt(document.documentElement.getAttribute('data-batch-fallback') || '1', 10) || 1;
    if (!s) return fallback;
    var p = s.split('-').map(Number);
    var start = Date.UTC(p[0], p[1] - 1, p[2], 23, 59, 0);
    return Math.max(1, Math.floor((close - start + 60e3) / (7 * DAY)) + 1);
  };
  TK.batchLabel = function (close) { return TK.pad(TK.batchNo(close)); };
  TK.left = function (now) {
    now = now || TK.cairoNow();
    var close = TK.nextClose(now);
    var s = Math.max(0, Math.floor((close - now) / 1000));
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    return { d: d, h: h, m: m, s: s, close: close };
  };
  TK.formats = {
    long: function (l) { return l.d + 'd ' + TK.pad(l.h) + 'h ' + TK.pad(l.m) + 'm ' + TK.pad(l.s) + 's'; },
    short: function (l) { return l.d + 'd ' + TK.pad(l.h) + 'h ' + TK.pad(l.m) + 'm'; },
    clock: function (l) { return l.d + 'd ' + TK.pad(l.h) + ':' + TK.pad(l.m) + ':' + TK.pad(l.s); },
    compact: function (l) { return l.d > 0 ? l.d + 'd ' + TK.pad(l.h) + 'h' : TK.pad(l.h) + 'h ' + TK.pad(l.m) + 'm'; },
    closes: function (l) { return 'Closes in ' + l.d + 'd ' + TK.pad(l.h) + 'h'; },
    arrive: function (l) { return TK.fmtDate(TK.arrive(l.close)); },
    batch: function (l) { return TK.batchLabel(l.close); },
    batchInt: function (l) { return String(TK.batchNo(l.close)); }
  };

  /* one ticker for every <tk-time> on the page */
  var subs = [];
  TK.onTick = function (fn) { subs.push(fn); fn(TK.left()); };
  function tick() { var l = TK.left(); for (var i = 0; i < subs.length; i++) subs[i](l); }
  setInterval(tick, 1000);

  /* <tk-time format="long|short|clock|compact|closes|arrive|batch">fallback</tk-time> */
  if (!customElements.get('tk-time')) {
    customElements.define('tk-time', class extends HTMLElement {
      connectedCallback() {
        var f = TK.formats[this.getAttribute('format') || 'long'] || TK.formats.long;
        var el = this;
        TK.onTick(function (l) { var t = f(l); if (el.textContent !== t) el.textContent = t; });
      }
    });
  }

  /* ---------- sound ---------- */
  TK.muted = TK.get('localStorage', 'tk-muted') === '1';
  var ac = null;
  TK.audio = function () {
    if (!ac) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };
  /* spray noise */
  TK.psst = function () {
    var ctx = TK.audio(); if (!ctx || TK.muted) return;
    var len = Math.floor(ctx.sampleRate * 0.32); var buf = ctx.createBuffer(1, len, ctx.sampleRate); var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2600;
    var g = ctx.createGain(); g.gain.value = 0.45;
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
  };
  /* stamp */
  TK.thunk = function () {
    var ctx = TK.audio(); if (!ctx || TK.muted) return;
    var o = ctx.createOscillator(); var g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(140, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.9, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25);
  };
  TK.setMuted = function (m) {
    TK.muted = !!m;
    TK.set('localStorage', 'tk-muted', m ? '1' : '0');
    if (m) document.querySelectorAll('video').forEach(function (v) { v.muted = true; });
    else TK.audio();
    document.dispatchEvent(new CustomEvent('tk:mute', { detail: { muted: TK.muted } }));
  };
  /* Only one thing on the page plays with sound. Call before unmuting a video. */
  TK.claimSound = function (owner) {
    document.querySelectorAll('video').forEach(function (v) {
      if (v === owner) return;
      if (v.hasAttribute('data-tk-loop')) v.muted = true; else if (!v.paused) v.pause();
    });
    document.dispatchEvent(new CustomEvent('tk:sound', { detail: { owner: owner } }));
  };
  TK.play = function (v) { if (!v) return; var r = v.play(); if (r && r.catch) r.catch(function () {}); };

  if (!customElements.get('tk-mute')) {
    customElements.define('tk-mute', class extends HTMLElement {
      connectedCallback() {
        var b = this.querySelector('button'); if (!b) return;
        var sync = function () { b.setAttribute('aria-pressed', TK.muted ? 'true' : 'false'); b.setAttribute('aria-label', TK.muted ? 'Turn sound on' : 'Mute sound'); };
        sync();
        b.addEventListener('click', function () { TK.setMuted(!TK.muted); });
        document.addEventListener('tk:mute', sync);
      }
    });
  }

  /* ---------- motion ---------- */
  TK.reduced = function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; };

  /* ---------- lazy videos ----------
     <video data-src="…" poster="…" muted playsinline preload="none" data-tk-loop>
     Loads when near the viewport; looping (data-tk-loop) ones autoplay while visible,
     unless the visitor prefers reduced motion. */
  TK.loadVideo = function (v) { if (v && v.dataset.src && !v.getAttribute('src')) { v.src = v.dataset.src; v.load(); } };
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) {
        TK.loadVideo(v);
        if (v.hasAttribute('data-tk-loop') && !TK.reduced() && !v.hasAttribute('data-tk-hold')) TK.play(v);
      } else if (v.hasAttribute('data-tk-loop') && !v.paused) v.pause();
    });
  }, { rootMargin: '200px 0px' }) : null;
  TK.observeVideos = function (root) {
    (root || document).querySelectorAll('video[data-src],video[data-tk-loop]').forEach(function (v) {
      if (v.__tk) return; v.__tk = 1;
      if (io) io.observe(v); else TK.loadVideo(v);
    });
  };
  document.addEventListener('DOMContentLoaded', function () { TK.observeVideos(); });
  document.addEventListener('shopify:section:load', function (e) { TK.observeVideos(e.target); });
})();
