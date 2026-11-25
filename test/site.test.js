const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 5200 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'numtest-site-'));
const AUTH = { Authorization: 'Basic ' + Buffer.from('admin:testpw123').toString('base64') };
let proc;

test.before(async () => {
  proc = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR, NODE_ENV: 'test', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'testpw123', ADMIN_TOTP_SECRET: '', SITE_URL: 'https://example.test' },
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

test('pages carry a canonical link built from SITE_URL', async () => {
  assert.match(await (await fetch(BASE + '/')).text(), /<link rel="canonical" href="https:\/\/example\.test\/">/);
  assert.match(await (await fetch(BASE + '/about.html')).text(), /href="https:\/\/example\.test\/about\.html"/);
  assert.match(await (await fetch(BASE + '/blog-post.html?id=7')).text(), /href="https:\/\/example\.test\/blog-post\.html\?id=7"/);
  assert.ok(!/canonical/.test(await (await fetch(BASE + '/maintenance.html')).text()));
});

test('visiting card: details, contact file and QR code', async () => {
  const card = await (await fetch(BASE + '/api/card')).json();
  assert.strictEqual(card.cardUrl, 'https://example.test/card.html');
  const vcf = await (await fetch(BASE + '/card.vcf')).text();
  assert.match(vcf, /^BEGIN:VCARD/);
  assert.match(vcf, /TEL;TYPE=WORK,VOICE:\+919845610894/);
  const qr = await fetch(BASE + '/card-qr.svg');
  assert.match(qr.headers.get('content-type'), /^image\/svg\+xml/);
  assert.match(await qr.text(), /<svg/);
  assert.match(await (await fetch(BASE + '/sitemap.xml')).text(), /example\.test\/card\.html/);
});

test('site search finds pages, services, Nakshatras and synonyms', async () => {
  const find = async (q) => (await (await fetch(BASE + '/api/search?q=' + encodeURIComponent(q))).json()).results;
  const marriage = await find('marriage');
  assert.ok(marriage.some((r) => r.title === 'Marriage Compatibility' && r.kind === 'Service'), JSON.stringify(marriage.map((r) => r.title)));
  assert.ok((await find('kundli')).some((r) => /marriage/i.test(r.title)));
  assert.ok((await find('refund')).some((r) => r.url === '/refund-policy.html'));
  assert.ok((await find('fee')).some((r) => r.url === '/pricing.html' || r.kind === 'Service'));
  const star = await find('ashwini');
  assert.strictEqual(star[0].title, 'Ashwini Nakshatra');
  assert.deepStrictEqual(await find('x'), []);
  assert.deepStrictEqual(await find('zzzzqqqq'), []);
  // the search page itself and error pages are not searchable or in the sitemap
  const all = JSON.stringify(await find('search'));
  assert.ok(!all.includes('/search.html') && !all.includes('/404.html'));
  assert.ok(!(await (await fetch(BASE + '/sitemap.xml')).text()).includes('search.html'));
  assert.match(await (await fetch(BASE + '/search.html')).text(), /name="robots" content="noindex"/);
});

test('starter articles are added once, as unpublished drafts', async () => {
  const add = () => fetch(BASE + '/admin/api/blogs/starter', { method: 'POST', headers: AUTH }).then((r) => r.json());
  assert.strictEqual((await add()).added, 4);
  assert.strictEqual((await add()).added, 0);
  assert.strictEqual((await (await fetch(BASE + '/api/blogs')).json()).length, 0);
  const all = await (await fetch(BASE + '/admin/api/blogs', { headers: AUTH })).json();
  assert.strictEqual(all.length, 4);
  assert.ok(all.every((p) => !p.published));
});
