(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $('mform'), msg = $('mmsg'), btn = $('mpay');
  var SERVICE = 'Marriage Compatibility';
  var fee = SERVICES.filter(function (s) { return s.name === SERVICE; })[0].fee;
  $('fee').innerHTML = '&#8377;' + fee.toLocaleString('en-IN');
  btn.textContent = 'Pay \u20B9' + fee.toLocaleString('en-IN') + ' & get the matching report';
  CHECKOUT.config().then(function (c) { $('demo-note').style.display = c.demoPayments ? 'block' : 'none'; });

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var today = new Date(), max = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
  ['g', 'b'].forEach(function (p) {
    $(p + '-dob').max = max;
    $(p + '-unk').addEventListener('change', function () { $(p + '-tob').disabled = this.checked; });
  });
  function say(t, ok) { msg.textContent = t; msg.className = 'msg ' + (ok ? 'ok' : 'bad'); }

  function person(p) {
    return { name: $(p + '-name').value.trim(), dob: $(p + '-dob').value, tob: $(p + '-tob').value, tobUnknown: $(p + '-unk').checked, pob: $(p + '-pob').value.trim() };
  }

  function result(order, who) {
    $('mform-wrap').hidden = true;
    var el = $('mresult'); el.hidden = false;
    el.innerHTML =
      '<div class="msg ok" style="display:block"><b>Payment received. Thank you!</b><br>We have your details for ' + esc(who.groom) + ' and ' + esc(who.bride) + '. Our numerologist will study the horoscopes and contact you on ' + esc(who.phone) + ' or at ' + esc(who.email) + ' to discuss the match.</div>' +
      '<p><a class="btn" target="_blank" rel="noopener" href="/api/orders/' + order.id + '/receipt.pdf">Download your receipt (PDF)</a> <a class="btn alt" href="marriage.html">Match another pair</a></p>' +
      '<p class="disclaimer">Guidance for reflection and learning only, not a prediction or guarantee. A marriage decision should also rest on facts, family discussion and professional advice.</p>';
    window.scrollTo(0, 0);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var who = { service: SERVICE, name: $('c-name').value.trim(), phone: $('c-phone').value.trim(), email: $('c-email').value.trim() };
    var g = person('g'), b = person('b');
    msg.className = 'msg'; btn.disabled = true;
    CHECKOUT.createOrder({ service: SERVICE, name: who.name, phone: who.phone, email: who.email, marriage: { groom: g, bride: b }, website: form.querySelector('[name=website]').value })
      .then(function (d) { return CHECKOUT.pay(d.id, who); })
      .then(function (order) { result(order, { phone: who.phone, email: who.email, groom: g.name, bride: b.name }); })
      .catch(function (err) { say(err.message || 'Something went wrong. Please try again.', false); })
      .then(function () { btn.disabled = false; });
  });
})();
