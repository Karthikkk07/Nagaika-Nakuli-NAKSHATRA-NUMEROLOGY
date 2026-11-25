require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const nodemailer = require('nodemailer');
const store = require('./db');
const engine = require('./lib/engine');
const { buildOrderPdf } = require('./lib/pdf');
const presence = require('./lib/presence');
const totp = require('./lib/totp');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind the host's reverse proxy, so req.ip is the real client
app.use(compression());
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.get('/healthz', (req, res) => {
  try {
    store.db.prepare('SELECT 1').get();
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false });
  }
});

// Admin-controlled switches (Settings tab), cached for a few seconds
let settingsCache = { at: 0, s: {} };
const liveSettings = () => {
  if (Date.now() - settingsCache.at > 3000) settingsCache = { at: Date.now(), s: store.getSettings() };
  return settingsCache.s;
};
const flagOn = (key, def) => (liveSettings()[key] || def) === 'on';

app.use((req, res, next) => {
  if (!flagOn('maintenance_mode', 'off')) return next();
  if (req.path.startsWith('/admin') || req.path === '/healthz' || req.path === '/api/settings' || req.path === '/api/payments/razorpay/webhook' || req.path.startsWith('/img/')) return next();
  res.set('Retry-After', '600');
  if (req.path.startsWith('/api/')) return res.status(503).json({ ok: false, error: 'The site is under maintenance. Please try again shortly.' });
  res.status(503).sendFile(path.join(__dirname, 'public', 'maintenance.html'));
});
const ordersGate = (req, res, next) =>
  flagOn('orders_on', 'on') ? next() : res.status(503).json({ ok: false, error: 'Online booking is paused for now. Please call or WhatsApp us on 9845610894.' });
app.post(['/api/orders', '/api/orders/:id/pay', '/api/orders/:id/demo-pay'], ordersGate);

