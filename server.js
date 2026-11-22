require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const store = require('./db');
const engine = require('./lib/engine');
const { buildOrderPdf } = require('./lib/pdf');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind the host's reverse proxy, so req.ip is the real client
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  next();
});
app.get('/healthz', (req, res) => res.json({ ok: true }));
// Nadi Astrology orders carry a small fingerprint image, so only order creation gets a larger body limit
const bigJson = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.method === 'POST' && req.path === '/api/orders' ? bigJson(req, res, next) : next()));
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

const normPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return '+91' + d;
  if (d.length === 12 && d.startsWith('91')) return '+' + d;
  return d.length >= 8 && d.length <= 15 ? '+' + d : null;
};

const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

async function sendMailTo(to, subject, html, text, opts = {}) {
  if (!mailer || !to) return false;
  await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, replyTo: opts.replyTo, subject, text, html, attachments: opts.attachments });
  return true;
}
async function sendEmail(subject, html, text, replyTo, attachments) {
  if (!mailer || !process.env.ADMIN_EMAIL) return console.log('[email not configured]', subject);
  await sendMailTo(process.env.ADMIN_EMAIL, subject, html, text, { replyTo, attachments });
}

async function sendSms(to, body) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
  if (!sid || !token || !from || !to) {
    console.log(`[sms not configured] to ${to}: ${body}`);
    return false;
  }
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!r.ok) throw new Error('SMS provider error ' + r.status);
  return true;
}

// ---------- config for the front-end ----------
// Without Razorpay keys payments run in a clearly labelled demo mode so the whole flow can be shown.
// Outside production it is on by default; in production set DEMO_PAYMENTS=true to keep it (e.g. for a prototype link).
const RZP_ON = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const DEMO_PAY = !RZP_ON && (process.env.DEMO_PAYMENTS === 'true' || process.env.NODE_ENV !== 'production');

app.get('/api/config', (req, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
    paypalLink: process.env.PAYPAL_ME_LINK || null,
    demoPayments: DEMO_PAY,
  });
});

// ---------- OTP (optional phone verification) ----------
const otps = new Map(); // phone -> { code, expires, verifiedUntil }

app.post('/api/otp/send', rateLimit(5, 10 * 60 * 1000), async (req, res) => {
  const phone = normPhone(req.body.phone);
  if (!phone) return res.status(400).json({ ok: false, error: 'Enter a valid phone number.' });
  const code = String(crypto.randomInt(100000, 1000000));
  otps.set(phone, { code, expires: Date.now() + 10 * 60 * 1000, tries: 0 });
  try {
    await sendSms(phone, `Your verification code for Nagaika, Nakuli Numerology is ${code}. Valid for 10 minutes.`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(502).json({ ok: false, error: 'Could not send the code. Please try again.' });
  }
});

app.post('/api/otp/verify', rateLimit(15, 10 * 60 * 1000), (req, res) => {
  const phone = normPhone(req.body.phone);
  const rec = phone && otps.get(phone);
  if (!rec || rec.expires < Date.now() || rec.tries >= 5) return res.status(400).json({ ok: false, error: 'Code expired. Request a new one.' });
  rec.tries++;
  if (String(req.body.code) !== rec.code) return res.status(400).json({ ok: false, error: 'Incorrect code.' });
  const token = crypto.randomBytes(16).toString('hex');
  otps.set(phone, { ...rec, expires: 0, token, tokenExpires: Date.now() + 30 * 60 * 1000 });
  res.json({ ok: true, token });
});

// ---------- enquiries / contact ----------
const FIELD_LABELS = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  service: 'Service',
  mode: 'Preferred mode',
  dob: 'Date of birth',
  date: 'Preferred date',
  message: 'Message',
  source: 'Form',
};

