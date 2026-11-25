/* EasyKash "Pay now" sheet. Markup: snippets/tk-pay.liquid. Server: github.com/crazm1111/tekila-easykash
   - Any checkout button/link opens the sheet instead of Shopify checkout.
   - The sheet reads the cart (/cart.js), so line properties such as "Passport Nº" travel with the order.
   - Prices come from the server (Shopify draft-order maths), never from this file.
   - After payment the server sends the customer to /cart?tk_paid=1&next=<order status page>:
     we empty the cart and move on. /cart?tk_pay=1 reopens the sheet (the "Try again" link). */
(function () {
  if (window.TKPay) return;
  var dlg = document.querySelector('[data-tkpay]');
  if (!dlg) return;

  var base = dlg.dataset.base;
  var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  var form = dlg.querySelector('[data-tkpay-form]');
  var $ = function (s) { return dlg.querySelector(s); };
  var els = {
    items: $('[data-tkpay-items]'), sub: $('[data-tkpay-sub]'), disc: $('[data-tkpay-disc]'), dlabel: $('[data-tkpay-dlabel]'),
    total: $('[data-tkpay-total]'), msg: $('[data-tkpay-msg]'), go: $('[data-tkpay-go]'), code: $('[data-tkpay-code]'),
    apply: $('[data-tkpay-apply]'), codebox: $('[data-tkpay-codebox]'), applied: $('[data-tkpay-applied]'),
    appliedCode: $('[data-tkpay-applied-code]'), remove: $('[data-tkpay-remove]'), codemsg: $('[data-tkpay-codemsg]')
  };
  var STORE_KEY = 'tkpay:customer';
  var FIELDS = ['name', 'phone', 'email', 'province', 'city', 'address'];
  var cartItems = [];
  var appliedCode = '';
  var total = null;
  var busy = false;
  var opener = null;

  /* ---------- helpers ---------- */
  function money(amount) {
    var n = Number(amount || 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' EGP';
  }
  function show(el, text) { el.textContent = text || ''; el.hidden = !text; }
  function post(path, data) {
    return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok || body.error) throw new Error(body.error || 'Something went wrong. Please try again.');
          return body;
        });
      });
  }
  function getCart() {
    return fetch(root + 'cart.js', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        cartItems = (cart.items || []).map(function (i) {
          var props = {};
          Object.keys(i.properties || {}).forEach(function (k) { var v = i.properties[k]; if (v != null && v !== '') props[k] = String(v); });
          return { variant_id: i.variant_id, quantity: i.quantity, properties: props, view: i };
        });
        return cartItems;
      });
  }
  function payload() { return cartItems.map(function (i) { return { variant_id: i.variant_id, quantity: i.quantity, properties: i.properties }; }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function renderItems() {
    els.items.innerHTML = cartItems.map(function (i) {
      var v = i.view;
      var img = v.image ? v.image + (v.image.indexOf('?') > -1 ? '&' : '?') + 'width=120' : '';
      var details = [];
      if (v.variant_title && !/default title/i.test(v.variant_title)) details.push(v.variant_title);
      Object.keys(i.properties).forEach(function (k) { if (k.charAt(0) !== '_') details.push(k + ' ' + i.properties[k]); });
      if (i.quantity > 1) details.push('× ' + i.quantity);
      return '<li class="tkpay__item">' + (img ? '<img src="' + esc(img) + '" alt="" width="52" height="52" loading="lazy">' : '<span></span>') +
        '<span><span class="tkpay__item-t">' + esc(v.product_title) + '</span>' + (details.length ? '<span class="tkpay__item-s">' + esc(details.join(' · ')) + '</span>' : '') + '</span>' +
        '<span class="tkpay__item-p">' + money(v.final_line_price / 100) + '</span></li>';
    }).join('');
  }
  function renderCode() {
    els.codebox.hidden = !!appliedCode;
    els.applied.hidden = !appliedCode;
    els.appliedCode.textContent = appliedCode;
  }
  function renderQuote(q) {
    total = q.total;
    els.sub.textContent = money(q.subtotal);
    var d = Number(q.discount) > 0;
    els.dlabel.hidden = !d; els.disc.hidden = !d;
    els.disc.textContent = d ? '−' + money(q.discount) : '';
    els.total.textContent = money(q.total);
    els.go.textContent = 'Pay ' + money(q.total);
  }

  /* ---------- quote / promo code ---------- */
  function quote(code) {
    return post('/quote', { items: payload(), code: code || '' }).then(function (q) { renderQuote(q); return q; });
  }
  function applyCode() {
    var code = (els.code.value || '').trim().toUpperCase();
    if (!code) { show(els.codemsg, 'Enter a promo code first.'); return; }
    els.apply.disabled = true; show(els.codemsg, '');
    quote(code).then(function (q) {
      if (q.applied) { appliedCode = q.code; els.code.value = ''; }
      else show(els.codemsg, q.message || 'This code doesn’t apply to your order.');
      renderCode();
    }).catch(function (e) { show(els.codemsg, e.message); })
      .then(function () { els.apply.disabled = false; });
  }
  function removeCode() {
    appliedCode = ''; renderCode(); show(els.codemsg, '');
    quote('').catch(function (e) { show(els.msg, e.message); });
    els.code.focus();
  }

  /* ---------- open / close ---------- */
  function open(trigger) {
    opener = trigger || document.activeElement;
    show(els.msg, ''); show(els.codemsg, '');
    els.sub.textContent = els.total.textContent = '…';
    els.go.disabled = true; els.go.textContent = 'Continue to payment';
    restore();
    if (!dlg.open) {
      try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
    }
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { requestAnimationFrame(function () { dlg.classList.add('is-in'); }); });
    getCart().then(function (items) {
      if (!items.length) { renderItems(); throw new Error('Your cart is empty.'); }
      renderItems();
      return quote(appliedCode).then(function (q) {
        if (appliedCode && !q.applied) { appliedCode = ''; renderCode(); show(els.codemsg, q.message); }
      });
    }).then(function () {
      els.go.disabled = false;
      var first = FIELDS.map(function (n) { return form.elements[n]; }).filter(function (f) { return !f.value; })[0];
      if (first && matchMedia('(min-width: 700px)').matches) first.focus({ preventScroll: true });
    }).catch(function (e) { show(els.msg, e.message); });
  }
  function close() {
    if (busy) return;
    dlg.classList.remove('is-in');
    document.documentElement.style.overflow = '';
    setTimeout(function () { if (dlg.open) dlg.close(); }, 250);
    if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true });
  }
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); }); // tap on the backdrop
  dlg.querySelectorAll('[data-tkpay-close]').forEach(function (b) { b.addEventListener('click', close); });
  els.apply.addEventListener('click', applyCode);
  els.remove.addEventListener('click', removeCode);
  els.code.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } });

  /* ---------- remember details on this device (convenience only) ---------- */
  function save() {
    try { var d = {}; FIELDS.forEach(function (n) { d[n] = form.elements[n].value; }); localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function restore() {
    try {
      var d = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      FIELDS.forEach(function (n) { if (d[n] && !form.elements[n].value) form.elements[n].value = d[n]; });
    } catch (e) {}
  }

  /* ---------- submit ---------- */
  function validate() {
    var ok = true, firstBad = null;
    FIELDS.forEach(function (n) {
      var f = form.elements[n];
      f.value = f.value.replace(/^\s+|\s+$/g, '');
      var bad = !f.checkValidity();
      if (n === 'phone' && !bad) {
        var digits = f.value.replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }).replace(/\D/g, '').replace(/^(0020|20)(?=1\d{9}$)/, '');
        bad = !/^0?1[0125]\d{8}$/.test(digits);
        f.setCustomValidity(bad ? 'Please enter a valid Egyptian mobile number (01xxxxxxxxx).' : '');
      }
      f.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad && !firstBad) firstBad = f;
      if (bad) ok = false;
    });
    if (firstBad) firstBad.reportValidity();
    return ok;
  }
  form.addEventListener('input', function (e) {
    if (e.target.name === 'phone') e.target.setCustomValidity('');
    if (e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) e.target.setAttribute('aria-invalid', 'false');
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy || els.go.disabled || !validate()) return;
    save();
    busy = true; els.go.disabled = true; els.go.textContent = 'Please wait…'; show(els.msg, '');
    var data = {};
    FIELDS.forEach(function (n) { data[n] = form.elements[n].value; });
    if (appliedCode) data.code = appliedCode;
    getCart().then(function (items) {
      if (!items.length) throw new Error('Your cart is empty.');
      data.items = payload();
      return post('/checkout', data);
    }).then(function (res) {
      if (!res.url) throw new Error('We couldn’t start the payment. Please try again.');
      els.go.textContent = 'Opening EasyKash…';
      window.location.href = res.url;
    }).catch(function (err) {
      busy = false; els.go.disabled = false;
      els.go.textContent = total ? 'Pay ' + money(total) : 'Continue to payment';
      show(els.msg, err.message);
      els.msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });

  /* ---------- take over every route into Shopify checkout ---------- */
  var CHECKOUT = 'button[name="checkout"], input[name="checkout"], a[href$="/checkout"], a[href*="/checkout?"]';
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest(CHECKOUT);
    if (!t || dlg.contains(t)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    open(t);
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target, s = e.submitter;
    var action = (f.getAttribute && f.getAttribute('action')) || '';
    if (/\/checkout/.test(action) || (s && s.name === 'checkout')) { e.preventDefault(); e.stopImmediatePropagation(); open(s); }
  }, true);

  /* ---------- return from EasyKash ---------- */
  var params = new URLSearchParams(location.search);
  if (params.get('tk_paid') === '1') {
    var next = params.get('next') || root, safe = root;
    try {
      var u = new URL(next, location.origin);
      var h = u.hostname;
      if (u.protocol === 'https:' && (h === location.hostname || h === 'shopify.com' || /\.(shopify|myshopify)\.com$/.test(h))) safe = u.href;
    } catch (e) {}
    var done = document.querySelector('[data-tkpay-done]');
    if (done) done.hidden = false;
    fetch(root + 'cart/clear.js', { method: 'POST', headers: { Accept: 'application/json' } })
      .catch(function () {})
      .then(function () { location.replace(safe); });
  } else if (params.get('tk_pay') === '1') {
    params.delete('tk_pay');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
    open();
  }

  window.TKPay = { enabled: true, open: open, close: close };
  document.dispatchEvent(new CustomEvent('tkpay:ready'));
})();
