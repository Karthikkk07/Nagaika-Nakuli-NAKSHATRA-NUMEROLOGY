// Customer accounts: password hashing and signed session cookies, using only Node's crypto.
const crypto = require('crypto');

const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// The cookie is bound to the password hash, so changing or resetting the password signs the user out everywhere
function sign(secret, userId, exp, passHash) {
  return crypto.createHmac('sha256', secret).update(`${userId}.${exp}.${String(passHash).slice(-24)}`).digest('hex');
}

function makeSession(secret, user, now = Date.now()) {
  const exp = now + SESSION_DAYS * 24 * 3600 * 1000;
  return { value: `${user.id}.${exp}.${sign(secret, user.id, exp, user.pass_hash)}`, maxAgeSec: SESSION_DAYS * 24 * 3600 };
}

// Returns the user id from a cookie value if it is well formed and not expired (the caller then loads the user and calls checkSession)
function parseSession(value) {
  const m = /^(\d+)\.(\d+)\.([0-9a-f]{64})$/.exec(String(value || ''));
  return m ? { id: Number(m[1]), exp: Number(m[2]), sig: m[3] } : null;
}

function checkSession(secret, parsed, user, now = Date.now()) {
  if (!parsed || !user || parsed.exp < now) return false;
  const expected = sign(secret, user.id, parsed.exp, user.pass_hash);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parsed.sig));
}

const newToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// At least 8 characters with a letter and a digit
const passwordProblem = (p) => {
  p = String(p || '');
  if (p.length < 8) return 'Use at least 8 characters.';
  if (p.length > 100) return 'Use at most 100 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use at least one letter and one number.';
  return '';
};

module.exports = { hashPassword, verifyPassword, makeSession, parseSession, checkSession, newToken, hashToken, passwordProblem, SESSION_DAYS };