// ---------- live visitors ----------
const todayIn = presence.totals().day;
presence.seed(store.getDailyStats(todayIn));
setInterval(() => { try { store.saveDailyStats(presence.totals()); } catch (e) { console.error(e); } }, 60 * 1000).unref();
app.post('/api/presence', rateLimit(120, 60 * 1000), express.json({ limit: '2kb' }), (req, res) => {
  const b = req.body || {};
  const id = String(b.id || '');
  if (/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
    const page = String(b.page || '/').replace(/[?#].*$/, '').slice(0, 80) || '/';
    presence.ping(id, page, b.view === true);
  }
  res.status(204).end();
});
app.get('/api/online', (req, res) => {
  res.set('Cache-Control', 'public, max-age=10');
  if (!flagOn('show_online', 'off')) return res.json({ show: false });
  res.json({ show: true, online: presence.online() });
});

// Razorpay webhook: needs the raw body to check the signature, so it is registered before the JSON parser.
// It makes payment status independent of the browser: a customer who closes the tab after paying is still recorded.
app.post('/api/payments/razorpay/webhook', express.raw({ type: '*/*', limit: '200kb' }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const sig = String(req.get('x-razorpay-signature') || '');
  if (!secret || !Buffer.isBuffer(req.body) || !sig) return res.status(400).json({ ok: false });
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return res.status(400).json({ ok: false });
  let evt;
  try { evt = JSON.parse(req.body.toString('utf8')); } catch (e) { return res.status(400).json({ ok: false }); }
  try {
    await handleRazorpayEvent(evt);
  } catch (e) {
    console.error('Webhook handling failed', e);
    return res.status(500).json({ ok: false }); // Razorpay retries on non-2xx
  }
  res.json({ ok: true });
});

// Nadi Astrology orders carry a small fingerprint image, so only order creation gets a larger body limit
const bigJson = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.method === 'POST' && req.path === '/api/orders' ? bigJson(req, res, next) : next()));
app.use(express.json({ limit: '200kb' }));
// Pages get a canonical link added when served (search engines then treat www/http variants as one page)
const pageCache = new Map();
app.get(/^\/(?:[\w-]+\.html)?$/, (req, res, next) => {
  const name = req.path === '/' ? 'index.html' : req.path.slice(1);
  if (name === '404.html') return next();
  const file = path.join(__dirname, 'public', name);
  let st;
  try { st = fs.statSync(file); } catch (e) { return next(); }
  let c = pageCache.get(file);
  if (!c || c.m !== st.mtimeMs) { c = { m: st.mtimeMs, html: fs.readFileSync(file, 'utf8') }; pageCache.set(file, c); }
  if (/name="robots" content="noindex"/.test(c.html)) return next();
  let q = '';
  if (name === 'blog-post.html' && /^\d{1,9}$/.test(String(req.query.id || ''))) q = `?id=${req.query.id}`;
  else if (name === 'service.html' && req.query.service) q = `?service=${encodeURIComponent(String(req.query.service).slice(0, 100))}`;
  const url = siteUrl(req) + (name === 'index.html' ? '/' : '/' + name) + q;
  res.set('Cache-Control', 'no-cache').type('html').send(c.html.replace('</head>', `<link rel="canonical" href="${esc(url)}">\n</head>`));
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, file) => {
    if (/\.html$/i.test(file)) res.set('Cache-Control', 'no-cache');
    else if (/[\\/](img|downloads)[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=604800');
    else res.set('Cache-Control', 'public, max-age=300');
  },
}));

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
// forget old rate-limit records so memory does not grow with every visitor
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of hits) if (!v.length || v[v.length - 1] < cutoff) hits.delete(k);
}, 10 * 60 * 1000).unref();

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
  const r = await fetch(`${process.env.TWILIO_API_URL || 'https://api.twilio.com'}/2010-04-01/Accounts/${sid}/Messages.json`, {
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

// WhatsApp Business Cloud API (Meta). Needs an approved message template; unset means "not configured".
const WA_ON = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
async function sendWhatsAppTemplate(to, template, params) {
  if (!WA_ON || !to) return false;
  const r = await fetch(`${process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v20.0'}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to).replace(/\D/g, ''),
      type: 'template',
      template: { name: template, language: { code: process.env.WHATSAPP_LANG || 'en' }, components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t).slice(0, 200) })) }] },
    }),
  });
  if (!r.ok) throw new Error('WhatsApp provider error ' + r.status);
  return true;
}

const SITE_NAME = 'Nagaika, Nakuli Numerology';
const CONTACT_LINE = 'call or WhatsApp us on 9845610894';

// Tell the customer about a payment problem or refund by WhatsApp (if set up) and email, and keep a record on the order
async function notifyCustomer(order, kind, extra = {}) {
  const msgs = {
    payment_failed: {
      template: process.env.WHATSAPP_TEMPLATE_PAYMENT_FAILED || 'payment_failed',
      params: [order.name, order.service],
      subject: `Your payment for ${order.service} did not go through`,
      body: `Dear ${order.name}, your payment for ${order.service} did not go through. If any money was deducted, your bank usually returns it within 5 to 7 working days. You can try again on our website, or ${CONTACT_LINE}.`,
    },
    refund: {
      template: process.env.WHATSAPP_TEMPLATE_REFUND || 'refund_processed',
      params: [order.name, `Rs ${extra.amount}`, order.service],
      subject: `Refund for ${order.service}`,
      body: `Dear ${order.name}, we have refunded Rs ${extra.amount} for ${order.service}. It normally reaches you in 5 to 7 working days, depending on your bank. For questions, ${CONTACT_LINE}.`,
    },
  }[kind];
  if (!msgs) return;
  const jobs = [];
  if (WA_ON) jobs.push(sendWhatsAppTemplate(order.phone, msgs.template, msgs.params).then(() => store.addOrderMessage({ orderId: order.id, channel: 'whatsapp', subject: msgs.subject, body: msgs.body, sent: true })));
  if (mailer && order.email && /@/.test(order.email) && !/invalid$/.test(order.email)) {
    jobs.push(sendMailTo(order.email, `${msgs.subject} | ${SITE_NAME}`, `<p>${esc(msgs.body)}</p><p>${SITE_NAME}, Bengaluru</p>`, msgs.body).then(() => store.addOrderMessage({ orderId: order.id, channel: 'email', subject: msgs.subject, body: msgs.body, sent: true })));
  }
  (await Promise.allSettled(jobs)).forEach((r) => r.status === 'rejected' && console.error('Customer notification failed:', r.reason));
}

// Razorpay events: status changes arrive here even if the customer closed the browser after paying
async function handleRazorpayEvent(evt) {
  const ent = (k) => evt.payload && evt.payload[k] && evt.payload[k].entity;
  if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
    const pay = ent('payment');
    if (!pay) return;
    const order = store.getOrderByRzp(pay.order_id);
    if (!order) return console.warn('Webhook for unknown Razorpay order', pay.order_id);
    if (Number(pay.amount) !== order.amount * 100) return console.error(`Webhook amount mismatch for order ${order.id}: got ${pay.amount}, expected ${order.amount * 100}`);
    store.markPaymentPaid(pay.order_id, pay.id);
    if (store.markOrderPaid(order.id, 'razorpay', pay.id)) await finalizeOrder(order.id).catch((e) => console.error('Order finalize failed', e));
  } else if (evt.event === 'payment.failed') {
    const pay = ent('payment');
    const order = pay && store.getOrderByRzp(pay.order_id);
    if (!order || order.pay_status === 'paid') return;
    store.markPaymentStatus(pay.order_id, 'failed');
    const reason = (pay.error_description || pay.error_reason || 'unknown reason').toString().slice(0, 120);
    await Promise.allSettled([
      notifyCustomer(order, 'payment_failed'),
      sendEmail(`Payment failed: ${order.service} - ${order.name}`, `<p>Payment failed for <b>${esc(order.service)}</b> (${esc(order.name)}, ${esc(order.phone)}). Reason: ${esc(reason)}</p>`, `Payment failed: ${order.service}, ${order.name}, ${order.phone}. Reason: ${reason}`),
      sendSms(process.env.ADMIN_PHONE, `Payment failed: ${order.service}, ${order.name}, ${order.phone}`),
    ]);
  } else if (evt.event === 'refund.processed') {
    const rf = ent('refund');
    const order = rf && store.getOrderByPayment(rf.payment_id);
    if (order && order.refund_status !== 'refunded') store.markOrderRefunded(order.id, rf.id, Math.round(rf.amount / 100));
  }
}

// ---------- config for the front-end ----------
// Without Razorpay keys payments run in a clearly labelled demo mode so the whole flow can be shown.
// Outside production it is on by default; in production set DEMO_PAYMENTS=true to keep it (e.g. for a prototype link).
const RZP_ON = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const DEMO_PAY = !RZP_ON && (process.env.DEMO_PAYMENTS === 'true' || process.env.NODE_ENV !== 'production');

const SMS_ON = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
// Mobile OTP is mandatory on every form that collects a phone number. It switches on by itself once SMS is set up
// (it cannot work without SMS). OTP_REQUIRED=false is an emergency switch-off, for example during an SMS outage.
const otpRequired = () => SMS_ON && process.env.OTP_REQUIRED !== 'false';

app.get('/api/config', (req, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
    paypalLink: process.env.PAYPAL_ME_LINK || null,
    demoPayments: DEMO_PAY,
    otpRequired: otpRequired(),
  });
});

// ---------- OTP (optional phone verification) ----------
const otps = new Map(); // phone -> { code, expires, verifiedUntil }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otps) if (Math.max(v.expires || 0, v.tokenExpires || 0) < now) otps.delete(k);
  if (detailAlertAt.size > 5000) detailAlertAt.clear();
}, 5 * 60 * 1000).unref();

function verifiedPhone(phone, token) {
  const rec = phone && otps.get(phone);
  return !!(token && rec && rec.token === token && rec.tokenExpires > Date.now());
}

// WhatsApp note for every number that passed OTP but sent wrong details. Only verified numbers are messaged,
// so nobody can make us message a stranger; a cap of 5 per hour per number stops a loop from flooding someone.
const detailAlertAt = new Map();
function alertBadDetails(phone, name, reason) {
  if (!WA_ON) return;
  const now = Date.now();
  const recent = (detailAlertAt.get(phone) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= 5) return;
  recent.push(now);
  detailAlertAt.set(phone, recent);
  sendWhatsAppTemplate(phone, process.env.WHATSAPP_TEMPLATE_DETAILS_ERROR || 'details_error', [name || 'there', reason])
    .catch((e) => console.error('Details alert failed:', e.message));
}

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
  if (Object.keys(errors).length) {
    // a verified number that submitted wrong details gets a WhatsApp message explaining what to fix
    if (phone && verifiedPhone(phone, b.otpToken)) alertBadDetails(phone, d.name, Object.values(errors)[0]);
    return res.status(400).json({ ok: false, errors });
  }

  const verified = verifiedPhone(phone, b.otpToken);
  if (otpRequired() && !verified) return res.status(403).json({ ok: false, needOtp: true, error: 'Please verify your mobile number with the code we send you.' });

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
  const verified = verifiedPhone(phone, b.otpToken);
  if (otpRequired() && !verified) return res.status(403).json({ ok: false, needOtp: true, error: 'Please verify your mobile number with the code we send you.' });

  const topic = clean(b.topic, 300);
  const entry = {
    id: crypto.randomUUID(), receivedAt: new Date().toISOString(), phoneVerified: verified, name, email: '', phone,
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
  const verified = verifiedPhone(phone, b.otpToken);
  if (otpRequired() && !verified) return res.status(403).json({ ok: false, needOtp: true, error: 'Please verify your mobile number with the code we send you.' });
  if (!gender || !dob) {
    const why = 'Please choose Male or Female and enter your date of birth.';
    if (verified) alertBadDetails(phone, name, why);
    return res.status(400).json({ ok: false, error: why });
  }

  const tob = /^\d{2}:\d{2}$/.test(String(b.tob)) ? String(b.tob) : 'unknown';
  const message = `Horoscope in Numerology form. Gender: ${gender}. Time of birth: ${tob}${b.tobUnknown ? ' (not known, noon used)' : ''}. Place of birth: ${clean(b.pob, 100) || '-'}. ${clean(b.summary, 400)}`;
  const entry = {
    id: crypto.randomUUID(), receivedAt: new Date().toISOString(), phoneVerified: verified, name, email: '', phone,
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
  let badPhone = null, badName = '';
  try {
    const svc = engine.SERVICES.find((s) => s.name === b.service);
    if (!svc) throw new BadInput('Please choose a service.');
    const name = c(b.name, 100), phone = normPhone(c(b.phone, 20)), email = c(b.email, 150).toLowerCase();
    badPhone = phone; badName = name;
    if (name.length < 2) throw new BadInput('Please enter your name.');
    if (!phone) throw new BadInput('Please enter a valid mobile number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new BadInput('Please enter a valid email address.');
    if (otpRequired()) {
      const rec = otps.get(phone);
      if (!(b.otpToken && rec && rec.token === b.otpToken && rec.tokenExpires > Date.now())) {
        return res.status(403).json({ ok: false, needOtp: true, error: 'Please verify your mobile number with the code we send you.' });
      }
    }

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
    if (e instanceof BadInput) {
      if (badPhone && verifiedPhone(badPhone, b.otpToken)) alertBadDetails(badPhone, badName, e.message);
      return res.status(400).json({ ok: false, error: e.message });
    }
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
  if (store.markOrderPaid(o.id, 'demo', 'DEMO-' + crypto.randomBytes(4).toString('hex').toUpperCase())) {
    await finalizeOrder(o.id).catch((e) => console.error('Order finalize failed', e));
  }
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
    if (store.markOrderPaid(order.id, 'razorpay', p)) await finalizeOrder(order.id).catch((e) => console.error('Order finalize failed', e));
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
const TOTP_SECRET = process.env.ADMIN_TOTP_SECRET || '';
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
  if (TOTP_SECRET) return false; // with two-factor on, only the login page (password + code) is accepted
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
const audit = (req, action, target, detail) => {
  try { store.addAudit({ action, target, detail, ip: req.ip }); } catch (e) { console.error('Audit failed', e); }
};

// Lock an address out for 15 minutes after 5 wrong sign-ins
const loginFails = new Map();
const LOCK_AFTER = 5, LOCK_MS = 15 * 60 * 1000;

const adminRouter = express.Router();
adminRouter.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'login.html')));
adminRouter.get('/login-info', (req, res) => res.json({ totp: !!TOTP_SECRET }));
adminRouter.post('/login', rateLimit(30, 10 * 60 * 1000), (req, res) => {
  const rec = loginFails.get(req.ip) || { n: 0, until: 0 };
  if (rec.until > Date.now()) return res.status(429).json({ ok: false, error: 'Too many wrong attempts. Please try again in 15 minutes.' });
  const { username, password, code } = req.body || {};
  const good = credsOk(String(username || ''), String(password || '')) && (!TOTP_SECRET || totp.verify(TOTP_SECRET, code));
  if (!good) {
    rec.n++;
    if (rec.n >= LOCK_AFTER) { rec.until = Date.now() + LOCK_MS; rec.n = 0; }
    loginFails.set(req.ip, rec);
    audit(req, 'login_failed', String(username || '').slice(0, 40));
    return res.status(401).json({ ok: false, error: TOTP_SECRET ? 'Wrong username, password or code.' : 'Wrong username or password.' });
  }
  loginFails.delete(req.ip);
  audit(req, 'login', String(username).slice(0, 40));
  const exp = String(Date.now() + SESSION_MS);
  const flags = `HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}` + (req.secure ? '; Secure' : '');
  res.set('Set-Cookie', `admin_session=${encodeURIComponent(exp + '.' + sign(exp))}; ${flags}`).json({ ok: true });
});
adminRouter.post('/logout', (req, res) => {
  res.set('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0').json({ ok: true });
});
adminRouter.use(adminAuth);
// every change made in the admin area is recorded (what, where from; never the customer's data)
adminRouter.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) audit(req, req.method, req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').slice(0, 120)); });
  next();
});
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

// Refund a paid order in full or in part. Razorpay orders call the Razorpay refund API; demo orders are only marked.
adminRouter.post('/api/orders/:id/refund', async (req, res) => {
  const o = store.getOrder(req.params.id);
  if (!o || o.pay_status !== 'paid') return res.status(404).json({ ok: false, error: 'Only paid orders can be refunded.' });
  if (o.refund_status === 'refunded') return res.status(409).json({ ok: false, error: 'This order has already been refunded.' });
  const amount = req.body && req.body.amount ? Math.round(Number(req.body.amount)) : o.amount;
  if (!Number.isFinite(amount) || amount < 1 || amount > o.amount) return res.status(400).json({ ok: false, error: `Enter an amount between Rs 1 and Rs ${o.amount}.` });
  let refundId;
  if (o.pay_mode === 'razorpay') {
    if (!RZP_ON) return res.status(503).json({ ok: false, error: 'Razorpay keys are not set on the server.' });
    try {
      const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(o.payment_id)}/refund`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount * 100, speed: 'normal', receipt: 'ref_' + o.id.slice(0, 8), notes: { order: o.id } }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));
      refundId = data.id;
    } catch (e) {
      console.error('Refund failed', e);
      return res.status(502).json({ ok: false, error: 'Razorpay could not process the refund. Check the Razorpay dashboard.' });
    }
  } else {
    refundId = 'DEMO-REFUND-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  }
  store.markOrderRefunded(o.id, refundId, amount);
  audit(req, 'refund', o.id.slice(0, 8), `Rs ${amount} (${o.pay_mode})`);
  notifyCustomer(o, 'refund', { amount }).catch(() => {});
  res.json({ ok: true, refundId });
});

