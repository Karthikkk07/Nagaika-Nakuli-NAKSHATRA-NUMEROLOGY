(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $('nform'), msg = $('nmsg'), btn = $('npay'), SERVICE = 'Nadi Astrology', fingerprint = '';
  var fee = SERVICES.filter(function (s) { return s.name === SERVICE; })[0].fee;
  $('fee').innerHTML = '&#8377;' + fee.toLocaleString('en-IN');
  btn.textContent = 'Pay \u20B9' + fee.toLocaleString('en-IN') + ' & send fingerprint';
  CHECKOUT.config().then(function (c) { $('demo-note').style.display = c.demoPayments ? 'block' : 'none'; });

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var d = new Date();
  $('n-dob').max = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  function say(t, ok) { msg.textContent = t; msg.className = 'msg ' + (ok ? 'ok' : 'bad'); }

  // Shrink the photo in the browser so the upload stays small
  $('n-file').addEventListener('change', function () {
    var f = this.files[0];
    fingerprint = ''; $('n-preview').hidden = true; msg.className = 'msg';
    if (!f) return;
    if (!/^image\//.test(f.type)) return say('Please choose an image file (a photo of your fingerprint).', false);
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      var scale = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      fingerprint = c.toDataURL('image/jpeg', 0.8);
      $('n-img').src = fingerprint; $('n-preview').hidden = false;
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { URL.revokeObjectURL(url); say('We could not read that image. Please try another photo.', false); };
    img.src = url;
  });

  function result(order, who) {
    $('nform-wrap').hidden = true;
    var el = $('nresult'); el.hidden = false;
    el.innerHTML =
      '<div class="msg ok" style="display:block"><b>Payment received. Thank you!</b><br>We have your fingerprint. Our numerologist will check it and contact you on ' + esc(who.phone) + ' or at ' + esc(who.email) + '.</div>' +
      '<p><a class="btn" target="_blank" rel="noopener" href="/api/orders/' + order.id + '/receipt.pdf">Download your receipt (PDF)</a></p>';
    window.scrollTo(0, 0);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var who = { service: SERVICE, name: $('n-name').value.trim(), phone: $('n-phone').value.trim(), email: $('n-email').value.trim() };
    if (!fingerprint) return say('Please attach a clear photo of your fingerprint.', false);
    msg.className = 'msg'; btn.disabled = true;
    CHECKOUT.createOrder({
      service: SERVICE, name: who.name, phone: who.phone, email: who.email, dob: $('n-dob').value, mode: $('n-mode').value, message: $('n-msg').value,
      hand: $('n-hand').value, fingerprint: fingerprint, consent: $('n-consent').checked, website: form.querySelector('[name=website]').value,
    })
      .then(function (o) { return CHECKOUT.pay(o.id, who); })
      .then(function (order) { result(order, who); })
      .catch(function (err) { say(err.message || 'Something went wrong. Please try again.', false); })
      .then(function () { btn.disabled = false; });
  });
})();
