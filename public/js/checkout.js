// Shared payment step for every paid service. Resolves with the public order (including the marriage result, if any).
(function () {
  var cfg = null;
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }
  function config() {
    if (cfg) return Promise.resolve(cfg);
    return fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) { cfg = c; return c; });
  }
  function loadRazorpay() {
    return new Promise(function (res, rej) {
      if (window.Razorpay) return res();
      var s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = res; s.onerror = function () { rej(new Error('Could not load the payment window. Check your connection.')); };
      document.head.appendChild(s);
    });
  }

  // Create the order on the server (validates the details). Resolves with { id, amount, free, order }.
  function createOrder(payload) {
    return post('/api/orders', payload).then(function (d) { if (!d.ok) throw new Error(d.error || 'Please check your details.'); return d; });
  }

  // Pay for an existing order
  function pay(orderId, who) {
    return post('/api/orders/' + orderId + '/pay').then(function (p) {
      if (!p.ok) throw new Error(p.error || 'Could not start the payment.');
      if (p.mode === 'demo') {
        return post('/api/orders/' + orderId + '/demo-pay').then(function (d) { if (!d.ok) throw new Error(d.error || 'Payment failed.'); return d.order; });
      }
      return loadRazorpay().then(function () {
        return new Promise(function (resolve, reject) {
          new Razorpay({
            key: p.keyId, amount: p.amount, currency: p.currency, order_id: p.rzpOrderId,
            name: SITE.brand, description: who.service, prefill: { name: who.name, email: who.email, contact: who.phone },
            handler: function (resp) {
              post('/api/payments/razorpay/verify', resp).then(function (v) {
                if (v.ok) resolve(v.order); else reject(new Error('Payment could not be verified. Please contact us with your payment ID.'));
              });
            },
            modal: { ondismiss: function () { reject(new Error('Payment was cancelled. You can try again.')); } },
          }).open();
        });
      });
    });
  }

  window.CHECKOUT = { config: config, createOrder: createOrder, pay: pay };
})();
