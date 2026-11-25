(function () {
  var RAD = Math.PI / 180;
  // Chaldean order of the horas, and the lord of each weekday (Sunday = 0)
  var ORDER = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];
  var DAY_LORD = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var P = {
    Sun: { en: 'Surya (Ravi)', te: 'రవి', good: false, use: 'Authority, government work, health, father figures' },
    Moon: { en: 'Chandra', te: 'చంద్ర', good: true, use: 'Travel, public dealings, family, emotional matters' },
    Mars: { en: 'Kuja (Mangala)', te: 'కుజ', good: false, use: 'Property, courage, sport, technical or heavy work' },
    Mercury: { en: 'Budha', te: 'బుధ', good: true, use: 'Business, study, writing, communication, contracts' },
    Jupiter: { en: 'Guru', te: 'గురు', good: true, use: 'Education, advice, new beginnings, auspicious work' },
    Venus: { en: 'Shukra', te: 'శుక్ర', good: true, use: 'Marriage talks, arts, purchases, relationships' },
    Saturn: { en: 'Shani', te: 'శని', good: false, use: 'Routine, patient and long-term work, service' }
  };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAYS_TE = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];
  var CITIES = [
    ['Bengaluru', 12.9716, 77.5946], ['Hyderabad', 17.385, 78.4867], ['Vijayawada', 16.5062, 80.648],
    ['Visakhapatnam', 17.6868, 83.2185], ['Tirupati', 13.6288, 79.4192], ['Chennai', 13.0827, 80.2707],
    ['Mumbai', 19.076, 72.8777], ['Pune', 18.5204, 73.8567], ['Ahmedabad', 23.0225, 72.5714],
    ['Delhi', 28.6139, 77.209], ['Kolkata', 22.5726, 88.3639]
  ];
  var IST = 'Asia/Kolkata';
  var browserTz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || IST;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Sunrise and sunset (NOAA algorithm) for the calendar date y-m-d at the given place; returns UTC milliseconds
  function sunTimes(y, m, d, lat, lon) {
    var midnight = Date.UTC(y, m - 1, d);
    var jd = midnight / 86400000 + 2440587.5;
    var t = (jd + 0.5 - lon / 360 - 2451545) / 36525;
    for (var i = 0; i < 2; i++) {
      var l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
      var mm = 357.52911 + t * (35999.05029 - 0.0001537 * t);
      var e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
      var c = Math.sin(mm * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * mm * RAD) * (0.019993 - 0.000101 * t) + Math.sin(3 * mm * RAD) * 0.000289;
      var trueLong = l0 + c;
      var omega = 125.04 - 1934.136 * t;
      var lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
      var eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
      var eps = eps0 + 0.00256 * Math.cos(omega * RAD);
      var decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
      var y2 = Math.pow(Math.tan(eps * RAD / 2), 2);
      var eq = 4 / RAD * (y2 * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(mm * RAD) + 4 * e * y2 * Math.sin(mm * RAD) * Math.cos(2 * l0 * RAD) - 0.5 * y2 * y2 * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * mm * RAD));
      var cosH = (Math.cos(90.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
      if (cosH > 1 || cosH < -1) return null;
      var ha = Math.acos(cosH) / RAD;
      var noon = 720 - 4 * lon - eq;
      var rise = noon - 4 * ha, set = noon + 4 * ha;
      t = (jd + 0.5 - lon / 360 + (noon / 1440 - 0.5) - 2451545) / 36525;
    }
    return { rise: midnight + Math.round(rise) * 60000, set: midnight + Math.round(set) * 60000 };
  }

  function fmt(ms, tz) {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date(Math.round(ms / 60000) * 60000));
  }
  function ymdIn(ms, tz) {
    var p = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(new Date(ms)).split('-');
    return [+p[0], +p[1], +p[2]];
  }

  function build(y, m, d, lat, lon) {
    var today = sunTimes(y, m, d, lat, lon);
    var next = sunTimes(y, m, d + 1, lat, lon);
    if (!today || !next) return null;
    var wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    var start = ORDER.indexOf(DAY_LORD[wd]);
    var dayLen = (today.set - today.rise) / 12, nightLen = (next.rise - today.set) / 12;
    var list = [];
    for (var i = 0; i < 24; i++) {
      var isDay = i < 12;
      var from = isDay ? today.rise + i * dayLen : today.set + (i - 12) * nightLen;
      list.push({ planet: ORDER[(start + i) % 7], from: from, to: from + (isDay ? dayLen : nightLen), day: isDay });
    }
    return { wd: wd, rise: today.rise, set: today.set, nextRise: next.rise, horas: list };
  }

  var state = { lat: 12.9716, lon: 77.5946, tz: IST, place: 'Bengaluru', ymd: null, auto: true };
  var timer;

  function row(h, nowMs, tz) {
    var p = P[h.planet];
    var cur = nowMs >= h.from && nowMs < h.to;
    return '<tr class="' + (cur ? 'hora-now ' : '') + (p.good ? 'hora-good' : 'hora-plain') + '"><td><b>' + p.te + '</b> <span class="muted">' + p.en + '</span>' + (cur ? ' <span class="hora-badge">Now</span>' : '') + '</td><td class="hora-t">' + fmt(h.from, tz) + ' &ndash; ' + fmt(h.to, tz) + '</td><td class="hora-use">' + p.use + '</td></tr>';
  }

  function render() {
    var nowMs = Date.now();
    var tz = state.tz;
    var ymd = state.ymd;
    if (state.auto) {
      ymd = ymdIn(nowMs, tz);
      var todays = sunTimes(ymd[0], ymd[1], ymd[2], state.lat, state.lon);
      if (todays && nowMs < todays.rise) ymd = ymdIn(Date.UTC(ymd[0], ymd[1] - 1, ymd[2] - 1, 12), 'UTC');
      $('h-date').value = ymd[0] + '-' + pad(ymd[1]) + '-' + pad(ymd[2]);
    }
    var data = build(ymd[0], ymd[1], ymd[2], state.lat, state.lon);
    var out = $('hora-out');
    if (!data) {
      out.innerHTML = '<div class="msg bad">The sun does not rise or set on this date at this location, so horas cannot be calculated.</div>';
      return;
    }
    var cur = data.horas.filter(function (h) { return nowMs >= h.from && nowMs < h.to; })[0];
    var head = '<div class="card hora-head"><div><b>' + DAYS_TE[data.wd] + '</b> &middot; ' + DAYS[data.wd] + ', ' + ymd[2] + '/' + ymd[1] + '/' + ymd[0] + ' &middot; ' + state.place + '</div>' +
      '<div class="muted">Sunrise <b>' + fmt(data.rise, tz) + '</b> &nbsp; Sunset <b>' + fmt(data.set, tz) + '</b> &nbsp; Next sunrise <b>' + fmt(data.nextRise, tz) + '</b></div>';
    if (cur) {
      var left = Math.max(0, Math.round((cur.to - nowMs) / 60000));
      head += '<div class="hora-cur"><span>Running now</span> <b>' + P[cur.planet].te + ' ' + P[cur.planet].en + '</b> &nbsp;' + fmt(cur.from, tz) + ' &ndash; ' + fmt(cur.to, tz) + ' <em>(' + left + ' min left)</em></div>';
    }
    head += '</div>';
    var th = '<thead><tr><th>Hora</th><th>Time</th><th>Suited to</th></tr></thead>';
    var dayRows = data.horas.filter(function (h) { return h.day; }).map(function (h) { return row(h, nowMs, tz); }).join('');
    var nightRows = data.horas.filter(function (h) { return !h.day; }).map(function (h) { return row(h, nowMs, tz); }).join('');
    out.innerHTML = head +
      '<div class="grid grid2" style="margin-top:14px"><div><h3 class="hora-h">Day &middot; పగలు</h3><table class="dt hora-tbl">' + th + '<tbody>' + dayRows + '</tbody></table></div>' +
      '<div><h3 class="hora-h">Night &middot; రాత్రి</h3><table class="dt hora-tbl">' + th + '<tbody>' + nightRows + '</tbody></table></div></div>';
  }

  function setPlace(name, lat, lon, tz) {
    state.place = name; state.lat = lat; state.lon = lon; state.tz = tz;
    render();
  }

  function shiftDate(days) {
    var base = state.ymd || ymdIn(Date.now(), state.tz);
    state.auto = false;
    state.ymd = ymdIn(Date.UTC(base[0], base[1] - 1, base[2] + days, 12), 'UTC');
    $('h-date').value = state.ymd[0] + '-' + pad(state.ymd[1]) + '-' + pad(state.ymd[2]);
    render();
  }

  function init() {
    var sel = $('h-city');
    sel.innerHTML = CITIES.map(function (c, i) { return '<option value="' + i + '">' + c[0] + '</option>'; }).join('') + '<option value="custom">Other (enter latitude and longitude)</option>';
    sel.addEventListener('change', function () {
      if (sel.value === 'custom') { $('h-custom').hidden = false; return; }
      $('h-custom').hidden = true;
      var c = CITIES[+sel.value];
      setPlace(c[0], c[1], c[2], IST);
    });
    $('h-apply').addEventListener('click', function () {
      var lat = parseFloat($('h-lat').value), lon = parseFloat($('h-lon').value);
      if (!(lat >= -66 && lat <= 66 && lon >= -180 && lon <= 180)) { alert('Enter a latitude between -66 and 66 and a longitude between -180 and 180.'); return; }
      setPlace('Lat ' + lat + ', Lon ' + lon, lat, lon, browserTz);
    });
    $('h-geo').addEventListener('click', function () {
      if (!navigator.geolocation) { alert('Your browser cannot share its location. Pick a city instead.'); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        sel.value = 'custom'; $('h-custom').hidden = false;
        $('h-lat').value = pos.coords.latitude.toFixed(4); $('h-lon').value = pos.coords.longitude.toFixed(4);
        setPlace('Your location', pos.coords.latitude, pos.coords.longitude, browserTz);
      }, function () { alert('Could not get your location. Pick a city instead.'); });
    });
    $('h-date').addEventListener('change', function () {
      var v = $('h-date').value.split('-');
      if (v.length !== 3) return;
      state.auto = false; state.ymd = [+v[0], +v[1], +v[2]]; render();
    });
    $('h-prev').addEventListener('click', function () { shiftDate(-1); });
    $('h-next').addEventListener('click', function () { shiftDate(1); });
    $('h-today').addEventListener('click', function () { state.auto = true; state.ymd = null; render(); });
    render();
    timer = setInterval(function () { if (state.auto) render(); }, 30000);
  }

  window.HORA = { sunTimes: sunTimes, build: build, fmt: fmt };
  if (document.getElementById('hora-out')) init();
})();
