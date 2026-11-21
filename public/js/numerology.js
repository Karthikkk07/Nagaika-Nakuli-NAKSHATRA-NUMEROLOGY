(function () {
  var MAP = { A: 1, J: 1, S: 1, B: 2, K: 2, T: 2, C: 3, L: 3, U: 3, D: 4, M: 4, V: 4, E: 5, N: 5, W: 5, F: 6, O: 6, X: 6, G: 7, P: 7, Y: 7, H: 8, Q: 8, Z: 8, I: 9, R: 9 };

  var MEAN = {
    1: { title: 'The Leader', planet: 'Sun', day: 'Sunday', color: 'Gold, orange', traits: 'Independence, ambition, pioneering spirit and strong willpower.', mobile: 'Associated with confidence, leadership and a good fit for business and sales.', vehicle: 'Linked to authority and drive. Suits people who lead or travel often for work.' },
    2: { title: 'The Diplomat', planet: 'Moon', day: 'Monday', color: 'White, cream', traits: 'Sensitive, intuitive, cooperative and a natural peacemaker.', mobile: 'Associated with harmony, partnerships and good relationships.', vehicle: 'Linked to calm travel and family use.' },
    3: { title: 'The Communicator', planet: 'Jupiter', day: 'Thursday', color: 'Yellow', traits: 'Self-expression, optimism, creativity and social charm.', mobile: 'Associated with communication, teaching, advice and creative work.', vehicle: 'Linked to optimism and growth. Suits teachers, advisers and creative professionals.' },
    4: { title: 'The Builder', planet: 'Rahu', day: 'Saturday', color: 'Blue, grey', traits: 'Practical, disciplined, hard working and dependable.', mobile: 'Associated with structure and effort; results come through steady work.', vehicle: 'Often linked to sudden changes. Many people prefer to travel carefully with it.' },
    5: { title: 'The Adventurer', planet: 'Mercury', day: 'Wednesday', color: 'Green', traits: 'Versatile, curious, quick-thinking and fond of freedom.', mobile: 'Associated with trade, communication, networking and quick deals.', vehicle: 'Linked to movement and flexibility. Suits traders and frequent travellers.' },
    6: { title: 'The Nurturer', planet: 'Venus', day: 'Friday', color: 'Pink, white', traits: 'Caring, responsible, artistic and family-oriented.', mobile: 'Associated with comfort, relationships, creativity and luxury.', vehicle: 'Linked to comfort and family. Suits those who value style and ease.' },
    7: { title: 'The Seeker', planet: 'Ketu', day: 'Monday', color: 'Sea green, light grey', traits: 'Analytical, introspective, spiritual and research minded.', mobile: 'Associated with study, research and a private nature.', vehicle: 'Linked to a reflective, steady pace. Suits those who prefer quieter travel.' },
    8: { title: 'The Achiever', planet: 'Saturn', day: 'Saturday', color: 'Dark blue, black', traits: 'Authority, discipline, financial sense and endurance.', mobile: 'Associated with finance, property and long-term business results.', vehicle: 'Linked to discipline and slow, steady progress. Needs patience.' },
    9: { title: 'The Humanitarian', planet: 'Mars', day: 'Tuesday', color: 'Red', traits: 'Energetic, courageous, generous and compassionate.', mobile: 'Associated with energy, action and courage; suits competitive fields.', vehicle: 'Linked to speed and energy. Drive with extra care.' },
    11: { title: 'Master Number 11', planet: 'Moon', day: 'Monday', color: 'Silver, white', traits: 'Intuition, inspiration and idealism, with high sensitivity.', mobile: 'Heightened intuition and sensitivity.', vehicle: 'Treated as a 2 for most practical purposes.' },
    22: { title: 'Master Number 22', planet: 'Rahu', day: 'Saturday', color: 'Blue', traits: 'The master builder: large-scale vision combined with practicality.', mobile: 'Big plans backed by practical effort.', vehicle: 'Treated as a 4 for most practical purposes.' },
    33: { title: 'Master Number 33', planet: 'Venus', day: 'Friday', color: 'Pink', traits: 'The master teacher: compassion and service to others.', mobile: 'Service, teaching and care for others.', vehicle: 'Treated as a 6 for most practical purposes.' },
  };

  function digits(n) { return String(n).split('').reduce(function (a, b) { return a + (+b); }, 0); }
  function reduce(n, keepMaster) {
    while (n > 9 && !(keepMaster && (n === 11 || n === 22 || n === 33))) n = digits(n);
    return n;
  }
  function single(n) { return n > 9 ? reduce(n, false) : n; }

  function lifePath(y, m, d) { return reduce(reduce(d, true) + reduce(m, true) + reduce(y, true), true); }
  function birthNumber(d) { return single(reduce(d, false)); }
  function letters(str) { return String(str).toUpperCase().replace(/[^A-Z]/g, '').split(''); }
  function nameSum(str, filter) {
    return letters(str).filter(filter || function () { return true; }).reduce(function (a, c) { return a + MAP[c]; }, 0);
  }
  var isVowel = function (c) { return 'AEIOU'.indexOf(c) > -1; };
  function nameNumbers(name) {
    var all = nameSum(name), v = nameSum(name, isVowel), c = nameSum(name, function (x) { return !isVowel(x); });
    return { destiny: reduce(all, true), soul: reduce(v, true), personality: reduce(c, true), total: all };
  }
  function numberSum(str) {
    var ds = String(str).replace(/\D/g, '');
    if (!ds) return null;
    var total = ds.split('').reduce(function (a, b) { return a + (+b); }, 0);
    return { total: total, number: reduce(total, false) };
  }

  window.NUMEROLOGY = { MEAN: MEAN, reduce: reduce, lifePath: lifePath, birthNumber: birthNumber, nameNumbers: nameNumbers, numberSum: numberSum };
})();
