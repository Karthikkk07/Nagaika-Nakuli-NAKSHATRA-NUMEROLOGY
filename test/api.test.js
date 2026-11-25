const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'numtest-'));
const WEBHOOK_SECRET = 'whsec_test';
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:testpw123').toString('base64') };
let proc;

const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const adminPost = (url, body) => fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify(body) });
const webhook = (body, secret = WEBHOOK_SECRET) =>
  fetch(BASE + '/api/payments/razorpay/webhook', { method: 'POST', headers: { 'x-razorpay-signature': crypto.createHmac('sha256', secret).update(body).digest('hex'), 'Content-Type': 'application/json' }, body });

test.before(async () => {
  proc = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_USER: 'admin', ADMIN_PASSWORD: 'testpw123', RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET, RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', NODE_ENV: 'test', ADMIN_TOTP_SECRET: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/healthz')).ok) return; } catch (e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
});

test.after(() => {
  proc.kill();
  setTimeout(() => fs.rmSync(DATA_DIR, { recursive: true, force: true }), 500).unref();
});

test('health, robots and sitemap', async () => {
  assert.strictEqual((await fetch(BASE + '/healthz')).status, 200);
  assert.match(await (await fetch(BASE + '/robots.txt')).text(), /Disallow: \/admin/);
  const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
  assert.match(sitemap, /privacy\.html/);
  assert.match(sitemap, /faq\.html/);
});

test('legal and error pages are served', async () => {
  for (const p of ['privacy', 'terms', 'refund-policy', 'disclaimer', 'cookies', 'faq', 'hora']) {
    assert.strictEqual((await fetch(`${BASE}/${p}.html`)).status, 200, p);
  }
  assert.strictEqual((await fetch(BASE + '/no-such-page')).status, 404);
});

test('admin area needs a login and bad JSON is a clean 400', async () => {
  assert.strictEqual((await fetch(BASE + '/admin/api/data')).status, 401);
  assert.strictEqual((await fetch(BASE + '/admin/api/data', { headers: AUTH })).status, 200);
  const bad = await fetch(BASE + '/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.strictEqual(bad.status, 400);
});

test('live visitors are counted and visible to the admin', async () => {
  await fetch(BASE + '/api/presence', json({ id: 'visitor-test-1', page: '/index.html', view: true }));
  await fetch(BASE + '/api/presence', json({ id: 'bad id!', page: '/x' }));
  const live = await (await fetch(BASE + '/admin/api/live', { headers: AUTH })).json();
  assert.strictEqual(live.online, 1);
  assert.strictEqual(live.today.views, 1);
});

test('order, webhook (signature, idempotency, amount check), refund and erasure', async () => {
  const mk = async (amount, name, phone, email) => (await fetch(BASE + '/api/orders', json({ service: 'Job Guidance', amount, name, phone, email, message: 'hello' }))).json();
  const create = await mk(500, 'Test User', '9876543210', 'test@example.com');
  assert.ok(create.ok, JSON.stringify(create));
  assert.strictEqual(create.amount, 500);

  const evt = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test1', order_id: 'order_test1', amount: 50000 } } } });
  const bad = await fetch(BASE + '/api/payments/razorpay/webhook', { method: 'POST', headers: { 'x-razorpay-signature': 'deadbeef', 'Content-Type': 'application/json' }, body: evt });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await webhook(evt, 'wrong-secret')).status, 400);

  const db = new DatabaseSync(path.join(DATA_DIR, 'numerology.db'));
  db.prepare(`UPDATE orders SET rzp_order_id = 'order_test1' WHERE id = ?`).run(create.id);
  for (let i = 0; i < 2; i++) assert.strictEqual((await webhook(evt)).status, 200);
  const got = db.prepare(`SELECT pay_status, pay_mode, payment_id FROM orders WHERE id = ?`).get(create.id);
  assert.deepStrictEqual({ ...got }, { pay_status: 'paid', pay_mode: 'razorpay', payment_id: 'pay_test1' });
  assert.strictEqual((await fetch(`${BASE}/api/orders/${create.id}`)).status, 200);

  const create2 = await mk(700, 'Second User', '9876500000', 'second@example.com');
  db.prepare(`UPDATE orders SET rzp_order_id = 'order_test2' WHERE id = ?`).run(create2.id);
  await webhook(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test2', order_id: 'order_test2', amount: 100 } } } }));
  assert.strictEqual(db.prepare(`SELECT pay_status FROM orders WHERE id = ?`).get(create2.id).pay_status, 'pending');

  const create3 = await mk(300, 'Third User', '9876511111', 'third@example.com');
  assert.strictEqual((await fetch(`${BASE}/api/orders/${create3.id}/demo-pay`, json({}))).status, 200);
  const refund = await (await adminPost(`/admin/api/orders/${create3.id}/refund`, { amount: 100 })).json();
  assert.ok(refund.ok, JSON.stringify(refund));
  assert.strictEqual((await adminPost(`/admin/api/orders/${create3.id}/refund`, {})).status, 409);

  const er = await (await adminPost('/admin/api/erase', { phone: '9876511111' })).json();
  assert.strictEqual(er.orders, 1);
  const erased = db.prepare(`SELECT name, phone, amount FROM orders WHERE id = ?`).get(create3.id);
  assert.deepStrictEqual({ ...erased }, { name: 'Erased', phone: 'erased', amount: 300 });

  const audit = await (await fetch(BASE + '/admin/api/audit', { headers: AUTH })).json();
  assert.ok(audit.some((a) => a.action === 'refund'));
  assert.ok(audit.some((a) => a.action === 'erase_person'));
  db.close();
});