app.post('/api/enquiry', rateLimit(6, 10 * 60 * 1000), async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot

  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const d = {
    name: clean(b.name, 100),
    email: clean(b.email, 150),
    phone: clean(b.phone, 20),
    service: clean(b.service, 100),
    mode: clean(b.mode, 40),
    dob: clean(b.dob, 20),
    date: clean(b.date, 20),
    message: clean(b.message, 2000),
    source: clean(b.source, 20) || 'contact',
  };

  const errors = {};
  if (d.name.length < 2) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = 'Please enter a valid email address.';
  const phone = normPhone(d.phone);
  if (!phone) errors.phone = 'Please enter a valid phone number.';
  if (!d.service) errors.service = 'Please choose a service.';
  if (d.message.length < 5) errors.message = 'Please tell us a little about your query.';
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

  const rec = phone && otps.get(phone);
  const verified = !!(b.otpToken && rec && rec.token === b.otpToken && rec.tokenExpires > Date.now());

  const entry = { id: crypto.randomUUID(), receivedAt: new Date().toISOString(), phoneVerified: verified, ...d, phone };
  try {
    store.addEnquiry(entry);
  } catch (e) {
    console.error('Could not save enquiry', e);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please call us directly.' });
  }

  // notifications must not fail the user's submission
  const rows = Object.entries(FIELD_LABELS).filter(([k]) => d[k]);
  const text = rows.map(([k, l]) => `${l}: ${d[k] || ''}`).join('\n') + `\nPhone verified: ${verified ? 'yes' : 'no'}`;
  const html =
    '<h3>New website enquiry</h3><table cellpadding="6">' +
    rows.map(([k, l]) => `<tr><td><b>${l}</b></td><td>${esc(d[k])}</td></tr>`).join('') +
    `<tr><td><b>Phone verified</b></td><td>${verified ? 'Yes' : 'No'}</td></tr></table>`;
  const results = await Promise.allSettled([
    sendEmail(`New enquiry: ${d.service} - ${d.name}`, html, text, d.email),
    sendSms(process.env.ADMIN_PHONE, `New enquiry: ${d.name}, ${phone}, ${d.service}`),
  ]);
  results.forEach((r) => r.status === 'rejected' && console.error('Notification failed:', r.reason));
  if (!mailer) console.log('--- New enquiry ---\n' + text);

  res.json({ ok: true });
});

// ---------- quick lead (free result follow-up) ----------
app.post('/api/lead', rateLimit(5, 10 * 60 * 1000), async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const name = clean(b.name, 100);
  const phone = normPhone(clean(b.phone, 20));
  if (name.length < 2 || !phone) return res.status(400).json({ ok: false, error: 'Please enter your name and a valid mobile number.' });

  const topic = clean(b.topic, 300);
  const entry = {
    id: crypto.randomUUID(), receivedAt: new Date().toISOString(), phoneVerified: false, name, email: '', phone,
    service: 'Free Result Follow-up', mode: 'Phone call', dob: clean(b.dob, 20), date: '',
    message: 'Call-back requested from the website. ' + (topic || 'No result details.'), source: 'lead',
  };
  try {
    store.addEnquiry(entry);
  } catch (e) {
    console.error('Could not save lead', e);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please call us directly.' });
  }
  const text = `New call-back request\nName: ${name}\nPhone: ${phone}\n${entry.message}`;
  const results = await Promise.allSettled([
    sendEmail(`New call-back request: ${name}`, `<h3>New call-back request</h3><p>${esc(name)}, ${esc(phone)}</p><p>${esc(entry.message)}</p>`, text),
    sendSms(process.env.ADMIN_PHONE, `Call-back request: ${name}, ${phone}`),
  ]);
  results.forEach((r) => r.status === 'rejected' && console.error('Notification failed:', r.reason));
  if (!mailer) console.log('--- New lead ---\n' + text);
  res.json({ ok: true });
});

