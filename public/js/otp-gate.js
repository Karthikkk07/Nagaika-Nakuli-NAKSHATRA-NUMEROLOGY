// Mandatory mobile OTP. Active whenever the server has SMS set up (config.otpRequired).
//  - Pages with an order/enquiry form ask for the mobile number and SMS code first, before the form can be filled.
//  - Other forms that collect a number (call-back, horoscope) call OTP_GATE.ensure(phone) before sending.
(function () {
  var FIELDS = ['phone', 'c-phone', 'n-phone', 'pphone'];
  var state = { token: '', phone: '' };
  var cfgPromise = null;
  window.OTP_GATE = state;

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }
  function config() {
    if (!cfgPromise) cfgPromise = fetch('/api/config').then(function (r) { return r.json(); }).catch(function () { return {}; });
    return cfgPromise;
  }
  var last10 = function (p) { return String(p || '').replace(/\D/g, '').slice(-10); };

  // Shows the verification dialog. prefill + locked: verify exactly this number (used when a form already has one).
  // blocking: no way to dismiss it except going back to the home page (used as step 1 of a page).
  function dialog(prefill, locked, blocking) {
    return new Promise(function (resolve, reject) {
      var box = document.createElement('div');
      box.id = 'otp-modal';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'otp-title');
      box.innerHTML = '<div class="otp-box"><h3 id="otp-title">' + (blocking ? 'Step 1: verify your mobile number' : 'Verify your mobile number') + '</h3>' +
        '<p>We send a 6-digit code by SMS so we know how to reach you.' + (blocking ? ' Then you can fill in the form.' : '') + '</p>' +
        '<div id="og-s1"><label for="og-phone">Mobile number <span class="req">*</span></label><input id="og-phone" type="tel" inputmode="numeric" maxlength="20" autocomplete="tel" placeholder="9845610894" style="letter-spacing:normal;font-size:1.1rem;text-align:left">' +
        '<button type="button" class="btn" id="og-send">Send code</button></div>' +
        '<div id="og-s2" hidden><p>Code sent to <b id="og-to"></b>.</p><input id="og-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="6-digit code">' +
        '<button type="button" class="btn" id="og-verify">Verify and continue</button> ' + (locked ? '' : '<button type="button" class="btn alt" id="og-back">Change number</button>') + '</div>' +
        '<div class="otp-err" id="og-err" role="alert"></div>' +
        '<p style="margin:8px 0 0">' + (blocking ? '<a href="index.html">Back to home</a>' : '<a href="#" id="og-cancel">Cancel</a>') + '</p></div>';
      document.body.appendChild(box);
      var $ = function (id) { return box.querySelector('#' + id); };
      var phoneEl = $('og-phone');
      if (prefill) phoneEl.value = prefill;
      if (locked) phoneEl.readOnly = true;
      (prefill ? $('og-send') : phoneEl).focus();
      function close() { box.remove(); }
      $('og-send').onclick = function () {
        var b = this, phone = phoneEl.value.trim();
        $('og-err').textContent = '';
        b.disabled = true;
        post('/api/otp/send', { phone: phone }).then(function (d) {
          b.disabled = false;
          if (!d.ok) { $('og-err').textContent = d.error || 'Could not send the code.'; return; }
          $('og-to').textContent = phone;
          $('og-s1').hidden = true; $('og-s2').hidden = false; $('og-code').focus();
        });
      };
      if ($('og-back')) $('og-back').onclick = function () { $('og-s2').hidden = true; $('og-s1').hidden = false; $('og-err').textContent = ''; };
      if ($('og-cancel')) $('og-cancel').onclick = function (e) { e.preventDefault(); close(); reject(new Error('Verification cancelled.')); };
      $('og-verify').onclick = function () {
        var phone = phoneEl.value.trim();
        post('/api/otp/verify', { phone: phone, code: $('og-code').value }).then(function (d) {
          if (!d.ok) { $('og-err').textContent = d.error || 'Incorrect code.'; return; }
          state.token = d.token; state.phone = phone;
          close();
          resolve(d.token);
        });
      };
    });
  }

  // Resolves with a verified-number token ('' when OTP is not required). Rejects if the visitor cancels.
  state.ensure = function (phone) {
    return config().then(function (c) {
      if (!c.otpRequired) return '';
      if (state.token && phone && last10(state.phone) === last10(phone)) return state.token;
      return dialog(phone || '', !!phone, false);
    });
  };

  function lockFields() {
    FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.value = state.phone;
      el.readOnly = true;
      el.title = 'Verified mobile number';
    });
  }

  // Step 1 on pages that have a phone field of their own
  var hasForm = FIELDS.some(function (id) { return document.getElementById(id); });
  if (hasForm) {
    config().then(function (c) {
      if (c.otpRequired) dialog('', false, true).then(lockFields);
    });
  }
})();
