// Step 1 of every form: verify the mobile number by SMS code before the form can be filled.
// Active only when the admin has switched "Require mobile OTP" on and SMS is set up on the server.
(function () {
  var FIELDS = ['phone', 'c-phone', 'n-phone', 'pphone'];
  window.OTP_GATE = { token: '', phone: '' };

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }

  function lockFields(phone) {
    FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.value = phone;
      el.readOnly = true;
      el.title = 'Verified mobile number';
    });
    var otpRow = document.querySelector('form .otp-box');
    if (otpRow) { otpRow.style.display = 'none'; var m = document.getElementById('otp-msg'); if (m) m.style.display = 'none'; }
  }

  function start() {
    var box = document.createElement('div');
    box.id = 'otp-modal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'otp-title');
    box.innerHTML = '<div class="otp-box"><h3 id="otp-title">Step 1: verify your mobile number</h3>' +
      '<p>We send a 6-digit code by SMS so we know how to reach you. Then you can fill in the form.</p>' +
      '<div id="og-s1"><label for="og-phone">Mobile number</label><input id="og-phone" type="tel" inputmode="numeric" maxlength="20" autocomplete="tel" placeholder="9845610894" style="letter-spacing:normal;font-size:1.1rem;text-align:left">' +
      '<button type="button" class="btn" id="og-send">Send code</button></div>' +
      '<div id="og-s2" hidden><p>Code sent to <b id="og-to"></b>.</p><input id="og-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="6-digit code">' +
      '<button type="button" class="btn" id="og-verify">Verify and continue</button> <button type="button" class="btn alt" id="og-back">Change number</button></div>' +
      '<div class="otp-err" id="og-err" role="alert"></div><p style="margin:8px 0 0"><a href="index.html">Back to home</a></p></div>';
    document.body.appendChild(box);
    var $ = function (id) { return document.getElementById(id); };
    $('og-phone').focus();
    $('og-send').onclick = function () {
      var b = this, phone = $('og-phone').value.trim();
      $('og-err').textContent = '';
      b.disabled = true;
      post('/api/otp/send', { phone: phone }).then(function (d) {
        b.disabled = false;
        if (!d.ok) { $('og-err').textContent = d.error || 'Could not send the code.'; return; }
        $('og-to').textContent = phone;
        $('og-s1').hidden = true; $('og-s2').hidden = false; $('og-code').focus();
      });
    };
    $('og-back').onclick = function () { $('og-s2').hidden = true; $('og-s1').hidden = false; $('og-err').textContent = ''; };
    $('og-verify').onclick = function () {
      var phone = $('og-phone').value.trim();
      post('/api/otp/verify', { phone: phone, code: $('og-code').value }).then(function (d) {
        if (!d.ok) { $('og-err').textContent = d.error || 'Incorrect code.'; return; }
        window.OTP_GATE.token = d.token; window.OTP_GATE.phone = phone;
        lockFields(phone);
        box.remove();
      });
    };
  }

  fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) { if (c.otpRequired) start(); }).catch(function () {});
})();
