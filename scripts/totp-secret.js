// Prints a new secret for admin two-factor login. Put it in .env as ADMIN_TOTP_SECRET, then add it to an authenticator app.
const { generateSecret } = require('../lib/totp');
const secret = generateSecret();
const label = encodeURIComponent('Nagaika Nakuli Admin');
console.log('ADMIN_TOTP_SECRET=' + secret);
console.log('\nAuthenticator app: choose "enter a setup key" and paste the secret above (time based, 6 digits).');
console.log(`Or open this link on a phone with the app installed: otpauth://totp/${label}?secret=${secret}&issuer=${label}`);
