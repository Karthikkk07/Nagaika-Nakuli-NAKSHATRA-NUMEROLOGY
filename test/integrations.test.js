const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 4700 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'numtest-int-'));
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:testpw123').toString('base64') };
const sms = [], whatsapp = [];
let mock, proc;

const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const adminPost = (url, body) => fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify(body || {}) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const LEADS = {
  CODE: 200,
  STATUS: 'SUCCESS',
  RESPONSE: [
    { UNIQUE_QUERY_ID: '1001', QUERY_TYPE: 'W', QUERY_TIME: '2026-11-25 10:15:00', SENDER_NAME: 'Ravi Kumar', SENDER_MOBILE: '+91-9811122233', SENDER_EMAIL: 'ravi@example.com', QUERY_PRODUCT_NAME: 'Numerology consultation', QUERY_MESSAGE: 'Need a name correction', SENDER_CITY: 'Hyderabad', SENDER_STATE: 'Telangana' },
    { UNIQUE_QUERY_ID: '1002', QUERY_TYPE: 'WA', QUERY_TIME: '2026-11-25 11:00:00', SENDER_MOBILE: '9822233344' },
  ],
};

test.before(async () => {
  mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.url.startsWith('/indiamart')) return res.end(JSON.stringify(LEADS));
      if (req.url.includes('/Messages.json')) { sms.push(new URLSearchParams(body).get('Body')); return res.end('{}'); }
      if (req.url.endsWith('/messages')) { whatsapp.push(JSON.parse(body)); return res.end('{}'); }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise((r) => mock.listen(0, r));
  const m = `http://localhost:${mock.address().port}`;
  proc = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR, NODE_ENV: 'test', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'testpw123', ADMIN_TOTP_SECRET: '', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '',
      TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+10000000000', TWILIO_API_URL: m, ADMIN_PHONE: '+919800000000',
      WHATSAPP_TOKEN: 'wa', WHATSAPP_PHONE_ID: '123', WHATSAPP_API_URL: m,
      INDIAMART_CRM_KEY: 'testkey', INDIAMART_API_URL: m + '/indiamart/',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/healthz')).ok) return; } catch (e) {}
    await wait(200);
  }
  throw new Error('server did not start');
});

test.after(() => {
  proc.kill();
  mock.close();
  setTimeout(() => fs.rmSync(DATA_DIR, { recursive: true, force: true }), 500).unref();
});

test('OTP is the first step: orders and enquiries are refused until the number is verified', async () => {
  assert.strictEqual((await (await fetch(BASE + '/api/config')).json()).otpRequired, false);
  await adminPost('/admin/api/settings', { otp_orders: 'on' });
  assert.strictEqual((await (await fetch(BASE + '/api/config')).json()).otpRequired, true);

  const order = { service: 'Job Guidance', amount: 500, name: 'Otp User', phone: '9876543210', email: 'otp@example.com', message: 'hello' };
  const blocked = await fetch(BASE + '/api/orders', json(order));
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual((await blocked.json()).needOtp, true);
  const enq = { name: 'Otp User', email: 'otp@example.com', phone: '9876543210', service: 'Job Guidance', message: 'hello there' };
  assert.strictEqual((await fetch(BASE + '/api/enquiry', json(enq))).status, 403);

  assert.strictEqual((await fetch(BASE + '/api/otp/send', json({ phone: '9876543210' }))).status, 200);
  const code = /(\d{6})/.exec(sms[sms.length - 1])[1];
  assert.strictEqual((await fetch(BASE + '/api/otp/verify', json({ phone: '9876543210', code: '000000' }))).status, 400);
  const { token } = await (await fetch(BASE + '/api/otp/verify', json({ phone: '9876543210', code }))).json();
  assert.ok(token);

  const ok = await (await fetch(BASE + '/api/orders', json({ ...order, otpToken: token }))).json();
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.strictEqual((await fetch(BASE + '/api/enquiry', json({ ...enq, otpToken: token }))).status, 200);
  // a token is tied to its number
  assert.strictEqual((await fetch(BASE + '/api/orders', json({ ...order, phone: '9123456780', otpToken: token }))).status, 403);

  // verified number + wrong details: the user is told on WhatsApp, once
  const bad = await fetch(BASE + '/api/orders', json({ ...order, email: 'not-an-email', otpToken: token }));
  assert.strictEqual(bad.status, 400);
  await wait(300);
  assert.strictEqual(whatsapp.length, 1);
  assert.strictEqual(whatsapp[0].template.name, 'details_error');
  assert.strictEqual(whatsapp[0].to, '919876543210');
  await fetch(BASE + '/api/orders', json({ ...order, email: 'still-bad', otpToken: token }));
  await wait(200);
  assert.strictEqual(whatsapp.length, 1);
});

test('an unverified number never gets a WhatsApp message about wrong details', async () => {
  const before = whatsapp.length;
  await fetch(BASE + '/api/orders', json({ service: 'Job Guidance', amount: 500, name: 'X Y', phone: '9000000001', email: 'bad', message: 'm' }));
  await wait(200);
  assert.strictEqual(whatsapp.length, before);
});

test('IndiaMART leads are imported as enquiries', async () => {
  const r = await (await adminPost('/admin/api/indiamart/sync')).json();
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.added, 2);
  const data = await (await fetch(BASE + '/admin/api/data', { headers: AUTH })).json();
  const im = data.enquiries.filter((e) => e.source === 'indiamart');
  assert.strictEqual(im.length, 2);
  const ravi = im.find((e) => e.name === 'Ravi Kumar');
  assert.strictEqual(ravi.phone, '+919811122233');
  assert.strictEqual(ravi.service, 'Numerology consultation');
  assert.ok(im.some((e) => e.name === 'IndiaMART Buyer'));
  const status = await (await fetch(BASE + '/admin/api/indiamart', { headers: AUTH })).json();
  assert.deepStrictEqual({ configured: status.configured, total: status.total }, { configured: true, total: 2 });
  // IndiaMART allows one call per 5 minutes
  assert.strictEqual((await (await adminPost('/admin/api/indiamart/sync')).json()).ok, false);
});

test('public settings expose only the allow-list', async () => {
  const s = await (await fetch(BASE + '/api/settings')).json();
  assert.ok(!('otp_orders' in s) && !('indiamart_total' in s) && !('maintenance_mode' in s));
  assert.ok('youtube' in s);
});
