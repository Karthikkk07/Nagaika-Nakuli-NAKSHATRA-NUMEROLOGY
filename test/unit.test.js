const test = require('node:test');
const assert = require('node:assert');
const totp = require('../lib/totp');
const presence = require('../lib/presence');

test('TOTP matches the RFC 6238 test vector', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // ASCII "12345678901234567890"
  assert.strictEqual(totp.codeAt(secret, Math.floor(59 / 30)), '287082');
  assert.ok(totp.verify(secret, '287082', 59000));
  assert.ok(!totp.verify(secret, '000000', 59000));
  assert.ok(!totp.verify(secret, 'abc', 59000));
});

test('TOTP accepts one step of clock drift but not more', () => {
  const secret = totp.generateSecret();
  const now = 1700000000000;
  const code = totp.codeAt(secret, Math.floor(now / 30000));
  assert.ok(totp.verify(secret, code, now + 30000));
  assert.ok(!totp.verify(secret, code, now + 5 * 30000));
});

test('Hora timings match the Hyderabad almanac values for 25 Nov 2026', () => {
  global.window = {};
  global.document = { getElementById: () => null };
  require('../public/js/hora.js');
  const H = window.HORA, tz = 'Asia/Kolkata';
  const d = H.build(2026, 11, 25, 17.385, 78.4867);
  assert.strictEqual(H.fmt(d.rise, tz), '06:26');
  assert.strictEqual(H.fmt(d.set, tz), '17:39');
  assert.strictEqual(d.horas.length, 24);
  assert.strictEqual(d.horas[0].planet, 'Mercury'); // Wednesday
  assert.strictEqual(d.horas[12].planet, 'Sun'); // first night hora
  assert.strictEqual(H.fmt(d.horas[1].from, tz) + '-' + H.fmt(d.horas[1].to, tz), '07:22-08:18');
});

test('IndiaMART helpers format times in IST and map a lead to an enquiry', () => {
  const im = require('../lib/indiamart');
  assert.strictEqual(im.istStamp(Date.UTC(2026, 10, 25, 12, 0, 0)), '25-11-202617:30:00');
  assert.strictEqual(im.queryTimeToIso('2026-11-25 17:30:00'), '2026-11-25T12:00:00.000Z');
  const url = im.buildUrl('k+ey', Date.UTC(2026, 0, 1), Date.UTC(2026, 10, 25));
  assert.match(url, /glusr_crm_key=k%2Bey/);
  // a window longer than 7 days is cut down to the limit
  assert.match(url, /start_time=18-11-2026/);
  const e = im.toEnquiry({ UNIQUE_QUERY_ID: '5', QUERY_TYPE: 'B', SENDER_MOBILE: '+91 98765-43210', QUERY_MESSAGE: 'hi', SENDER_CITY: 'Pune' });
  assert.strictEqual(e.id, 'im-5');
  assert.strictEqual(e.phone, '+919876543210');
  assert.strictEqual(e.name, 'IndiaMART Buyer');
  assert.match(e.message, /Buy lead. hi. Location: Pune/);
  assert.strictEqual(im.toEnquiry({}), null);
});

test('presence counts only recent visitors and de-duplicates by id', () => {
  const t0 = Date.now();
  presence.ping('aaaaaaaa1', '/a', true, t0);
  presence.ping('aaaaaaaa1', '/b', false, t0 + 1000);
  presence.ping('bbbbbbbb2', '/a', true, t0 + 1000);
  assert.strictEqual(presence.online(t0 + 2000), 2);
  assert.strictEqual(presence.online(t0 + presence.ONLINE_MS + 5000), 0);
  const s = presence.snapshot(t0 + 2000);
  assert.strictEqual(s.today.visitors >= 2, true);
  assert.deepStrictEqual(s.pages.map((p) => p.page).sort(), ['/a', '/b']);
});
