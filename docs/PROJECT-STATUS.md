# Project status and handover (26 Nov 2026)

Read this first when you come back. The live site is https://nagaika-nakuli-nakshatra-numerology.onrender.com/ (Render: use Manual Deploy to pick up new commits). Run `npm test` before changing anything (23 tests).

## Done
Hora Kala Chakram page, e-visiting card with QR, site search, customer accounts (sign in/up, account page, password reset), mandatory OTP on forms (switches on once SMS is set up), WhatsApp alerts (wrong details, failed payment, refund), IndiaMART lead import, Razorpay webhook and refunds, admin (live visitors, audit log, backups, erasure, maintenance, switches, analytics and Search Console fields), legal/pricing/FAQ pages, SEO basics, docs and tests. See README.md, docs/ADMIN-GUIDE.md, docs/API.md, docs/GO-LIVE.md and docs/competitor-research.md.

## Uncommitted on the owner's computer
`public/js/services-data.js` has the Corporate Consultation fee set to `1` (a test value). The committed value is `5000`. Never commit the `1`.

## Waiting on Sir (cannot be done without him)
1. Razorpay: PAN, bank account and IFSC, business/social link, KYC; written confirmation that astrology/numerology is accepted.
2. Render persistent disk or a database (orders are lost on redeploy otherwise). `ADMIN_PASSWORD` set on Render. Custom domain and `SITE_URL`.
3. SMS provider, DLT registration and budget (Twilio is built in; MSG91 would be cheaper and can be added). OTP is mandatory but cannot work until SMS exists.
4. WhatsApp Business (Meta): number, verified business, templates `payment_failed`, `refund_processed`, `details_error`.
5. IndiaMART Pull API key (`INDIAMART_CRM_KEY`, paid seller account).
6. Email (SMTP) account for receipts and password resets.
7. Real Instagram, Facebook and LinkedIn URLs; Google account for GA4 and Search Console; Google Business Profile.
8. Visiting card details (name, designation, photo, logo): edit the `CARD` block in `server.js`.
9. Suchithra (AUM Capital, accountant): what is needed from her.
10. Approval of the Privacy, Terms and Refund pages, then a lawyer's review. Confirm every fee on `/pricing.html`.
11. Which competitor sites "form filling as per competition" means; which Hora cities; audience and language needs (Telugu/Kannada).

## Left on the developer side
Lighthouse and accessibility audit, native Telugu/Kannada content, review and publish the 4 starter articles (admin > Blogs), optional MSG91 support, dark mode, coupons, PostgreSQL if traffic grows.

## What to tell Sir
- 1 million users at once: not today (thousands). Needs a CDN, several servers and a bigger database; ask for the real expected traffic.
- Live active users: done (admin > Live visitors; optional public "N online" badge).
- Competition and Gen Z research: done, in docs/competitor-research.md. Apps compete on cheap per-minute chat, so personal readings must be sold as human work.
