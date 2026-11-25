(function () {
  var $ = function (id) { return document.getElementById(id); };
  var sel = $('service');
  SERVICES.forEach(function (s) { var o = document.createElement('option'); o.textContent = s.name; sel.appendChild(o); });
  var other = document.createElement('option'); other.textContent = 'Other'; sel.appendChild(other);
  var pre = new URLSearchParams(location.search).get('service');
  if (pre) sel.value = pre;

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }
  function show(el, text, ok) { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'bad'); }

  $('f').addEventListener('submit', function (e) {
    e.preventDefault();
    document.querySelectorAll('.err').forEach(function (x) { x.textContent = ''; });
    var data = {};
    new FormData($('f')).forEach(function (v, k) { data[k] = v; });
    data.source = 'contact'; data.otpToken = (window.OTP_GATE && OTP_GATE.token) || '';
    $('submit').disabled = true;
    post('/api/enquiry', data).then(function (d) {
      $('submit').disabled = false;
      if (d.ok) { $('f').reset(); if (window.OTP_GATE && OTP_GATE.phone) $('phone').value = OTP_GATE.phone; show($('msg'), 'Thank you! Your enquiry has been received. We will contact you shortly.', true); return; }
      if (d.errors) Object.keys(d.errors).forEach(function (k) { var el = document.querySelector('[data-e="' + k + '"]'); if (el) el.textContent = d.errors[k]; });
      show($('msg'), d.error || 'Please correct the highlighted fields.', false);
    }).catch(function () { $('submit').disabled = false; show($('msg'), 'Network error. Please call us directly.', false); });
  });
})();
