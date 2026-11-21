(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sel = $('psvc'), q = new URLSearchParams(location.search), MARRIAGE = 'Marriage Compatibility';
  SERVICES.forEach(function (s) { var o = document.createElement('option'); o.textContent = s.name; sel.appendChild(o); });
  if (q.get('service')) sel.value = q.get('service');
  if (q.get('amount')) $('pamt').value = q.get('amount');
  var out = $('pmsg-out'), wasFixed = false;
  function show(t, ok) { out.textContent = t; out.className = 'msg ' + (ok ? 'ok' : 'bad'); }
  function svc() { return SERVICES.filter(function (s) { return s.name === sel.value; })[0] || SERVICES[0]; }

  CHECKOUT.config().then(function (c) {
    $('demo-note').style.display = c.demoPayments ? 'block' : 'none';
    if (c.paypalLink && c.paypalLink.indexOf('your-paypal-handle') < 0) {
      $('paypal').href = c.paypalLink; $('paypal').style.display = ''; $('paypal-na').style.display = 'none';
    }
  });

  // Fixed fee, free service, or a free-choice amount
  function sync() {
    var s = svc(), amt = $('pamt');
    $('mar-note').style.display = s.name === MARRIAGE ? 'block' : 'none';
    $('pay').style.display = s.name === MARRIAGE ? 'none' : '';
    $('amt-wrap').style.display = s.free ? 'none' : '';
    amt.readOnly = !!s.fee;
    if (s.fee) { amt.value = s.fee; $('amt-note').textContent = 'Fixed fee for this service.'; }
    else { if (wasFixed) amt.value = 1000; $('amt-note').textContent = 'Enter the amount agreed with our numerologist (minimum Rs 100).'; }
    wasFixed = !!s.fee;
    $('pay').textContent = s.free ? 'Request free help' : 'Pay & book';
  }
  sel.addEventListener('change', sync); sync();

  $('pform').addEventListener('submit', function (e) {
    e.preventDefault();
    var s = svc(), btn = $('pay'), who = { service: s.name, name: $('pname').value.trim(), phone: $('pphone').value.trim(), email: $('pemail').value.trim() };
    out.className = 'msg';
    btn.disabled = true;
    CHECKOUT.createOrder({
      service: s.name, name: who.name, phone: who.phone, email: who.email, amount: Number($('pamt').value), dob: $('pdob').value, mode: $('pmode').value, message: $('pmsg').value,
      website: document.querySelector('#pform [name=website]').value,
    }).then(function (d) {
      return d.free ? d.order : CHECKOUT.pay(d.id, who);
    }).then(function (order) {
      $('pform').style.display = 'none'; out.className = 'msg';
      var d = $('pdone'); d.style.display = '';
      d.innerHTML = '<div class="msg ok" style="display:block"><b>' + (order.payStatus === 'free' ? 'Request received.' : 'Payment received. Thank you!') + '</b><br>Our numerologist will contact you on ' + who.phone.replace(/[<>&"']/g, '') + ' shortly.</div>' +
        '<p><a class="btn sm" target="_blank" rel="noopener" href="/api/orders/' + order.id + '/receipt.pdf">Download your receipt (PDF)</a></p>';
    }).catch(function (err) { show(err.message || 'Something went wrong.', false); })
      .then(function () { btn.disabled = false; });
  });
})();
