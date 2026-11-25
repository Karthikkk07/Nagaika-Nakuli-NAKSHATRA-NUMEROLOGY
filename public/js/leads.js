(function () {
  var wa = function (text) { return 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(text); };

  // Adds a follow-up block under a calculator result: WhatsApp chat, share, and a call-back request.
  // ctx: { topic: 'Life path 2, birth number 5', share: 'text to share', dob: 'YYYY-MM-DD' }
  function attach(el, ctx) {
    var old = el.querySelector('.cta'); if (old) old.remove();
    var site = location.origin + '/';
    var box = document.createElement('div');
    box.className = 'cta';
    box.innerHTML =
      '<p><b>Want to know what this means for you?</b> Talk to our numerologist for a personal reading.</p>' +
      '<div class="acts"><a class="btn sm" target="_blank" rel="noopener" href="' + wa('Hello, I checked my result on your website (' + ctx.topic + ') and would like a personal reading.') + '">Chat on WhatsApp</a> ' +
      '<a class="btn sm yellow" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(ctx.share + ' Find yours free: ' + site) + '">Share my result</a></div>' +
      '<form class="lead"><b>Or get a free call back</b><div class="row"><input name="name" placeholder="Your name" aria-label="Your name" required maxlength="100"><input name="phone" type="tel" inputmode="numeric" placeholder="Mobile number" aria-label="Mobile number" required maxlength="20"></div>' +
      '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="btn sm" type="submit">Request call back</button> <span class="lead-msg" role="status"></span></form>';
    el.appendChild(box);

    var form = box.querySelector('form'), msg = box.querySelector('.lead-msg'), btn = form.querySelector('button');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      btn.disabled = true; msg.textContent = '';
      var f = new FormData(form);
      var verify = window.OTP_GATE ? OTP_GATE.ensure(String(f.get('phone'))) : Promise.resolve('');
      verify.then(function (otpToken) {
        return fetch('/api/lead', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: f.get('name'), phone: f.get('phone'), website: f.get('website'), topic: ctx.topic, dob: ctx.dob || '', otpToken: otpToken }),
        });
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { form.innerHTML = '<p class="lead-ok"><b>Thank you.</b> We will call you soon. You can also chat on WhatsApp above.</p>'; return; }
        msg.textContent = d.error || 'Please check your details.'; btn.disabled = false;
      }).catch(function () { msg.textContent = 'Please verify your mobile number and try again, or use WhatsApp above.'; btn.disabled = false; });
    });
  }

  window.LEADS = { attach: attach, wa: wa };
})();
