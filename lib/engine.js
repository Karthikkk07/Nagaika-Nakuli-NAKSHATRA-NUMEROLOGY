// Server-side Nakshatra, numerology and Ashtakoota (36-point) matching.
// Reuses the browser scripts so the website and the PDF always agree.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBrowserScript(file, globalName) {
  const sandbox = { window: {}, Math, Date, String, Number, Object, Array };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', file), 'utf8'), sandbox, { filename: file });
  return sandbox.window[globalName];
}
const NAKSHATRA = loadBrowserScript('nakshatra.js', 'NAKSHATRA');
const NUMEROLOGY = loadBrowserScript('numerology.js', 'NUMEROLOGY');
const SERVICES = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'services-data.js'), 'utf8') + '; SERVICES', {});

// Traditional Gana of each Nakshatra, in NAKSHATRA.LIST order
const GANA_OF = ['Deva', 'Manushya', 'Rakshasa', 'Manushya', 'Deva', 'Manushya', 'Deva', 'Deva', 'Rakshasa', 'Rakshasa', 'Manushya', 'Manushya', 'Deva', 'Rakshasa', 'Deva', 'Rakshasa', 'Deva', 'Rakshasa', 'Rakshasa', 'Manushya', 'Manushya', 'Deva', 'Rakshasa', 'Rakshasa', 'Manushya', 'Manushya', 'Deva'];
// [Sanskrit, English, lord]
const RASHI = [['Mesha', 'Aries', 'Mars'], ['Vrishabha', 'Taurus', 'Venus'], ['Mithuna', 'Gemini', 'Mercury'], ['Karka', 'Cancer', 'Moon'], ['Simha', 'Leo', 'Sun'], ['Kanya', 'Virgo', 'Mercury'],
  ['Tula', 'Libra', 'Venus'], ['Vrischika', 'Scorpio', 'Mars'], ['Dhanu', 'Sagittarius', 'Jupiter'], ['Makara', 'Capricorn', 'Saturn'], ['Kumbha', 'Aquarius', 'Saturn'], ['Meena', 'Pisces', 'Jupiter']];

const VARNA_OF_RASHI = [3, 4, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4]; // rank: Brahmin 4, Kshatriya 3, Vaishya 2, Shudra 1
const VARNA_NAME = { 4: 'Brahmin', 3: 'Kshatriya', 2: 'Vaishya', 1: 'Shudra' };

// Vashya groups: Q chatushpada, M manava, J jalachara, V vanachara, K keeta. Dhanu and Makara depend on the half of the sign.
const VASHYA_OF_RASHI = ['Q', 'Q', 'M', 'J', 'V', 'M', 'M', 'K', null, null, 'M', 'J'];
const VASHYA_NAME = { Q: 'Chatushpada', M: 'Manava', J: 'Jalachara', V: 'Vanachara', K: 'Keeta' };
const VASHYA_SCORE = { // groom row, bride column
  Q: { Q: 2, M: 1, J: 1, V: 0, K: 1 },
  M: { Q: 1, M: 2, J: 0.5, V: 0, K: 1 },
  J: { Q: 1, M: 0.5, J: 2, V: 1, K: 1 },
  V: { Q: 0, M: 0, J: 0, V: 2, K: 0 },
  K: { Q: 1, M: 1, J: 1, V: 0, K: 2 },
};

const YONI_ANIMALS = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Deer', 'Monkey', 'Mongoose', 'Lion'];
const YONI_OF = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Serpent', 'Dog', 'Cat', 'Sheep', 'Cat', 'Rat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Buffalo', 'Tiger', 'Deer', 'Deer', 'Dog', 'Monkey', 'Mongoose', 'Monkey', 'Lion', 'Horse', 'Lion', 'Cow', 'Elephant'];
const YONI_SCORE = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

// Natural planetary relationships for Graha Maitri: [friends, enemies]; everything else is neutral
const FRIENDS = {
  Sun: [['Moon', 'Mars', 'Jupiter'], ['Venus', 'Saturn']], Moon: [['Sun', 'Mercury'], []], Mars: [['Sun', 'Moon', 'Jupiter'], ['Mercury']],
  Mercury: [['Sun', 'Venus'], ['Moon']], Jupiter: [['Sun', 'Moon', 'Mars'], ['Mercury', 'Venus']], Venus: [['Mercury', 'Saturn'], ['Sun', 'Moon']], Saturn: [['Mercury', 'Venus'], ['Sun', 'Moon', 'Mars']],
};
const rel = (a, b) => (a === b ? 'F' : FRIENDS[a][0].includes(b) ? 'F' : FRIENDS[a][1].includes(b) ? 'E' : 'N');

const GANA_SCORE = { // groom row, bride column
  Deva: { Deva: 6, Manushya: 6, Rakshasa: 1 },
  Manushya: { Deva: 5, Manushya: 6, Rakshasa: 0 },
  Rakshasa: { Deva: 0, Manushya: 0, Rakshasa: 6 },
};
const NADI = ['Adi', 'Madhya', 'Antya'];
const nadiOf = (i) => (Math.floor(i / 3) % 2 === 0 ? NADI[i % 3] : NADI[2 - (i % 3)]);

