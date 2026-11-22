(function () {
  // ===== Edit these =====
  var SITE = {
    brand: 'Nagaika, Nakuli Numerology',
    phone: '9845610894',
    whatsapp: '919845610894',
    email: 'anand@arninvest.in',
    address: '2, P2, 4th Floor, No. 95, Gold Signature, Mosque Road, Fraser Town, Bengaluru, Karnataka - 560005',
    hours: 'Mon-Sat, 10:00 AM - 7:00 PM (please confirm by call)',
    social: { Instagram: '#', Facebook: '#', LinkedIn: '#', YouTube: '#' },
  };
  window.SITE = SITE;

  var cur = (location.pathname.split('/').pop() || 'index.html');
  var isHome = cur === 'index.html';

  // ===== Language support (Google Translate, loaded only when a non-English language is chosen) =====
  var LANGS = [['en', 'English'], ['hi', '\u0939\u093F\u0928\u094D\u0926\u0940'], ['kn', '\u0C95\u0CA8\u0CCD\u0CA8\u0CA1'], ['te', '\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41'], ['ta', '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD'],
    ['ml', '\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02'], ['mr', '\u092E\u0930\u093E\u0920\u0940'], ['gu', '\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0'], ['bn', '\u09AC\u09BE\u0982\u09B2\u09BE']];
  function readLang() {
    var m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]*\/([a-z]{2})/);
    return m && LANGS.some(function (l) { return l[0] === m[1]; }) ? m[1] : 'en';
  }
  var curLang = readLang();
  function setLang(code) {
    var gone = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = gone;
    if (location.hostname.indexOf('.') > -1) document.cookie = gone + '; domain=' + location.hostname;
    if (code !== 'en') document.cookie = 'googtrans=/en/' + code + '; path=/';
    location.reload();
  }
  window.gtInit = function () {
    new google.translate.TranslateElement({ pageLanguage: 'en', includedLanguages: LANGS.slice(1).map(function (l) { return l[0]; }).join(','), autoDisplay: false }, 'google_translate_element');
  };

  // Sanskrit terms (tithi, nakshatra...) are locked from machine translation and shown in the reader's own script from a fixed table.
  window.sk = function (t) { return '<span class="sk notranslate" translate="no">' + t + '</span>'; };
  var skLoading = false;
  window.skApply = function (root) {
    if (curLang === 'en') return;
    if (!window.TERMS_I18N) {
      if (skLoading) return;
      skLoading = true;
      var ts = document.createElement('script'); ts.src = 'js/terms-i18n.js';
      ts.onload = function () { window.skApply(); };
      return document.head.appendChild(ts);
    }
    var table = window.TERMS_I18N[curLang] || {};
    (root || document).querySelectorAll('.sk').forEach(function (el) {
      if (!el.hasAttribute('data-o')) el.setAttribute('data-o', el.textContent);
      el.textContent = el.getAttribute('data-o').split(' ').map(function (w) { return table[w] || w; }).join(' ');
    });
  };
  if (curLang !== 'en') {
    var gd = document.createElement('div'); gd.id = 'google_translate_element'; gd.style.display = 'none'; document.body.appendChild(gd);
    var gs = document.createElement('script'); gs.src = 'https://translate.google.com/translate_a/element.js?cb=gtInit'; gs.async = true; document.head.appendChild(gs);
  }
  var wa = 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent('Hello, I would like a numerology consultation');
  var socialHtml = Object.keys(SITE.social).map(function (k) {
    return '<a data-net="' + k.toLowerCase() + '" href="' + SITE.social[k] + '" target="_blank" rel="noopener" aria-label="' + k + '">' + k + '</a>';
  }).join('');

  // Menu: [label, href, children?]
  var MENU = [
    ['Home', 'index.html'],
    ['Nakshatra', 'nakshatra.html', [['Find Your Nakshatra', 'nakshatra.html#find'], ['Today\u2019s Nakshatra', 'nakshatra.html#today'], ['The 27 Nakshatras', 'nakshatra.html#list'], ['Why Study Nakshatras?', 'nakshatra.html#why'], ['Numerology Numbers 1-9', 'nakshatra.html#numbers'], ['Study Worksheet', 'nakshatra.html#worksheet'], ['Study Guide (PDF)', 'downloads/Nakshatra_Numerology_Study_Guide_English.pdf']]],
    ['Numerology', 'tools.html', [['Life Path &amp; Birth Number', 'tools.html'], ['Name Number', 'tools.html?tool=name'], ['Mobile Number', 'tools.html?tool=mobile'], ['Vehicle Number', 'tools.html?tool=vehicle'], ['Meaning of Numbers 1-9', 'blog.html']]],
    ['Services', 'services.html', [['Nakshatra &amp; Numerology Reading', 'payment.html?service=Nakshatra%20%26%20Numerology%20Reading'], ['Marriage Compatibility', 'marriage.html'], ['Nadi Astrology', 'nadi.html'], ['Career Guidance', 'payment.html?service=Career%20Guidance'], ['Naming Consultation', 'payment.html?service=Naming%20Consultation'], ['Corporate Consultation', 'payment.html?service=Corporate%20Consultation'], ['All Services', 'services.html']]],
    ['Blog', 'blog.html'], ['Videos', 'videos.html'], ['Gallery', 'gallery.html'],
    ['About', 'about.html', [['About Us', 'about.html'], ['Why Choose Us', 'why-choose-us.html']]],
    ['Contact', 'contact.html'], ['Pay Online', 'payment.html'],
  ];
  var SUB = [['Marriage Matching', 'marriage.html'], ['Nadi Astrology', 'nadi.html'], ['Horoscope in Numerology', 'index.html#horoscope'], ['Find Your Nakshatra', 'nakshatra.html#find'], ['Today\u2019s Nakshatra', 'nakshatra.html#today'], ['The 27 Nakshatras', 'nakshatra.html#list'], ['Life Path Calculator', 'tools.html'], ['Name Number', 'tools.html?tool=name'], ['Mobile Number', 'tools.html?tool=mobile'],
    ['Vehicle Number', 'tools.html?tool=vehicle'], ['Free Consultation', 'contact.html?service=Free%20Consultation%20for%20People%20in%20Need']];

  function isActive(item) {
    var all = [item[1]].concat((item[2] || []).map(function (c) { return c[1]; }));
    return all.some(function (h) { return h.split(/[?#]/)[0] === cur; });
  }

  var topbar = '<div id="topbar"><div class="in"><div class="links"><a href="nakshatra.html#find">' + sk('Nakshatra') + '</a> <a href="tools.html">Life Path</a> <a href="tools.html?tool=mobile">Lucky Number</a> <a href="nakshatra.html#today">Today&rsquo;s ' + sk('Nakshatra') + '</a> <a href="contact.html?service=Free%20Consultation%20for%20People%20in%20Need">Free Consultation</a></div>' +
    '<div class="acts"><a class="pill" href="' + wa + '" target="_blank" rel="noopener"><i></i>Chat with Numerologist</a><a class="pill dk" href="contact.html">Book Consultation</a></div></div></div>';

  var header = '<header class="site"><a class="brand notranslate" translate="no" href="index.html"><img class="logo" src="img/favicon.svg"   alt="" onerror="this.remove()">  <span>Nagaika Nakuli<small>NAKSHATRA NUMEROLOGY, BENGALURU</small></span></a>' +
    '<div class="langbar notranslate" translate="no"><b>Read in:</b>' + LANGS.map(function (l) {
      return '<button type="button" data-lang="' + l[0] + '" class="' + (l[0] === curLang ? 'on' : '') + '" lang="' + l[0] + '">' + l[1] + '</button>';
    }).join(' ') + '<span class="lnote" id="lnote"' + (curLang === 'en' ? ' hidden' : '') + '>Translated automatically by Google Translate</span></div></header>' +
    '<button id="menu-btn" aria-label="Menu">&#9776; Menu</button>' +
    '<nav class="main" id="main-nav">' + MENU.map(function (m) {
      var dd = m[2];
      return '<div class="item"><a href="' + m[1] + '" class="' + (dd ? 'dd ' : '') + (isActive(m) ? 'active' : '') + '">' + m[0] + '</a>' +
        (dd ? '<div class="drop">' + dd.map(function (c) { return '<a href="' + c[1] + '">' + c[0] + '</a>'; }).join('') + '</div>' : '') + '</div>';
    }).join('') + '</nav>' +
    '<div class="subnav">' + SUB.map(function (s) { return '<a href="' + s[1] + '">' + s[0] + '</a>'; }).join('') + '</div>';

  var footer = '<footer class="site"><div class="links">' +
    MENU.map(function (m) { return '<a href="' + m[1] + '">' + m[0] + '</a>'; }).join(' ') + ' ' +
    '<a href="tools.html?tool=name">Name Number</a> <a href="nakshatra.html#list">The 27 Nakshatras</a> <a href="nakshatra.html#today">Today&rsquo;s Nakshatra</a> <a href="services.html">Naming Consultation</a></div>' +
    '<div class="cols"><div><b class="notranslate" translate="no">' + SITE.brand + '</b><br>Numerology &amp; Nakshatra Consultancy<br><span class="muted">Date of Birth Analysis | Personal Numerology | Nakshatra Study | Career, Education &amp; Future Guidance</span></div>' +
    '<div><b>Contact</b><br>' + SITE.address + '<br>Phone: <a href="tel:+91' + SITE.phone + '">' + SITE.phone + '</a><br>Email: <a href="mailto:' + SITE.email + '">' + SITE.email + '</a></div>' +
    '<div><b>Follow us</b><div class="social" style="margin-top:8px">' + socialHtml + '</div><p style="margin-top:14px">&copy; ' + new Date().getFullYear() + ' ' + SITE.brand + '</p></div></div>' +
    '<div class="disc">Numerology and Nakshatra consultations and the study material on this site are guidance and reflection based on traditional belief systems. They are not scientifically established predictions or guarantees of future outcomes. Nakshatra positions are calculated and approximate; confirm important details with a reliable calculator or an almanac.</div></footer>';

  // Wrap the page content inside the framed layout
  var kids = Array.prototype.slice.call(document.body.children).filter(function (el) { return el.tagName !== 'SCRIPT'; });
  var page = document.createElement('div'); page.className = 'page';
  page.innerHTML = header;
  var main = document.createElement('main'); main.id = 'content';
  kids.forEach(function (k) { main.appendChild(k); });
  var t = main.querySelector('.page-title h1');
  if (!isHome && t) page.insertAdjacentHTML('beforeend', '<div class="crumbs"><a href="index.html">Home</a> &raquo; ' + t.textContent + '</div>');
  page.appendChild(main);
  document.body.insertAdjacentHTML('afterbegin', topbar);
  document.getElementById('topbar').after(page);
  document.body.insertAdjacentHTML('beforeend', footer);
  document.getElementById('menu-btn').onclick = function () { document.getElementById('main-nav').classList.toggle('on'); };
  document.querySelectorAll('.langbar [data-lang]').forEach(function (b) {
    b.onclick = function () { if (b.dataset.lang !== curLang) setLang(b.dataset.lang); };
  });
  document.documentElement.lang = curLang;
  skApply();

  // If a photo file is missing, hide it instead of showing a broken image
  function hideBroken(el) {
    if (!el || el.tagName !== 'IMG' || el.classList.contains('logo')) return;
    (el.closest('[data-cat]') || el).style.display = 'none';
  }
  document.addEventListener('error', function (e) { hideBroken(e.target); }, true);
  window.addEventListener('load', function () {
    document.querySelectorAll('img').forEach(function (i) { if (i.complete && i.naturalWidth === 0) hideBroken(i); });
  });

  // Social links come from the admin dashboard (Settings tab)
  fetch('/api/settings').then(function (r) { return r.json(); }).then(function (s) {
    window.SITE_SETTINGS = s;
    document.querySelectorAll('a[data-net]').forEach(function (a) { var v = s[a.dataset.net]; if (v) a.href = v; });
    document.dispatchEvent(new Event('settings-ready'));
  }).catch(function () {});

  // Floating share bar, WhatsApp, chat, lightbox, popup
  var u = encodeURIComponent(location.href), tt = encodeURIComponent(document.title);
  document.body.insertAdjacentHTML('beforeend',
    '<div id="share" class="notranslate" translate="no"><button class="tg" id="share-tg" aria-label="Hide share buttons">&minus;</button>' +
    '<a class="yt" data-net="youtube" target="_blank" rel="noopener" aria-label="Our YouTube channel" title="YouTube" href="https://www.youtube.com/">&#9654;</a>' +
    '<a class="fb" target="_blank" rel="noopener" aria-label="Share on Facebook" href="https://www.facebook.com/sharer/sharer.php?u=' + u + '">f</a>' +
    '<a class="tw" target="_blank" rel="noopener" aria-label="Share on X" href="https://twitter.com/intent/tweet?url=' + u + '&text=' + tt + '">X</a>' +
    '<a class="li" target="_blank" rel="noopener" aria-label="Share on LinkedIn" href="https://www.linkedin.com/sharing/share-offsite/?url=' + u + '">in</a>' +
    '<a class="pi" target="_blank" rel="noopener" aria-label="Share on Pinterest" href="https://pinterest.com/pin/create/button/?url=' + u + '&description=' + tt + '">P</a>' +
    '<a class="im" target="_blank" rel="noopener" aria-label="Visit us on IndiaMART" title="IndiaMART" href="https://www.indiamart.com/firenetic-enterprises/?utm_source=Enqmailnew&utm_medium=email&utm_campaign=CatalogShare">iM</a>' +
    '<a class="ml" aria-label="Share by email" href="mailto:?subject=' + tt + '&body=' + u + '">&#9993;</a></div>' +
    '<a id="wa-btn" href="' + wa + '" target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp</a>' +
    '<div id="mbar"><a href="tel:+91' + SITE.phone + '">Call</a><a href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a><a href="contact.html">Book Now</a></div>' +
    '<button id="chat-btn" aria-label="Open chat">&#128172;</button>' +
    '<div id="chat"><header><b>Numerology Assistant</b><span id="chat-x">&#10005;</span></header><div id="chat-log"></div></div>' +
    '<div id="lightbox"></div>');
  document.getElementById('share-tg').onclick = function () { document.getElementById('share').classList.toggle('min'); };

  if (isHome && !sessionStorage.getItem('promo')) {
    document.body.insertAdjacentHTML('beforeend',
      '<div id="promo"><div class="pb"><button class="x" aria-label="Close">&times;</button><div class="top"><div class="om">\u0950</div></div>' +
      '<h2>Talk to our Numerologist</h2><p>13 years of experience in numerology and the Nakshatra framework. Consult in Bengaluru, or over WhatsApp and phone.</p>' +
      '<a class="btn" href="' + wa + '" target="_blank" rel="noopener">Chat on WhatsApp</a> <a class="btn alt" href="contact.html">Book Consultation</a></div></div>');
    var pr = document.getElementById('promo');
    var closePromo = function () { pr.classList.remove('on'); sessionStorage.setItem('promo', '1'); };
    pr.querySelector('.x').onclick = closePromo;
    pr.addEventListener('click', function (e) { if (e.target === pr) closePromo(); });
    pr.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closePromo); });
    setTimeout(function () { pr.classList.add('on'); }, 6000);
  }

  // ===== Lightbox =====
  var lb = document.getElementById('lightbox');
  lb.addEventListener('click', function () { lb.className = ''; lb.innerHTML = ''; });
  window.openLightbox = function (html) { lb.innerHTML = html; lb.className = 'on'; };
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('[data-lightbox]');
    if (img) { e.preventDefault(); openLightbox('<img src="' + img.getAttribute('data-lightbox') + '" alt="">'); }
  });

  // ===== Chatbot (decision tree from spec) =====
  var chat = document.getElementById('chat'), log = document.getElementById('chat-log'), started = false, lead = {};
  function bot(x) { var d = document.createElement('div'); d.className = 'b bot'; d.textContent = x; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  function me(x) { var d = document.createElement('div'); d.className = 'b me'; d.textContent = x; log.appendChild(d); }
  function opts(list, cb) {
    var w = document.createElement('div'); w.className = 'opts';
    list.forEach(function (o) {
      var b = document.createElement('button'); b.textContent = o;
      b.onclick = function () { w.remove(); me(o); cb(o); log.scrollTop = log.scrollHeight; };
      w.appendChild(b);
    });
    log.appendChild(w); log.scrollTop = log.scrollHeight;
  }
  function save() {
    fetch('/api/chat-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }).catch(function () {});
  }
  function link(text, href) {
    var d = document.createElement('div'); d.className = 'b bot';
    var a = document.createElement('a'); a.href = href; a.textContent = text; a.target = '_blank'; d.appendChild(a); log.appendChild(d);
  }
  function step1() {
    bot('What challenges are you currently facing?');
    opts(['Career Stagnation', 'Legal Delays', 'Exam Stress', 'Vehicle Bad Luck', 'Phone Number'], function (a) {
      lead.topic = a;
      bot('We understand these hurdles can be stressful. Our numerological analysis helps identify underlying numerical mismatches in your profile.');
      step2();
    });
  }
  function step2() {
    bot('How would you like us to assist you?');
    opts(['Personal Reading Report', 'Instant Chat Consultation', 'Document & Number Correction'], function (a) {
      lead.solution = a;
      bot('Great choice! Our solutions are tailored specifically to your birth date and name vibes to unblock growth.');
      step3();
    });
  }
  function step3() {
    bot('Which specific service area are you interested in?');
    opts(['Job/Career', 'Vehicle Number', 'Court Case', 'Exam Guidance'], function (a) {
      lead.service = a; save();
      bot('Connecting you with available time slots for our specialized consultants...');
      link('Chat on WhatsApp', 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent('Hello, I need help with ' + a + ' (' + lead.topic + ').'));
      link('Book via enquiry form', 'contact.html');
      opts(['Start over'], function () { lead = {}; step1(); });
    });
  }
  document.getElementById('chat-btn').onclick = function () {
    chat.classList.toggle('on');
    if (!started) { started = true; bot('Namaste! Welcome to ' + SITE.brand + '.'); step1(); }
  };
  document.getElementById('chat-x').onclick = function () { chat.classList.remove('on'); };

  // ===== Gallery filters =====
  var fb = document.querySelectorAll('.filters button');
  fb.forEach(function (b) {
    b.onclick = function () {
      fb.forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
      document.querySelectorAll('.gallery [data-cat]').forEach(function (it) {
        it.style.display = (b.dataset.f === 'all' || it.dataset.cat === b.dataset.f) ? '' : 'none';
      });
    };
  });

  // ===== Video placeholders =====
  document.querySelectorAll('[data-video]').forEach(function (el) {
    el.addEventListener('click', function () {
      var v = el.getAttribute('data-video');
      if (!v || v === '#') return openLightbox('<div class="card"><p>Video coming soon.</p></div>');
      openLightbox(/\.mp4($|\?)/.test(v) ? '<video src="' + v + '" controls autoplay></video>' : '<iframe src="' + v + '" allow="autoplay; encrypted-media" allowfullscreen></iframe>');
    });
  });
})();