// ---------- horoscope in numerology (form lead) ----------
app.post('/api/horoscope', rateLimit(8, 10 * 60 * 1000), async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  const clean = (v, max) => String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
  const name = clean(b.name, 100);
  const phone = normPhone(clean(b.phone, 20));
  const gender = ['Male', 'Female'].includes(b.gender) ? b.gender : '';
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dob)) ? String(b.dob) : '';
  if (name.length < 2 || !phone) return res.status(400).json({ ok: false, error: 'Please enter your name and a valid mobile number.' });
  if (!gender || !dob) return res.status(400).json({ ok: false, error: 'Please choose Male or Female and enter your date of birth.' });

  const tob = /^\d{2}:\d{2}$/.test(String(b.tob)) ? String(b.tob) : 'unknown';
  const message = `Horoscope in Numerology form. Gender: ${gender}. Time of birth: ${tob}${b.tobUnknown ? ' (not known, noon used)' : ''}. Place of birth: ${clean(b.pob, 100) || '-'}. ${clean(b.summary, 400)}`;
  const entry = {
    id: crypto.randomUUID(), receivedAt: new Date().toISOString(), phoneVerified: false, name, email: '', phone,
    service: 'Horoscope in Numerology', mode: 'Phone call', dob, date: '', message, source: 'horoscope',
  };
  try {
    store.addEnquiry(entry);
  } catch (e) {
    console.error('Could not save horoscope lead', e);
    return res.status(500).json({ ok: false, error: 'Could not save your details.' });
  }
  const text = `New horoscope request\nName: ${name}\nPhone: ${phone}\nDOB: ${dob}\n${message}`;
  const results = await Promise.allSettled([
    sendEmail(`New horoscope request: ${name}`, `<h3>New horoscope request</h3><p>${esc(name)}, ${esc(phone)}</p><p>${esc(message)}</p>`, text),
    sendSms(process.env.ADMIN_PHONE, `Horoscope request: ${name}, ${phone}`),
  ]);
  results.forEach((r) => r.status === 'rejected' && console.error('Notification failed:', r.reason));
  if (!mailer) console.log('--- New horoscope lead ---\n' + text);
  res.json({ ok: true });
});

// ---------- service orders: details -> payment -> PDF for the admin ----------
const ORDER_RATE = rateLimit(12, 10 * 60 * 1000);
const validDob = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 1900 && d <= new Date();
};
const validTob = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const MARRIAGE = 'Marriage Compatibility';
const NADI = 'Nadi Astrology';
const NADI_HANDS = ['Right thumb', 'Left thumb', 'Other finger'];

class BadInput extends Error {}

// Fingerprint photo from the browser: a JPEG or PNG data URL of at most about 600 KB
function cleanFingerprint(s) {
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(s || ''));
  if (!m || m[2].length > 800000) throw new BadInput('Please attach a clear photo of your fingerprint (JPEG or PNG, under 600 KB).');
  const buf = Buffer.from(m[2], 'base64');
  const ok = m[1] === 'jpeg' ? buf[0] === 0xff && buf[1] === 0xd8 : buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (!ok) throw new BadInput('That file is not a valid image. Please attach your fingerprint as a JPEG or PNG photo.');
  return `data:image/${m[1]};base64,${m[2]}`;
}

function cleanPerson(p, label) {
  const c = (v, n) => String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
  p = p || {};
  const name = c(p.name, 100), tobUnknown = !!p.tobUnknown;
  if (name.length < 2) throw new BadInput(`Please enter the ${label}'s name.`);
  if (!validDob(p.dob)) throw new BadInput(`Please enter a valid date of birth for the ${label}.`);
  if (!tobUnknown && !validTob(p.tob)) throw new BadInput(`Please enter the ${label}'s time of birth, or tick "I do not know".`);
  return { name, dob: p.dob, tob: tobUnknown ? '' : p.tob, tobUnknown, pob: c(p.pob, 100) };
}