// Moon position for a person: Nakshatra, Pada, Rashi, plus the half of the sign (for Vashya)
function moonOf(dob, tob, tobUnknown) {
  const [y, m, d] = dob.split('-').map(Number);
  const [h, mi] = (tobUnknown || !tob ? '12:00' : tob).split(':').map(Number);
  const n = NAKSHATRA.birth(y, m - 1, d, h, mi);
  const abs = n.idx * 4 + n.pada - 1;
  const rashi = Math.floor(abs / 9);
  const firstHalf = abs % 9 <= 4;
  const info = NAKSHATRA.info(n.idx);
  return {
    idx: n.idx, pada: n.pada, rashi, firstHalf, edge: n.edge < 0.1, nakshatra: info.name, ruler: info.ruler, deity: info.deity, sound: info.sound(n.pada),
    rashiName: RASHI[rashi][0], rashiEnglish: RASHI[rashi][1], lord: RASHI[rashi][2], gana: GANA_OF[n.idx], yoni: YONI_OF[n.idx], nadi: nadiOf(n.idx),
    varna: VARNA_NAME[VARNA_OF_RASHI[rashi]], birthNumber: NUMEROLOGY.birthNumber(d), lifePath: NUMEROLOGY.lifePath(y, m, d),
  };
}

function vashyaGroup(p) {
  if (p.rashi === 8) return p.firstHalf ? 'M' : 'Q';
  if (p.rashi === 9) return p.firstHalf ? 'Q' : 'J';
  return VASHYA_OF_RASHI[p.rashi];
}

// groom = male, bride = female
function ashtakoota(g, b) {
  const kootas = [];
  const add = (name, max, score, groom, bride, note) => kootas.push({ name, max, score, groom, bride, note });

  const gv = VARNA_OF_RASHI[g.rashi], bv = VARNA_OF_RASHI[b.rashi];
  add('Varna', 1, gv >= bv ? 1 : 0, VARNA_NAME[gv], VARNA_NAME[bv], 'Temperament and ego compatibility.');

  const gw = vashyaGroup(g), bw = vashyaGroup(b);
  add('Vashya', 2, VASHYA_SCORE[gw][bw], VASHYA_NAME[gw], VASHYA_NAME[bw], 'Mutual attraction and influence.');

  // Tara: count each Nakshatra from the other, in nines; remainders 3, 5 and 7 are unfavourable
  const tara = (from, to) => { const r = (((to - from + 27) % 27) + 1) % 9; return r === 3 || r === 5 || r === 7 ? 0 : 1.5; };
  add('Tara', 3, tara(b.idx, g.idx) + tara(g.idx, b.idx), g.nakshatra, b.nakshatra, 'Health and well-being of the couple (birth-star cycle).');

  add('Yoni', 4, YONI_SCORE[YONI_ANIMALS.indexOf(g.yoni)][YONI_ANIMALS.indexOf(b.yoni)], g.yoni, b.yoni, 'Physical and instinctive compatibility.');

  const pair = [rel(g.lord, b.lord), rel(b.lord, g.lord)].sort().join('');
  const gm = g.lord === b.lord || pair === 'FF' ? 5 : pair === 'FN' ? 4 : pair === 'NN' ? 3 : pair === 'EF' ? 1 : pair === 'EN' ? 0.5 : 0;
  add('Graha Maitri', 5, gm, g.lord, b.lord, 'Mental compatibility; friendship between the Moon-sign lords.');

  add('Gana', 6, GANA_SCORE[g.gana][b.gana], g.gana, b.gana, 'Temperament: Deva, Manushya or Rakshasa.');

  const d1 = ((b.rashi - g.rashi + 12) % 12) + 1, d2 = ((g.rashi - b.rashi + 12) % 12) + 1;
  const bad = ['2/12', '12/2', '5/9', '9/5', '6/8', '8/6'].includes(d1 + '/' + d2);
  add('Bhakoot', 7, bad ? 0 : 7, g.rashiName, b.rashiName, bad ? `Moon signs stand ${d1}/${d2} from each other, a Bhakoot dosha.` : 'Moon signs are in a favourable relationship; family welfare and prosperity.');

  const sameNadi = g.nadi === b.nadi;
  add('Nadi', 8, sameNadi ? 0 : 8, g.nadi, b.nadi, sameNadi ? 'Same Nadi, a Nadi dosha. Traditionally weighed carefully.' : 'Different Nadi; health and progeny.');

  const total = kootas.reduce((a, k) => a + k.score, 0);
  const band = total >= 33 ? 'Excellent' : total >= 25 ? 'Good' : total >= 18 ? 'Acceptable' : 'Below the usual minimum';
  const dosha = [];
  if (sameNadi) dosha.push('Nadi dosha (same Nadi)');
  if (bad) dosha.push('Bhakoot dosha');
  if (GANA_SCORE[g.gana][b.gana] <= 1 && g.gana !== b.gana) dosha.push('Gana mismatch');
  const verdict = total >= 18
    ? `The pair scores ${total} out of 36, which meets the traditional minimum of 18 (${band.toLowerCase()}).`
    : `The pair scores ${total} out of 36, which is below the traditional minimum of 18.`;
  return { total, max: 36, minimum: 18, band, pass: total >= 18, dosha, verdict, kootas };
}

function matchPair(groom, bride) {
  return { groom: moonOf(groom.dob, groom.tob, groom.tobUnknown), bride: moonOf(bride.dob, bride.tob, bride.tobUnknown) };
}

module.exports = { NAKSHATRA, NUMEROLOGY, SERVICES, RASHI, GANA_OF, YONI_SCORE, YONI_ANIMALS, moonOf, ashtakoota, matchPair };
