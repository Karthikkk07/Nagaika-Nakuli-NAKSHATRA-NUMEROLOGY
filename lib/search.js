// Site search: a small in-memory index of the pages, services, Nakshatras and published articles.
const fs = require('fs');
const path = require('path');

const SKIP_PAGES = new Set(['404.html', '500.html', 'maintenance.html', 'search.html', 'blog-post.html', 'service.html']);
const SUFFIX = /\s*\|\s*Nagaika, Nakuli Numerology\s*$/i;

// Words people type that the pages say differently
const SYNONYMS = {
  kundli: ['kundali', 'horoscope', 'marriage'], kundali: ['kundli', 'horoscope'], jathakam: ['horoscope', 'kundali'], jatakam: ['horoscope', 'kundali'],
  matching: ['marriage', 'compatibility'], wedding: ['marriage'], spouse: ['marriage'], partner: ['marriage'],
  astrologer: ['numerologist', 'consultation'], consult: ['consultation'], appointment: ['consultation', 'contact'], book: ['consultation', 'contact', 'pay'],
  price: ['pricing', 'fee'], cost: ['pricing', 'fee'], fees: ['fee', 'pricing'], charges: ['fee', 'pricing'], rate: ['pricing', 'fee'],
  call: ['contact', 'phone'], phone: ['contact'], whatsapp: ['contact', 'chat'], address: ['contact', 'location'], location: ['contact', 'address'], email: ['contact'],
  panchang: ['hora'], rahu: ['hora'], muhurtham: ['hora'], muhurat: ['hora'], timing: ['hora'], timings: ['hora'],
  baby: ['naming', 'name'], newborn: ['naming', 'name'], business: ['corporate'], company: ['corporate'], job: ['career'],
  fingerprint: ['nadi'], thumb: ['nadi'], payment: ['pay', 'refund'], money: ['refund', 'pay'], cancel: ['refund'], privacy: ['data'], numbers: ['number'],
  star: ['nakshatra'], birthstar: ['nakshatra'], rasi: ['nakshatra', 'moon'], moon: ['nakshatra'],
};

const tokenize = (s) => (String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((t) => t.length > 1);

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&rsquo;|&lsquo;/g, "'").replace(/&ndash;|&mdash;/g, '-').replace(/&#8377;/g, '\u20B9').replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function loadPages(publicDir) {
  const out = [];
  for (const f of fs.readdirSync(publicDir)) {
    if (!f.endsWith('.html') || SKIP_PAGES.has(f)) continue;
    const html = fs.readFileSync(path.join(publicDir, f), 'utf8');
    if (/name="robots" content="noindex"/.test(html)) continue;
    const title = ((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || f).replace(/&amp;/g, '&').replace(SUFFIX, '').trim();
    const desc = ((/<meta name="description" content="([^"]*)"/i.exec(html) || [])[1] || '').replace(/&amp;/g, '&');
    const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html) || [])[1] || html;
    out.push({ kind: 'Page', url: f === 'index.html' ? '/' : '/' + f, title, desc, text: htmlToText(body).slice(0, 8000) });
  }
  return out;
}

// Extra words people search for that the page text itself may not contain (much of the menu is added by script)
const KEYWORDS = {
  '/tools.html': 'lucky number life path number birth number destiny number name number mobile number vehicle number calculator free',
  '/nakshatra.html': 'birth star janma nakshatra moon sign rashi pada find your nakshatra today nakshatra 27 nakshatras',
  '/hora.html': 'rahu kalam muhurtham muhurat panchang planetary hours timings today',
  '/marriage.html': 'kundali matching kundli milan jathakam porutham gun milan horoscope compatibility',
  '/contact.html': 'address phone number email map directions book appointment enquiry whatsapp call',
  '/card.html': 'visiting card business card qr code vcard save contact',
  '/nadi.html': 'thumb impression palm leaf fingerprint reading',
  '/pricing.html': 'fees charges cost rates how much price list',
  '/faq.html': 'questions help answers doubts',
  '/payment.html': 'pay online razorpay upi card net banking receipt',
  '/about.html': 'numerologist experience background who we are',
  'Naming Consultation': 'baby name newborn naming ceremony name for child',
  'Marriage Compatibility': 'kundali matching kundli milan jathakam wedding',
  'Nadi Astrology': 'thumb impression fingerprint palm leaf',
  'Job Guidance': 'employment work interview career change',
  'Career Guidance': 'education studies profession college stream',
};

function buildIndex({ publicDir, services = [], nakshatras = [], blogs = [] }) {
  const items = loadPages(publicDir);
  for (const s of services) {
    items.push({
      kind: 'Service', url: '/service.html?service=' + encodeURIComponent(s.name), title: s.name,
      desc: s.desc + (s.free ? ' Free.' : s.fee ? ` Fee Rs ${s.fee}.` : ''), text: '', boost: 3, keywords: KEYWORDS[s.name] || '',
    });
  }
  for (const n of nakshatras) {
    items.push({
      kind: 'Nakshatra', url: '/nakshatra.html#list', title: `${n[0]} Nakshatra`,
      desc: `Ruler ${n[1]}. Pada sounds ${n[2]}. Deity ${n[3]}.`, text: '', boost: 1, keywords: 'star birth star',
    });
  }
  for (const b of blogs) {
    items.push({ kind: 'Article', url: '/blog-post.html?id=' + b.id, title: b.title, desc: b.summary || '', text: htmlToText(b.body || '').slice(0, 8000), boost: 2 });
  }
  for (const it of items) {
    if (!it.keywords && KEYWORDS[it.url]) it.keywords = KEYWORDS[it.url];
    it.t = it.title.toLowerCase();
    it.d = it.desc.toLowerCase();
    it.x = it.text.toLowerCase();
    it.k = String(it.keywords || '').toLowerCase();
  }
  return items;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a term matches at the start of a word ("nak" finds Nakshatra, but "upi" does not match Jupiter)
const wordRe = (a, flags = 'u') => new RegExp('(^|[^\\p{L}\\p{N}])' + escapeRe(a), flags);

function snippet(item, terms) {
  for (const t of terms) {
    const m = wordRe(t).exec(item.x);
    if (m) {
      const i = m.index + m[1].length;
      const start = Math.max(0, i - 70), end = Math.min(item.text.length, i + 110);
      return (start > 0 ? '... ' : '') + item.text.slice(start, end).trim() + (end < item.text.length ? ' ...' : '');
    }
  }
  return item.desc || item.text.slice(0, 160);
}

// Every word must match somewhere (a word also matches through its synonyms); title hits count most.
function search(items, query, limit = 12) {
  const words = tokenize(query).slice(0, 6);
  if (!words.length) return [];
  const results = [];
  for (const it of items) {
    let score = 0, ok = true;
    for (const w of words) {
      const alts = [w, ...(SYNONYMS[w] || [])];
      let best = 0;
      alts.forEach((a, idx) => {
        const weight = idx === 0 ? 1 : 0.6;
        const re = wordRe(a);
        let s = 0;
        if (re.test(it.t)) s += 14;
        if (re.test(it.d)) s += 5;
        if (re.test(it.k)) s += 7;
        if (it.x) s += Math.min(4, (it.x.match(wordRe(a, 'gu')) || []).length);
        best = Math.max(best, s * weight);
      });
      if (best === 0) { ok = false; break; }
      score += best;
    }
    if (ok) results.push({ item: it, score: score + (it.boost || 0) });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => ({ title: r.item.title, url: r.item.url, kind: r.item.kind, snippet: snippet(r.item, words).slice(0, 220) }));
}

module.exports = { buildIndex, search, tokenize };