async function createRazorpayOrder(amount, service, name, receipt) {
  const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret } = process.env;
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amount * 100, currency: 'INR', receipt, notes: { service: service.slice(0, 100), name: name.slice(0, 100) } }),
  });
  const order = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(order));
  return order;
}

// Public view of a paid order (what the customer may see): no worked-out result, the numerologist shares that
function publicOrder(o) {
  return { id: o.id, service: o.service, amount: o.amount, payStatus: o.pay_status, payMode: o.pay_mode };
}

// After payment: build the PDF, tell the admin (email with PDF, SMS) and send the customer a receipt
async function finalizeOrder(id) {
  const o = store.getOrder(id);
  if (!o) return;
  const pdf = await buildOrderPdf(o);
  const customerPdf = await buildOrderPdf(o, { customer: true });
  const file = `${o.service.replace(/[^A-Za-z0-9]+/g, '-')}-${o.id.slice(0, 8)}.pdf`;
  const paidLine = o.pay_status === 'free' ? 'Free service' : `Paid Rs. ${o.amount} (${o.pay_mode === 'demo' ? 'DEMO payment' : 'Razorpay'})`;
  const text = `New paid order\nService: ${o.service}\n${paidLine}\nName: ${o.name}\nPhone: ${o.phone}\nEmail: ${o.email}\nThe PDF is attached and in the admin portal (Orders tab).`;
  const results = await Promise.allSettled([
    sendEmail(`New order: ${o.service} - ${o.name}`, `<h3>New order</h3><p><b>${esc(o.service)}</b><br>${esc(paidLine)}</p><p>${esc(o.name)}<br>${esc(o.phone)}<br>${esc(o.email)}</p><p>The PDF is attached and in the admin portal (Orders tab).</p>`, text, o.email, [{ filename: file, content: pdf }]),
    sendMailTo(o.email, `Your order with ${'Nagaika, Nakuli Numerology'}: ${o.service}`, `<p>Dear ${esc(o.name)},</p><p>Thank you. We have received your request for <b>${esc(o.service)}</b>. ${o.pay_status === 'paid' ? 'Your payment receipt is attached.' : ''} Our numerologist will contact you on ${esc(o.phone)} shortly.</p><p>Nagaika, Nakuli Numerology, Bengaluru</p>`, `Dear ${o.name}, we have received your request for ${o.service}. Our numerologist will contact you on ${o.phone} shortly.`, { attachments: [{ filename: file, content: customerPdf }] }),
    sendSms(process.env.ADMIN_PHONE, `New order: ${o.service}, ${o.name}, ${o.phone}`),
  ]);
  results.forEach((r) => r.status === 'rejected' && console.error('Order notification failed:', r.reason));
  if (!mailer) console.log('--- New order ---\n' + text);
}

