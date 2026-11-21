# Deploying

The app is one Node.js process (Node 22.13+; the Dockerfile uses Node 24) with a SQLite database file. **The database folder must be on a persistent disk**, or enquiries are lost on every restart.

## Environment variables (set these in your host's dashboard, not in git)

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | **Required.** Password for `/admin`. Without it, the admin page is disabled. |
| `ADMIN_USER` | Admin username (default `admin`) |
| `DATA_DIR` | Folder for `numerology.db`. Point it at the persistent disk (the Dockerfile uses `/data`) |
| `PORT` | Usually set by the host |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `ADMIN_EMAIL` | Email notifications (optional) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `ADMIN_PHONE` | SMS notifications and OTP (optional) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Real online payments (optional) |
| `DEMO_PAYMENTS` | Set to `true` on a prototype link: payment then runs in a labelled demo mode (no money moves) while the PDF and admin flow still work. Ignored once Razorpay keys are set. The Docker image runs in production mode, so without this (or Razorpay keys) the Pay step is disabled |
| `PAYPAL_ME_LINK` | PayPal button (optional) |

## Option A: Docker host (Railway, Render, Fly.io, any VPS)

1. Push this folder to a GitHub repo (`.env` and `data/` are git-ignored).
2. Create a service from the repo; it will use the `Dockerfile`.
3. Add a **persistent volume** mounted at `/data`.
4. Set `ADMIN_PASSWORD` and, for the prototype link, `DEMO_PAYMENTS=true` (plus any optional variables above).
5. Health check path: `/healthz`.

## Option B: VPS without Docker

```
git clone <repo> && cd numerology-website
npm ci --omit=dev
ADMIN_PASSWORD=... PORT=3000 node server.js     # run under pm2 or systemd
```
Put nginx or Caddy in front for HTTPS and point the domain (e.g. numerologybangalore.in) at the server.

## After deploying

- Open `/admin` and sign in. Place a test order from `/marriage.html` and check it appears in **Paid orders** with its PDF.
- Back up `numerology.db` regularly (the admin page also has an **Export CSV** button).
- Put your logo at `public/img/logo.png` (it shows next to the site name automatically).
- In `/admin`, use **Settings** for the YouTube, Instagram and LinkedIn links, **YouTube videos** to add or remove videos and Shorts, and **Blogs** to write articles.
