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

  // Mobile OTP step (shown only when the admin has switched it on and SMS is set up on the server)
  function askOtp(phone) {
    return post('/api/otp/send', { phone: phone }).then(function (s) {
      if (!s.ok) throw new Error(s.error || 'Could not send the code. Please try again.');
      return new Promise(function (resolve, reject) {
        var box = document.createElement('div');
        box.id = 'otp-modal';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML = '<div class="otp-box"><h3>Verify your mobile number</h3><p>We sent a 6-digit code by SMS to <b></b>.</p>' +
          '<input id="otp-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="6-digit code"><div class="otp-err" role="alert"></div>' +
          '<button type="button" class="btn" id="otp-ok">Verify and continue</button> <button type="button" class="btn alt" id="otp-x">Cancel</button></div>';
        box.querySelector('b').textContent = phone;
        document.body.appendChild(box);
        var input = box.querySelector('#otp-code'), err = box.querySelector('.otp-err');
        input.focus();
        function close() { box.remove(); }
        box.querySelector('#otp-x').onclick = function () { close(); reject(new Error('Verification cancelled.')); };
        box.querySelector('#otp-ok').onclick = function () {
          post('/api/otp/verify', { phone: phone, code: input.value }).then(function (v) {
            if (v.ok) { close(); resolve(v.token); } else err.textContent = v.error || 'Incorrect code.';
          });
        };
      });
    });
  }

  // Create the order on the server (validates the details). Resolves with { id, amount, free, order }.
  function createOrder(payload) {
    if (!payload.otpToken && window.OTP_GATE && OTP_GATE.token) payload.otpToken = OTP_GATE.token;
    return config().then(function (c) {
      return c.otpRequired && !payload.otpToken ? askOtp(payload.phone).then(function (t) { payload.otpToken = t; }) : null;
    }).then(function () {
      return post('/api/orders', payload).then(function (d) {
        if (!d.ok) throw new Error(d.error || 'Please check your details.');
        return d;
      });
    });
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
