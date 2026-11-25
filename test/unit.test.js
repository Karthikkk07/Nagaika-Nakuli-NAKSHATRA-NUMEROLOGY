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
