(function () {
  var IST = 5.5 * 3600000, DAY = 86400000, RAD = Math.PI / 180, SEG = 360 / 27;
  var CITIES = {
    bengaluru: { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
    delhi: { name: 'New Delhi', lat: 28.6139, lon: 77.209 },
    mumbai: { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
    chennai: { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
    hyderabad: { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
    kolkata: { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  };

  // [name, ruler (Vimshottari sequence), Pada 1-4 starting sounds, presiding deity] from the Nakshatra Numerology Study Guide; deities are the traditional ones named in classical texts
  var LIST = [
    ['Ashwini', 'Ketu', 'Chu · Che · Cho · La', 'Ashwini Kumaras'], ['Bharani', 'Venus', 'Li · Lu · Le · Lo', 'Yama'], ['Krittika', 'Sun', 'A · I · U · Ea', 'Agni'],
    ['Rohini', 'Moon', 'O · Va · Vi · Vu', 'Prajapati (Brahma)'], ['Mrigashira', 'Mars', 'Ve · Vo · Ka · Ki', 'Soma'], ['Ardra', 'Rahu', 'Ku · Gha · Ng · Chha', 'Rudra'],
    ['Punarvasu', 'Jupiter', 'Ke · Ko · Ha · Hi', 'Aditi'], ['Pushya', 'Saturn', 'Hu · He · Ho · Da', 'Brihaspati'], ['Ashlesha', 'Mercury', 'Di · Du · De · Do', 'Sarpas (Nagas)'],
    ['Magha', 'Ketu', 'Ma · Mi · Mu · Me', 'Pitris'], ['Purva Phalguni', 'Venus', 'Mo · Ta · Ti · Tu', 'Bhaga'], ['Uttara Phalguni', 'Sun', 'Te · To · Pa · Pi', 'Aryaman'],
    ['Hasta', 'Moon', 'Pu · Sha · Na · Tha', 'Savitar'], ['Chitra', 'Mars', 'Pe · Po · Ra · Ri', 'Tvashta (Vishvakarma)'], ['Swati', 'Rahu', 'Ru · Re · Ro · Ta', 'Vayu'],
    ['Vishakha', 'Jupiter', 'Ti · Tu · Te · To', 'Indra and Agni'], ['Anuradha', 'Saturn', 'Na · Ni · Nu · Ne', 'Mitra'], ['Jyeshtha', 'Mercury', 'No · Ya · Yi · Yu', 'Indra'],
    ['Mula', 'Ketu', 'Ye · Yo · Bha · Bhi', 'Nirriti'], ['Purva Ashadha', 'Venus', 'Bhu · Dha · Pha · Dha', 'Apah'], ['Uttara Ashadha', 'Sun', 'Bhe · Bho · Ja · Ji', 'Vishvedevas'],
    ['Shravana', 'Moon', 'Ju · Je · Jo · Gha', 'Vishnu'], ['Dhanishta', 'Mars', 'Ga · Gi · Gu · Ge', 'Vasus'], ['Shatabhisha', 'Rahu', 'Go · Sa · Si · Su', 'Varuna'],
    ['Purva Bhadrapada', 'Jupiter', 'Se · So · Da · Di', 'Aja Ekapada'], ['Uttara Bhadrapada', 'Saturn', 'Du · Tha · Jha · Na', 'Ahir Budhnya'], ['Revati', 'Mercury', 'De · Do · Cha · Chi', 'Pushan'],
  ];

  // [number, common association, keywords]; associations vary between numerology systems
  var NUMBERS = [
    [1, 'Sun (in some popular systems)', 'Initiative, independence, leadership, originality'],
    [2, 'Moon', 'Cooperation, sensitivity, diplomacy, partnership'],
    [3, 'Jupiter', 'Expression, learning, creativity, optimism'],
    [4, 'Rahu / Uranus (system-dependent)', 'Structure, unconventional thinking, persistence'],
    [5, 'Mercury', 'Communication, adaptability, curiosity, movement'],
    [6, 'Venus', 'Care, harmony, responsibility, beauty'],
    [7, 'Ketu / Neptune (system-dependent)', 'Reflection, analysis, spirituality, research'],
    [8, 'Saturn', 'Discipline, ambition, management, long-term effort'],
    [9, 'Mars', 'Courage, action, compassion, completion'],
  ];

  var WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var rad = function (x) { return x * RAD; };
  var mod = function (x, m) { return ((x % m) + m) % m; };
  var jd = function (ms) { return ms / DAY + 2440587.5; };

  function moonLon(d) {
    var L = 218.316 + 13.176396 * d, M = rad(134.963 + 13.064993 * d), D = rad(297.850 + 12.190749 * d);
    var g = rad(357.528 + 0.9856003 * d), F = rad(93.272 + 13.229350 * d);
    return mod(L + 6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * M) - 0.186 * Math.sin(g) - 0.114 * Math.sin(2 * F), 360);
  }
  // Lahiri ayanamsa, approximate
  function ayanamsa(d) { return 23.853 + 0.01397 * (d / 365.25); }

  // Sidereal Moon longitude in degrees
  function siderealMoon(ms) {
    var d = jd(ms) - 2451545.0;
    return mod(moonLon(d) - ayanamsa(d), 360);
  }
  function at(ms) {
    var lon = siderealMoon(ms), idx = Math.floor(lon / SEG), into = lon - idx * SEG;
    var edge = Math.min(into, SEG - into);
    return { idx: idx, pada: Math.floor(into / (SEG / 4)) + 1, edge: edge };
  }
  function info(idx) { return { name: LIST[idx][0], ruler: LIST[idx][1], sounds: LIST[idx][2], deity: LIST[idx][3], sound: function (p) { return LIST[idx][2].split(' · ')[p - 1]; } }; }

  // First moment after startMs when the Moon enters the next Nakshatra
  function until(startMs) {
    var v0 = at(startMs).idx, t = startMs, step = 600000, i;
    for (i = 0; i < 400; i++) { if (at(t + step).idx !== v0) break; t += step; }
    var lo = t, hi = t + step;
    for (i = 0; i < 20; i++) { var mid = (lo + hi) / 2; if (at(mid).idx === v0) lo = mid; else hi = mid; }
    return hi;
  }

  function sunTimes(y, mo, da, city) {
    var doy = Math.round((Date.UTC(y, mo, da) - Date.UTC(y, 0, 1)) / DAY) + 1;
    var gam = 2 * Math.PI / 365 * (doy - 1);
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(gam) - 0.032077 * Math.sin(gam) - 0.014615 * Math.cos(2 * gam) - 0.040849 * Math.sin(2 * gam));
    var dec = 0.006918 - 0.399912 * Math.cos(gam) + 0.070257 * Math.sin(gam) - 0.006758 * Math.cos(2 * gam) + 0.000907 * Math.sin(2 * gam) - 0.002697 * Math.cos(3 * gam) + 0.00148 * Math.sin(3 * gam);
    var lat = rad(city.lat);
    var ha = Math.acos(Math.cos(rad(90.833)) / (Math.cos(lat) * Math.cos(dec)) - Math.tan(lat) * Math.tan(dec)) / RAD;
    var base = Date.UTC(y, mo, da);
    return { rise: base + (720 - 4 * (city.lon + ha) - eq) * 60000, set: base + (720 - 4 * (city.lon - ha) - eq) * 60000 };
  }
  function hm(ms, withDate) {
    var t = new Date(ms + IST), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var s = p(t.getUTCHours()) + ':' + p(t.getUTCMinutes());
    return withDate ? s + ' (' + t.getUTCDate() + ' ' + MON[t.getUTCMonth()] + ')' : s;
  }

  // Nakshatra at sunrise for a local calendar date; y, mo (0-11), da
  function today(y, mo, da, cityKey) {
    var city = CITIES[cityKey] || CITIES.bengaluru, st = sunTimes(y, mo, da, city), n = at(st.rise);
    return { city: city.name, weekday: WEEK[new Date(Date.UTC(y, mo, da)).getUTCDay()], sunrise: hm(st.rise), sunset: hm(st.set), idx: n.idx, pada: n.pada, upto: hm(until(st.rise), true) };
  }
  // Moon Nakshatra for a birth date and time given in Indian Standard Time
  function birth(y, mo, da, h, mi) { return at(Date.UTC(y, mo, da, h, mi) - IST); }

  window.NAKSHATRA = { CITIES: CITIES, LIST: LIST, NUMBERS: NUMBERS, info: info, today: today, birth: birth };
})();