test('switches: orders can be paused and maintenance mode shows a 503 page', async () => {
  await adminPost('/admin/api/settings', { orders_on: 'off' });
  assert.strictEqual((await fetch(BASE + '/api/orders', json({}))).status, 503);
  await adminPost('/admin/api/settings', { orders_on: 'on', maintenance_mode: 'on' });
  assert.strictEqual((await fetch(BASE + '/index.html')).status, 503);
  assert.strictEqual((await fetch(BASE + '/admin/api/data', { headers: AUTH })).status, 200);
  await adminPost('/admin/api/settings', { maintenance_mode: 'off' });
  assert.strictEqual((await fetch(BASE + '/index.html')).status, 200);
});

test('customer accounts: sign up, sign in, orders, password reset, lockout, delete', async () => {
  const crypto = require('crypto');
  const { DatabaseSync } = require('node:sqlite');
  const cookieOf = (r) => (r.headers.getSetCookie().find((c) => c.startsWith('sid=')) || '').split(';')[0];
  const call = (url, body, cookie) => fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body || {}) });
  const me = async (cookie) => (await (await fetch(BASE + '/api/auth/me', { headers: cookie ? { Cookie: cookie } : {} })).json()).user;

  assert.strictEqual(await me(), null);
  const weak = await call('/api/auth/signup', { name: 'A', phone: '123', email: 'x', password: 'short' });
  assert.strictEqual(weak.status, 400);
  assert.ok(Object.keys((await weak.json()).errors).length >= 4);

  const acct = { name: 'Asha Rao', phone: '9812345678', email: 'Asha@Example.com', password: 'Passw0rd!x' };
  const up = await call('/api/auth/signup', acct);
  assert.strictEqual(up.status, 200);
  let cookie = cookieOf(up);
  assert.ok(cookie.startsWith('sid='));
  assert.match(up.headers.get('set-cookie'), /HttpOnly/);
  const who = await me(cookie);
  assert.deepStrictEqual({ name: who.name, phone: who.phone, email: who.email, phoneVerified: who.phoneVerified }, { name: 'Asha Rao', phone: '+919812345678', email: 'asha@example.com', phoneVerified: false });
  assert.ok(!JSON.stringify(who).includes('pass'));
  assert.strictEqual((await call('/api/auth/signup', acct)).status, 409);
  assert.strictEqual((await me('sid=tampered')), null);

  // an order placed while signed in shows in My orders; someone else's order on the same number does not, until the number is verified
  const mk = (cookieHdr, phone) => fetch(BASE + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookieHdr ? { Cookie: cookieHdr } : {}) }, body: JSON.stringify({ service: 'Job Guidance', amount: 400, name: 'Asha Rao', phone, email: 'asha@example.com', message: 'hi' }) }).then((r) => r.json());
  const mine = await mk(cookie, '9812345678');
  const other = await mk('', '9812345678');
  for (const o of [mine, other]) await fetch(`${BASE}/api/orders/${o.id}/demo-pay`, json({}));
  const list = await (await fetch(BASE + '/api/auth/orders', { headers: { Cookie: cookie } })).json();
  assert.deepStrictEqual(list.orders.map((o) => o.id), [mine.id]);
  assert.strictEqual((await fetch(BASE + '/api/auth/orders')).status, 401);

  // sign in with mobile or email; wrong password is refused and locks out after 5 tries
  assert.strictEqual((await call('/api/auth/signin', { login: '9812345678', password: 'Passw0rd!x' })).status, 200);
  assert.strictEqual((await call('/api/auth/signin', { login: 'ASHA@example.com', password: 'Passw0rd!x' })).status, 200);
  for (let i = 0; i < 5; i++) assert.strictEqual((await call('/api/auth/signin', { login: '9812345678', password: 'nope' + i })).status, 401);
  assert.strictEqual((await call('/api/auth/signin', { login: '9812345678', password: 'Passw0rd!x' })).status, 429);

  // password reset by emailed token: one use, and it signs out the old session
  const db = new DatabaseSync(path.join(DATA_DIR, 'numerology.db'));
  const token = 'a'.repeat(64);
  const uid = db.prepare(`SELECT id FROM users WHERE phone = '+919812345678'`).get().id;
  db.prepare(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)`).run(crypto.createHash('sha256').update(token).digest('hex'), uid, Date.now() + 3600000);
  assert.strictEqual((await call('/api/auth/reset', { token, password: 'weak' })).status, 400);
  const reset = await call('/api/auth/reset', { token, password: 'NewPassw0rd' });
  assert.strictEqual(reset.status, 200);
  const newCookie = cookieOf(reset);
  assert.ok(await me(newCookie));
  assert.strictEqual(await me(cookie), null);
  assert.strictEqual((await call('/api/auth/reset', { token, password: 'AnotherPass1' })).status, 400);
  assert.strictEqual((await call('/api/auth/forgot', { email: 'nobody@example.com' })).status, 200);

  // deleting the account needs the password and keeps the paid order without the link
  assert.strictEqual((await call('/api/auth/delete', { password: 'wrong' }, newCookie)).status, 401);
  assert.strictEqual((await call('/api/auth/delete', { password: 'NewPassw0rd' }, newCookie)).status, 200);
  assert.strictEqual(await me(newCookie), null);
  assert.strictEqual(db.prepare(`SELECT user_id FROM orders WHERE id = ?`).get(mine.id).user_id, null);
  db.close();
});

test('admin sign-in locks out after repeated wrong passwords', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await fetch(BASE + '/admin/login', json({ username: 'admin', password: 'wrong' + i }));
  assert.strictEqual(last.status, 429);
});