app.post('/api/orders', ORDER_RATE, async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  const c = (v, n) => String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
  try {
    const svc = engine.SERVICES.find((s) => s.name === b.service);
    if (!svc) throw new BadInput('Please choose a service.');
    const name = c(b.name, 100), phone = normPhone(c(b.phone, 20)), email = c(b.email, 150).toLowerCase();
    if (name.length < 2) throw new BadInput('Please enter your name.');
    if (!phone) throw new BadInput('Please enter a valid mobile number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new BadInput('Please enter a valid email address.');

    let amount = 0;
    if (svc.fee) amount = svc.fee;
    else if (!svc.free) {
      amount = Math.round(Number(b.amount));
      if (!Number.isFinite(amount) || amount < 100 || amount > 100000) throw new BadInput('Enter an amount between Rs 100 and Rs 1,00,000.');
    }

    const details = {};
    let result = null;
    if (svc.name === MARRIAGE) {
      const groom = cleanPerson(b.marriage && b.marriage.groom, 'groom'), bride = cleanPerson(b.marriage && b.marriage.bride, 'bride');
      details.marriage = { groom, bride };
      const m = engine.matchPair(groom, bride);
      result = { type: 'marriage', groom: m.groom, bride: m.bride };
    } else if (svc.name === NADI) {
      if (b.dob && !validDob(b.dob)) throw new BadInput('Please enter a valid date of birth.');
      if (!b.consent) throw new BadInput('Please confirm that you agree to share your fingerprint for this reading.');
      details.dob = b.dob || '';
      details.mode = c(b.mode, 40);
      details.message = String(b.message || '').trim().slice(0, 1500);
      details.hand = NADI_HANDS.includes(b.hand) ? b.hand : NADI_HANDS[0];
      details.fingerprint = cleanFingerprint(b.fingerprint);
    } else {
      if (b.dob && !validDob(b.dob)) throw new BadInput('Please enter a valid date of birth.');
      details.dob = b.dob || '';
      details.mode = c(b.mode, 40);
      details.message = String(b.message || '').trim().slice(0, 1500);
    }

    const id = crypto.randomUUID();
    store.addOrder({ id, service: svc.name, amount, payStatus: amount ? 'pending' : 'free', name, email, phone, details, result });
    if (!amount) {
      await finalizeOrder(id).catch((e) => console.error('Order finalize failed', e));
      return res.json({ ok: true, id, amount: 0, free: true, order: publicOrder(store.getOrder(id)) });
    }
    res.json({ ok: true, id, amount, free: false });
  } catch (e) {
    if (e instanceof BadInput) return res.status(400).json({ ok: false, error: e.message });
    console.error('Could not create order', e);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or call us.' });
  }
});

// Start payment: Razorpay checkout details, or demo mode when Razorpay is not configured
app.post('/api/orders/:id/pay', ORDER_RATE, async (req, res) => {
  const o = store.getOrder(req.params.id);
  if (!o) return res.status(404).json({ ok: false, error: 'Order not found.' });
  if (o.pay_status !== 'pending') return res.status(409).json({ ok: false, error: 'This order is already paid.' });
  if (!RZP_ON) {
    if (!DEMO_PAY) return res.status(503).json({ ok: false, error: 'Online payment is not enabled yet. Please contact us to pay.' });
    return res.json({ ok: true, mode: 'demo' });
  }
  try {
    const rz = await createRazorpayOrder(o.amount, o.service, o.name, 'ord_' + o.id.slice(0, 8));
    store.setOrderRzp(o.id, rz.id);
    store.addPayment({ orderId: rz.id, amount: o.amount, service: o.service, name: o.name, status: 'created' });
    res.json({ ok: true, mode: 'razorpay', keyId: process.env.RAZORPAY_KEY_ID, rzpOrderId: rz.id, amount: rz.amount, currency: rz.currency });
  } catch (e) {
    console.error('Razorpay error', e);
    res.status(502).json({ ok: false, error: 'Could not start the payment. Please try again.' });
  }
});

app.post('/api/orders/:id/demo-pay', ORDER_RATE, async (req, res) => {
  if (!DEMO_PAY) return res.status(403).json({ ok: false, error: 'Demo payments are switched off.' });
  const o = store.getOrder(req.params.id);
  if (!o || o.pay_status !== 'pending') return res.status(409).json({ ok: false, error: 'This order cannot be paid.' });
  store.markOrderPaid(o.id, 'demo', 'DEMO-' + crypto.randomBytes(4).toString('hex').toUpperCase());
  await finalizeOrder(o.id).catch((e) => console.error('Order finalize failed', e));
  res.json({ ok: true, order: publicOrder(store.getOrder(o.id)) });
});

