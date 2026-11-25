(function () {
  var form = document.getElementById('hs-form');
  if (!form || !window.NAKSHATRA || !window.NUMEROLOGY) return;
  var out = document.getElementById('hs-out');

  // Traditional Gana of each Nakshatra, in the same order as NAKSHATRA.LIST
  var GANA_OF = ['Deva', 'Manushya', 'Rakshasa', 'Manushya', 'Deva', 'Manushya', 'Deva', 'Deva', 'Rakshasa', 'Rakshasa', 'Manushya', 'Manushya', 'Deva', 'Rakshasa', 'Deva', 'Rakshasa', 'Deva', 'Rakshasa', 'Rakshasa', 'Manushya', 'Manushya', 'Deva', 'Rakshasa', 'Rakshasa', 'Manushya', 'Manushya', 'Deva'];
  var GANA = {
    Deva: { label: 'Deva (divine)', text: 'Gentle, kind and generous, with a love of learning and service.', pair: 'Deva and Manushya are traditionally seen as a comfortable pair. Same Gana is considered the most harmonious.' },
    Manushya: { label: 'Manushya (human)', text: 'Balanced, practical and sociable, mixing ambition with sensitivity.', pair: 'Manushya pairs well with Manushya and with Deva. Rakshasa partners are traditionally matched with care.' },
    Rakshasa: { label: 'Rakshasa (fierce)', text: 'Bold, intense and strong-willed, with great drive and direct speech.', pair: 'Rakshasa is most harmonious with Rakshasa. Matching with Deva is traditionally treated with caution.' },
  };
  // [Sanskrit, English, ruling planet]
  var RASHI = [['Mesha', 'Aries', 'Mars'], ['Vrishabha', 'Taurus', 'Venus'], ['Mithuna', 'Gemini', 'Mercury'], ['Karka', 'Cancer', 'Moon'], ['Simha', 'Leo', 'Sun'], ['Kanya', 'Virgo', 'Mercury'],
    ['Tula', 'Libra', 'Venus'], ['Vrischika', 'Scorpio', 'Mars'], ['Dhanu', 'Sagittarius', 'Jupiter'], ['Makara', 'Capricorn', 'Saturn'], ['Kumbha', 'Aquarius', 'Saturn'], ['Meena', 'Pisces', 'Jupiter']];
  // South Indian chart: grid position [row, col] of each Rashi
  var CHART = [[1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [3, 1], [2, 1], [1, 1]];

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  var unknown = form.querySelector('[name=tobUnknown]'), tob = form.querySelector('[name=tob]');
  unknown.addEventListener('change', function () { tob.disabled = unknown.checked; tob.required = !unknown.checked; });
  var today = new Date(); form.querySelector('[name=dob]').max = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

  function chart(rashiIdx) {
    var cells = RASHI.map(function (r, i) {
      var p = CHART[i], hit = i === rashiIdx;
      return '<div class="hc' + (hit ? ' hit' : '') + '" style="grid-row:' + p[0] + ';grid-column:' + p[1] + '"><small>' + (i + 1) + ' ' + r[0] + '</small>' + (hit ? '<b>Mo</b>' : '') + '</div>';
    }).join('');
    return '<div class="hchart" role="img" aria-label="Moon in ' + RASHI[rashiIdx][0] + '">' + cells + '<div class="hmid"><b>Chandra Rashi</b><span>Moon in ' + RASHI[rashiIdx][0] + '</span></div></div>';
  }

  function planets(mark) {
    var M = NUMEROLOGY.MEAN, h = '';
    for (var n = 1; n <= 9; n++) {
      var pl = M[n].planet, tags = [];
      if (mark.birth === n) tags.push('Birth number');
      if (mark.life === n) tags.push('Life path');
      if (mark.name === n) tags.push('Name number');
      if (mark.nak === pl) tags.push('Nakshatra lord');
      if (mark.rashi === pl) tags.push('Moon sign lord');
      h += '<div class="pl' + (tags.length ? ' on' : '') + '"><span class="pn">' + n + '</span><b>' + pl + '</b><small>' + (tags.join(' &middot; ') || M[n].title) + '</small></div>';
    }
    return h;
  }

  function render(d) {
    var M = NUMEROLOGY.MEAN, bm = M[d.birth], lm = M[NUMEROLOGY.reduce(d.life, false)];
    var g = GANA[d.gana], ri = RASHI[d.rashi];
    var who = esc(d.name) + ' &middot; ' + d.gender;
    var h = '<div class="hs-head"><div><small>Horoscope in Numerology for</small><h3>' + who + '</h3><span class="muted">Born ' + esc(d.dobText) + (d.tobUnknown ? ' (time not known, noon used)' : ' at ' + d.tob) + (d.pob ? ', ' + esc(d.pob) : '') + '</span></div></div>' +
      '<div class="hs-cards">' +
      '<div class="hc1"><small>Moon Nakshatra</small><b>' + d.nk.name + '</b><span>Pada ' + d.pada + ' &middot; ' + d.nk.ruler + ' ruled</span><em>Deity: ' + d.nk.deity + '</em></div>' +
      '<div class="hc1"><small>Moon sign (Rashi)</small><b>' + ri[0] + '</b><span>' + ri[1] + ' &middot; lord ' + ri[2] + '</span><em>Name sound: ' + d.sound + '</em></div>' +
      '<div class="hc1"><small>Gana</small><b>' + g.label + '</b><span>' + g.text + '</span></div>' +
      '<div class="hc1"><small>Birth number</small><b>' + d.birth + ' &middot; ' + bm.planet + '</b><span>' + bm.title + '. ' + bm.traits + '</span><em>Lucky day: ' + bm.day + ' &middot; colour: ' + bm.color + '</em></div>' +
      '<div class="hc1"><small>Life path number</small><b>' + d.life + ' &middot; ' + lm.planet + '</b><span>' + lm.title + '. ' + lm.traits + '</span></div>' +
      (d.destiny ? '<div class="hc1"><small>Name number (destiny)</small><b>' + d.destiny + ' &middot; ' + M[NUMEROLOGY.reduce(d.destiny, false)].planet + '</b><span>' + M[NUMEROLOGY.reduce(d.destiny, false)].traits + '</span></div>' : '') +
      '</div>' +
      '<div class="hs-two"><div><h4>Moon chart</h4>' + chart(d.rashi) + '</div><div><h4>The 9 planets and numbers 1&ndash;9</h4><div class="hplanets">' + planets(d.mark) + '</div></div></div>' +
      '<div class="hs-note"><b>Gana match tip for a ' + d.gender.toLowerCase() + ' native.</b> ' + g.pair + ' Full marriage matching also needs your partner&rsquo;s chart.</div>' +
      (d.edge ? '<p class="hs-warn">Your Moon is very close to a Nakshatra boundary. Please confirm the exact birth time with your numerologist.</p>' : '') +
      (d.tobUnknown ? '<p class="hs-warn">Without a birth time the Moon&rsquo;s Nakshatra can be off by one. Check the time on your birth record.</p>' : '') +
      '<div class="acts"><a class="btn sm" href="contact.html?service=Personal%20Numerology%20Reading">Book a full reading</a> <a class="btn sm yellow" target="_blank" rel="noopener" href="' + LEADS.wa('Hello, I used the Horoscope in Numerology form on your website. Moon Nakshatra ' + d.nk.name + ' pada ' + d.pada + ', birth number ' + d.birth + ', life path ' + d.life + '. I would like a personal reading.') + '">Chat on WhatsApp</a> <a class="btn sm alt" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('My Moon Nakshatra is ' + d.nk.name + ' (pada ' + d.pada + '), Gana ' + d.gana + ', birth number ' + d.birth + '. Find yours free: ' + location.origin + '/') + '">Share</a></div>' +
      '<p class="disclaimer">For learning only, not a prediction or guarantee. The Moon position is approximate (Lahiri ayanamsa) and the birth time is taken as Indian Standard Time. A full Kundali also needs the ascendant and the other planets, which a personal reading covers.</p>';
    out.innerHTML = h; out.hidden = false;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var msg = document.getElementById('hs-msg'), btn = form.querySelector('button[type=submit]');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    var f = new FormData(form), name = String(f.get('name') || '').trim(), gender = f.get('gender'), dob = String(f.get('dob') || '');
    var unk = !!f.get('tobUnknown'), time = unk ? '12:00' : String(f.get('tob') || ''), pob = String(f.get('pob') || '').trim();
    var p = dob.split('-').map(Number), t = time.split(':').map(Number);
    if (name.length < 2) { msg.textContent = 'Please enter your name.'; return; }
    if (!gender) { msg.textContent = 'Please choose Male or Female.'; return; }
    if (String(f.get('phone') || '').replace(/\D/g, '').length < 10) { msg.textContent = 'Please enter a valid 10-digit mobile number.'; return; }
    if (p.length !== 3 || !p[0] || p[0] < 1900 || new Date(dob) > new Date()) { msg.textContent = 'Please enter a valid date of birth.'; return; }
    if (t.length !== 2 || isNaN(t[0])) { msg.textContent = 'Please enter your time of birth, or tick "I do not know".'; return; }

    var verify = window.OTP_GATE ? OTP_GATE.ensure(String(f.get('phone'))) : Promise.resolve('');
    btn.disabled = true;
    verify.then(function (otpToken) { run(otpToken); }, function () { btn.disabled = false; msg.textContent = 'Please verify your mobile number to see your result.'; msg.className = 'hs-msg bad'; });

    function run(otpToken) {
    var n = NAKSHATRA.birth(p[0], p[1] - 1, p[2], t[0], t[1]), nk = NAKSHATRA.info(n.idx);
    var rashi = Math.floor((n.idx * 4 + n.pada - 1) / 9), birth = NUMEROLOGY.birthNumber(p[2]), life = NUMEROLOGY.lifePath(p[0], p[1], p[2]);
    var nn = NUMEROLOGY.nameNumbers(name), destiny = nn.total ? nn.destiny : 0;
    var d = {
      name: name, gender: gender, pob: pob, tob: time, tobUnknown: unk, nk: nk, pada: n.pada, sound: nk.sound(n.pada), rashi: rashi, gana: GANA_OF[n.idx], birth: birth, life: life, destiny: destiny,
      edge: n.edge < 0.1, dobText: p[2] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p[1] - 1] + ' ' + p[0],
      mark: { birth: birth, life: NUMEROLOGY.reduce(life, false), name: destiny ? NUMEROLOGY.reduce(destiny, false) : 0, nak: nk.ruler, rashi: RASHI[rashi][2] },
    };
    render(d);

    var summary = 'Moon Nakshatra ' + nk.name + ' pada ' + n.pada + ', Rashi ' + RASHI[rashi][0] + ', Gana ' + d.gana + ', birth number ' + birth + ', life path ' + life + (destiny ? ', name number ' + destiny : '') + '.';
    btn.disabled = true;
    fetch('/api/horoscope', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, phone: f.get('phone'), gender: gender, dob: dob, tob: unk ? '' : time, tobUnknown: unk, pob: pob, website: f.get('website'), summary: summary, otpToken: otpToken }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      msg.textContent = res.ok ? '' : (res.error || '');
      msg.className = res.ok ? 'hs-msg' : 'hs-msg bad';
      if (res.ok) { msg.textContent = 'Your result is below. We have saved your details and may call you about a personal reading.'; msg.className = 'hs-msg ok'; }
    }).catch(function () {}).then(function () { btn.disabled = false; });
    }
  });
})();
