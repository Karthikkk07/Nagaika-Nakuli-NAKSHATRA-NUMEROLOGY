// RFC 6238 time-based one-time passwords (Google Authenticator, Authy, etc.) using only Node's crypto
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(s) {
  const clean = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) bits += ALPHABET.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function base32Encode(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function codeAt(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1000000).padStart(6, '0');
}

// Accepts the current 30-second code and one either side to allow for clock drift
function verify(secret, code, now = Date.now()) {
  const given = String(code || '').replace(/\s+/g, '');
  if (!secret || !/^\d{6}$/.test(given)) return false;
  const step = Math.floor(now / 30000);
  let ok = false;
  for (const d of [-1, 0, 1]) {
    const expected = codeAt(secret, step + d);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) ok = true;
  }
  return ok;
}

module.exports = { generateSecret, codeAt, verify, base32Decode };