app.post('/api/payments/razorpay/verify', async (req, res) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const { razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: s } = req.body || {};
  if (!secret || !o || !p || !s) return res.status(400).json({ ok: false });
  const expected = crypto.createHmac('sha256', secret).update(`${o}|${p}`).digest('hex');
  const ok = expected.length === s.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s));
  if (!ok) return res.status(400).json({ ok: false });
  store.markPaymentPaid(o, p);
  const order = store.getOrderByRzp(o);
  if (order) {
    store.markOrderPaid(order.id, 'razorpay', p);
    await finalizeOrder(order.id).catch((e) => console.error('Order finalize failed', e));
  }
  res.json({ ok: true, order: order ? publicOrder(store.getOrder(order.id)) : null });
});

// The order id is an unguessable UUID, so it acts as the customer's access key to their own result and receipt
app.get('/api/orders/:id', (req, res) => {
  const o = store.getOrder(req.params.id);
  if (!o || !['paid', 'free'].includes(o.pay_status)) return res.status(404).json({ ok: false });
  res.json({ ok: true, order: publicOrder(o) });
});
app.get('/api/orders/:id/receipt.pdf', async (req, res) => {
  const o = store.getOrder(req.params.id);
  if (!o || !['paid', 'free'].includes(o.pay_status)) return res.status(404).send('Not found');
  res.type('application/pdf').set('Content-Disposition', `inline; filename="receipt-${o.id.slice(0, 8)}.pdf"`).send(await buildOrderPdf(o, { customer: true }));
});

// ---------- chatbot lead capture ----------
app.post('/api/chat-lead', rateLimit(30, 10 * 60 * 1000), (req, res) => {
  const c = (v) => String(v || '').slice(0, 100);
  try {
    store.addChatLead({ topic: c(req.body.topic), solution: c(req.body.solution), service: c(req.body.service) });
  } catch (e) {
    console.error(e);
  }
  res.json({ ok: true });
});

// ---------- admin (login page + signed session cookie) ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const SESSION_MS = 8 * 60 * 60 * 1000;
const sign = (v) => crypto.createHmac('sha256', sha('admin-session:' + (process.env.ADMIN_PASSWORD || ''))).update(v).digest('hex');
const credsOk = (user, pass) =>
  !!process.env.ADMIN_PASSWORD &&
  crypto.timingSafeEqual(sha(user), sha(process.env.ADMIN_USER || 'admin')) &&
  crypto.timingSafeEqual(sha(pass), sha(process.env.ADMIN_PASSWORD));