// Data protection: erase everything held about one person (by mobile number and/or email)
adminRouter.post('/api/erase', (req, res) => {
  const phone = normPhone(String((req.body || {}).phone || ''));
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!phone && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: 'Enter a mobile number or an email address.' });
  const r = store.erasePerson({ phone, email });
  audit(req, 'erase_person', `${r.enquiries} enquiries, ${r.orders} orders`);
  res.json({ ok: true, ...r });
});
adminRouter.get('/api/audit', (req, res) => res.json(store.listAudit(300)));

// Download a copy of the whole database (contains personal data: keep it private)
adminRouter.get('/backup.db', (req, res) => {
  const file = path.join(os.tmpdir(), `backup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`);
  try {
    store.backupTo(file);
  } catch (e) {
    console.error('Backup failed', e);
    return res.status(500).send('Backup failed.');
  }
  audit(req, 'download_backup', '');
  res.download(file, `numerology-backup-${new Date().toISOString().slice(0, 10)}.db`, () => fs.unlink(file, () => {}));
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
adminRouter.post('/api/blogs/starter', (req, res) => {
  let added = 0;
  for (const p of require('./lib/starter-blogs')) {
    if (store.blogTitleExists(p.title)) continue;
    store.addBlog({ title: p.title, summary: p.summary, body: p.body, image: '', published: false });
    added++;
  }
  res.json({ ok: true, added });
});
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

// site settings (social links and switches)
const SETTING_KEYS = ['youtube', 'instagram', 'linkedin', 'facebook'];
const TOGGLE_KEYS = ['maintenance_mode', 'orders_on', 'show_online'];
adminRouter.get('/api/live', (req, res) => {
  res.set('Cache-Control', 'no-store');
  store.saveDailyStats(presence.totals());
  res.json({ ...presence.snapshot(), history: store.listDailyStats(14) });
});
adminRouter.post('/api/settings', (req, res) => {
  for (const k of SETTING_KEYS) {
    if (req.body && k in req.body) {
      const v = String(req.body[k] || '').trim().slice(0, 300) || '#';
      if (v !== '#' && !/^https:\/\//i.test(v)) return res.status(400).json({ ok: false, error: `${k}: link must start with https://` });
      store.setSetting(k, v);
    }
  }
  for (const k of TOGGLE_KEYS) {
    if (req.body && k in req.body) store.setSetting(k, req.body[k] === 'on' ? 'on' : 'off');
  }
  if (req.body && 'ga4_id' in req.body) {
    const g = String(req.body.ga4_id || '').trim().toUpperCase();
    if (g && !/^G-[A-Z0-9]{6,12}$/.test(g)) return res.status(400).json({ ok: false, error: 'Analytics ID must look like G-XXXXXXXXXX.' });
    store.setSetting('ga4_id', g);
  }
  settingsCache.at = 0;
  res.json({ ok: true, settings: store.getSettings() });
});
// ---------- IndiaMART leads (optional): pulls new enquiries into the Enquiries tab ----------
const indiamart = require('./lib/indiamart');
const IM_GAP_MS = 5 * 60 * 1000 + 15000; // IndiaMART allows one call every 5 minutes
let imLastCall = 0, imBusy = false;
async function syncIndiaMart() {
  const key = process.env.INDIAMART_CRM_KEY;
  if (!key) return { ok: false, error: 'The IndiaMART key (INDIAMART_CRM_KEY) is not set on the server.' };
  if (imBusy || Date.now() - imLastCall < IM_GAP_MS) return { ok: false, error: 'IndiaMART allows one sync every 5 minutes. Please wait and try again.' };
  imBusy = true;
  imLastCall = Date.now();
  try {
    const s = store.getSettings();
    const end = Date.now();
    const since = Number(s.indiamart_last_ms) > 0 ? Number(s.indiamart_last_ms) - 2 * 60 * 1000 : end - 24 * 3600 * 1000;
    const r = await indiamart.fetchLeads(key, since, end);
    if (!r.ok) {
      store.setSetting('indiamart_last_error', `${new Date().toISOString()} ${r.error}`);
      return { ok: false, error: r.error };
    }
    const fresh = [];
    for (const lead of r.leads) {
      const e = indiamart.toEnquiry(lead);
      if (e && store.addEnquiryIfNew(e)) fresh.push(e);
    }
    store.setSetting('indiamart_last_ms', String(end));
    store.setSetting('indiamart_last_ok', new Date(end).toISOString());
    store.setSetting('indiamart_last_error', '');
    store.setSetting('indiamart_total', String((Number(s.indiamart_total) || 0) + fresh.length));
    if (fresh.length) {
      const text = fresh.map((e) => `${e.name}, ${e.phone || e.email}, ${e.service}`).join('\n');
      const html = '<h3>New IndiaMART leads</h3><ul>' + fresh.map((e) => `<li><b>${esc(e.name)}</b>, ${esc(e.phone || e.email)}<br>${esc(e.service)}<br>${esc(e.message)}</li>`).join('') + '</ul>';
      Promise.allSettled([
        sendEmail(`${fresh.length} new IndiaMART lead${fresh.length > 1 ? 's' : ''}`, html, text),
        sendSms(process.env.ADMIN_PHONE, `${fresh.length} new IndiaMART lead${fresh.length > 1 ? 's' : ''}. Open the admin Enquiries tab.`),
      ]).then((rs) => rs.forEach((x) => x.status === 'rejected' && console.error('IndiaMART notification failed:', x.reason)));
    }
    return { ok: true, fetched: r.leads.length, added: fresh.length };
  } catch (e) {
    console.error('IndiaMART sync failed', e);
    return { ok: false, error: 'IndiaMART sync failed.' };
  } finally {
    imBusy = false;
  }
}
if (process.env.INDIAMART_CRM_KEY) {
  setTimeout(syncIndiaMart, 30 * 1000).unref();
  setInterval(syncIndiaMart, 6 * 60 * 1000).unref();
}
adminRouter.get('/api/indiamart', (req, res) => {
  const s = store.getSettings();
  res.json({ configured: !!process.env.INDIAMART_CRM_KEY, lastOk: s.indiamart_last_ok || '', lastError: s.indiamart_last_error || '', total: Number(s.indiamart_total) || 0 });
});
adminRouter.post('/api/indiamart/sync', async (req, res) => res.json(await syncIndiaMart()));
adminRouter.get('/api/settings', (req, res) => res.json(store.getSettings()));
app.use('/admin', adminRouter);

// ---------- public content ----------
function parseYouTubeId(url) {
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(url);
  return m ? m[1] : null;
}
// Public settings are a short allow-list; switches, sync state and similar stay admin-only
const PUBLIC_SETTINGS = ['youtube', 'instagram', 'facebook', 'linkedin', 'show_online', 'ga4_id'];
app.get('/api/settings', (req, res) => {
  const s = store.getSettings();
  res.json(Object.fromEntries(PUBLIC_SETTINGS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));
});
const siteUrl = (req) => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
app.get('/api/videos', (req, res) => res.json(store.listVideos()));
app.get('/api/blogs', (req, res) => res.json(store.listBlogs(true)));
app.get('/api/blogs/:id', (req, res) => {
  const b = store.getBlog(Number(req.params.id));
  if (!b || !b.published) return res.status(404).json({ ok: false });
  res.json(b);
});

// ---------- e-visiting card ----------
// Edit these details to change the card, the downloadable contact file (vCard) and the QR code.
const CARD = {
  org: 'Nagaika, Nakuli Numerology',
  title: 'Numerology & Nakshatra Consultancy',
  tagline: 'Numerology, Nakshatra, Nadi astrology, marriage matching and naming consultations',
  phone: '+919845610894',
  whatsapp: '919845610894',
  email: 'anand@arninvest.in',
  street: '2, P2, 4th Floor, No. 95, Gold Signature, Mosque Road, Fraser Town',
  city: 'Bengaluru',
  region: 'Karnataka',
  postal: '560005',
  country: 'India',
};
app.get('/api/card', (req, res) => res.json({ ...CARD, url: siteUrl(req) + '/', cardUrl: siteUrl(req) + '/card.html' }));
app.get('/card.vcf', (req, res) => {
  const v = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0', `FN:${v(CARD.org)}`, 'N:;;;;', `ORG:${v(CARD.org)}`, `TITLE:${v(CARD.title)}`,
    `TEL;TYPE=WORK,VOICE:${CARD.phone}`, `EMAIL;TYPE=WORK:${CARD.email}`,
    `ADR;TYPE=WORK:;;${v(CARD.street)};${v(CARD.city)};${v(CARD.region)};${CARD.postal};${v(CARD.country)}`,
    `URL:${siteUrl(req)}/`, 'END:VCARD',
  ];
  res.type('text/vcard; charset=utf-8').set('Content-Disposition', 'attachment; filename="nagaika-nakuli-numerology.vcf"').send(lines.join('\r\n') + '\r\n');
});
app.get('/card-qr.svg', async (req, res) => {
  try {
    const svg = await require('qrcode').toString(siteUrl(req) + '/card.html', { type: 'svg', margin: 1, width: 240 });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
  } catch (e) {
    res.status(500).end();
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nAllow: /\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const base = siteUrl(req);
  const pages = ['', 'about.html', 'services.html', 'nakshatra.html', 'tools.html', 'hora.html', 'marriage.html', 'nadi.html', 'blog.html', 'videos.html', 'gallery.html', 'why-choose-us.html', 'faq.html', 'pricing.html', 'card.html', 'contact.html', 'payment.html', 'privacy.html', 'terms.html', 'refund-policy.html', 'disclaimer.html', 'cookies.html'];
  const urls = pages.map((p) => ({ loc: `${base}/${p}` }));
  for (const b of store.listBlogs(true)) urls.push({ loc: `${base}/blog-post.html?id=${b.id}`, lastmod: String(b.created_at).slice(0, 10) });
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
      '\n</urlset>\n'
  );
});

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.use((err, req, res, next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) {
    return res.status(status).json({ ok: false, error: status === 500 ? 'Something went wrong. Please try again.' : 'Invalid request.' });
  }
  res.status(status).sendFile(path.join(__dirname, 'public', status === 500 ? '500.html' : '404.html'));
});

// Local daily backup, kept for 7 days. On hosts with a temporary disk also download copies from the admin Settings tab.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
function dailyBackup() {
  try {
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `numerology-${new Date().toISOString().slice(0, 10)}.db`);
    if (!fs.existsSync(file)) store.backupTo(file);
    const old = fs.readdirSync(dir).filter((f) => /^numerology-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -7);
    old.forEach((f) => fs.unlinkSync(path.join(dir, f)));
  } catch (e) {
    console.error('Daily backup failed', e);
  }
}
dailyBackup();
setInterval(dailyBackup, 6 * 60 * 60 * 1000).unref();

const server = app.listen(PORT, (err) => {
  if (err) {
    console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop the other server or set a different PORT.` : err);
    process.exit(1);
  }
  console.log(`Site running at http://localhost:${PORT}`);
});

// Finish in-flight requests before the host replaces this instance (zero-downtime deploys)
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    try { store.saveDailyStats(presence.totals()); } catch (e) {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  });
}

module.exports = app;