function hasSession(req) {
  const m = /(?:^|;\s*)admin_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  return !!sig && Number(exp) > Date.now() && sig.length === 64 && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(exp)));
}
function hasBasic(req) {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic') return false;
  const [user, ...rest] = Buffer.from(encoded || '', 'base64').toString().split(':');
  return credsOk(user, rest.join(':'));
}
function adminAuth(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).send('Admin is disabled. Set ADMIN_PASSWORD in .env and restart.');
  if (hasSession(req) || hasBasic(req)) return next();
  if (req.method === 'GET' && !req.path.startsWith('/api/') && req.path !== '/export.csv') return res.redirect('/admin/login');
  res.status(401).json({ ok: false, error: 'Please sign in.' });
}
const adminRouter = express.Router();
adminRouter.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'login.html')));
adminRouter.post('/login', rateLimit(10, 10 * 60 * 1000), (req, res) => {
  const { username, password } = req.body || {};
  if (!credsOk(String(username || ''), String(password || ''))) return res.status(401).json({ ok: false, error: 'Wrong username or password.' });
  const exp = String(Date.now() + SESSION_MS);
  const flags = `HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}` + (req.secure ? '; Secure' : '');
  res.set('Set-Cookie', `admin_session=${encodeURIComponent(exp + '.' + sign(exp))}; ${flags}`).json({ ok: true });
});
adminRouter.post('/logout', (req, res) => {
  res.set('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0').json({ ok: true });
});
adminRouter.use(adminAuth);
adminRouter.get('/', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'admin.html')));
adminRouter.get('/api/data', (req, res) => {
  const msgs = store.listOrderMessages();
  const orders = store.listOrders().map((o) => {
    const details = JSON.parse(o.details || '{}');
    const hasFingerprint = !!details.fingerprint;
    delete details.fingerprint; // served separately by /orders/:id/fingerprint
    return { ...o, details: { ...details, hasFingerprint }, result: o.result ? JSON.parse(o.result) : null, messages: msgs.filter((m) => m.order_id === o.id) };
  });
  res.json({ enquiries: store.listEnquiries(), payments: store.listPayments(), chats: store.listChatLeads(), orders, mailReady: !!mailer });
});
adminRouter.get('/orders/:id/fingerprint', (req, res) => {
  const o = store.getOrder(req.params.id);
  const m = o && /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(JSON.parse(o.details || '{}').fingerprint || '');
  if (!m) return res.status(404).send('Not found');
  res.type(m[1]).set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="fingerprint-${o.id.slice(0, 8)}.${m[1] === 'image/png' ? 'png' : 'jpg'}"`).send(Buffer.from(m[2], 'base64'));
});
adminRouter.get('/orders/:id.pdf', async (req, res) => {
  const o = store.getOrder(req.params.id);
  if (!o) return res.status(404).send('Not found');
  res.type('application/pdf').set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="order-${o.id.slice(0, 8)}.pdf"`).send(await buildOrderPdf(o));
});
adminRouter.post('/api/orders/:id', (req, res) => {
  const status = ['new', 'contacted', 'done'].includes(req.body.status) ? req.body.status : 'new';
  store.updateOrder(req.params.id, status, String(req.body.notes || '').slice(0, 2000));
  res.json({ ok: true });
});
adminRouter.delete('/api/orders/:id', (req, res) => {
  store.deleteOrder(req.params.id);
  res.json({ ok: true });
});
// Reply to the customer by email, optionally with the order PDF attached
adminRouter.post('/api/orders/:id/email', async (req, res) => {
  const o = store.getOrder(req.params.id);
  if (!o) return res.status(404).json({ ok: false, error: 'Order not found.' });
  const subject = String(req.body.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const body = String(req.body.message || '').trim().slice(0, 8000);
  if (!subject || !body) return res.status(400).json({ ok: false, error: 'Please write a subject and a message.' });
  if (!mailer) return res.status(503).json({ ok: false, error: 'Email is not set up on the server yet (add the SMTP settings to .env). Use "Open in my mail app" for now.' });
  try {
    const attachments = req.body.attachPdf ? [{ filename: `order-${o.id.slice(0, 8)}.pdf`, content: await buildOrderPdf(o) }] : undefined;
    await sendMailTo(o.email, subject, `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${esc(body)}</div><p style="color:#777">Nagaika, Nakuli Numerology, Bengaluru</p>`, body, { replyTo: process.env.ADMIN_EMAIL, attachments });
    store.addOrderMessage({ orderId: o.id, channel: 'email', subject, body, sent: true });
    if (o.status === 'new') store.updateOrder(o.id, 'contacted', o.notes || '');
    res.json({ ok: true });
  } catch (e) {
    console.error('Admin email failed', e);
    store.addOrderMessage({ orderId: o.id, channel: 'email', subject, body, sent: false });
    res.status(502).json({ ok: false, error: 'The email could not be sent. Please check the SMTP settings.' });
  }
});
adminRouter.post('/api/enquiry/:id', (req, res) => {
  const status = ['new', 'contacted', 'done'].includes(req.body.status) ? req.body.status : 'new';
  store.updateEnquiry(req.params.id, status, String(req.body.notes || '').slice(0, 2000));
  res.json({ ok: true });
});
adminRouter.delete('/api/enquiry/:id', (req, res) => {
  store.deleteEnquiry(req.params.id);
  res.json({ ok: true });
});
adminRouter.get('/export.csv', (req, res) => {
  const cols = ['received_at', 'name', 'email', 'phone', 'phone_verified', 'service', 'mode', 'dob', 'pref_date', 'message', 'status', 'notes'];
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [cols.join(',')].concat(store.listEnquiries().map((r) => cols.map((c) => q(r[c])).join(','))).join('\n');
  res.type('text/csv').set('Content-Disposition', 'attachment; filename=enquiries.csv').send(csv);
});

// blogs
const cleanBlog = (b) => {
  const image = String(b.image || '').trim().slice(0, 500);
  return {
    title: String(b.title || '').trim().slice(0, 200),
    summary: String(b.summary || '').trim().slice(0, 400),
    body: String(b.body || '').trim().slice(0, 100000),
    image: /^(https?:\/\/|img\/)/i.test(image) ? image : '',
    published: b.published !== false,
  };
};
adminRouter.get('/api/blogs', (req, res) => res.json(store.listBlogs(false)));
adminRouter.get('/api/blog/:id', (req, res) => res.json(store.getBlog(Number(req.params.id)) || null));
adminRouter.post('/api/blog', (req, res) => {
  const b = cleanBlog(req.body || {});
  if (!b.title || !b.body) return res.status(400).json({ ok: false, error: 'Title and content are required.' });
  res.json({ ok: true, id: Number(store.addBlog(b).lastInsertRowid) });
});
adminRouter.put('/api/blog/:id', (req, res) => {
  const b = cleanBlog(req.body || {});
  if (!b.title || !b.body) return res.status(400).json({ ok: false, error: 'Title and content are required.' });
  store.updateBlog(Number(req.params.id), b);
  res.json({ ok: true });
});
adminRouter.delete('/api/blog/:id', (req, res) => {
  store.deleteBlog(Number(req.params.id));
  res.json({ ok: true });
});

// YouTube videos / Shorts
adminRouter.get('/api/videos', (req, res) => res.json(store.listVideos()));
adminRouter.post('/api/video', (req, res) => {
  const url = String((req.body || {}).url || '').trim();
  const youtubeId = parseYouTubeId(url);
  if (!youtubeId) return res.status(400).json({ ok: false, error: 'That does not look like a YouTube video or Shorts link.' });
  const kind = /\/shorts\//i.test(url) || (req.body || {}).kind === 'short' ? 'short' : 'video';
  store.addVideo({ youtubeId, kind, title: String((req.body || {}).title || '').trim().slice(0, 150) });
  res.json({ ok: true });
});
adminRouter.delete('/api/video/:id', (req, res) => {
  store.deleteVideo(Number(req.params.id));
  res.json({ ok: true });
});

// site settings (social links)
const SETTING_KEYS = ['youtube', 'instagram', 'linkedin', 'facebook'];
adminRouter.post('/api/settings', (req, res) => {
  for (const k of SETTING_KEYS) {
    if (req.body && k in req.body) {
      const v = String(req.body[k] || '').trim().slice(0, 300) || '#';
      if (v !== '#' && !/^https:\/\//i.test(v)) return res.status(400).json({ ok: false, error: `${k}: link must start with https://` });
      store.setSetting(k, v);
    }
  }
  res.json({ ok: true, settings: store.getSettings() });
});
app.use('/admin', adminRouter);

// ---------- public content ----------
function parseYouTubeId(url) {
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(url);
  return m ? m[1] : null;
}
app.get('/api/settings', (req, res) => res.json(store.getSettings()));
app.get('/api/videos', (req, res) => res.json(store.listVideos()));
app.get('/api/blogs', (req, res) => res.json(store.listBlogs(true)));
app.get('/api/blogs/:id', (req, res) => {
  const b = store.getBlog(Number(req.params.id));
  if (!b || !b.published) return res.status(404).json({ ok: false });
  res.json(b);
});

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.listen(PORT, (err) => {
  if (err) {
    console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop the other server or set a different PORT.` : err);
    process.exit(1);
  }
  console.log(`Site running at http://localhost:${PORT}`);
});
