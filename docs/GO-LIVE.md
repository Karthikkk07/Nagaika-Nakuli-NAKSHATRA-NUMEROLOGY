# Go-live checklist and runbook

## Before launch (needs the owner)
- [ ] Razorpay account approved (PAN, bank details, website pages, KYC). Confirm in writing that astrology/numerology services are accepted.
- [ ] Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; add the webhook in the Razorpay dashboard (events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`). Remove `DEMO_PAYMENTS`.
- [ ] Place a real Rs 1 test payment, then refund it from the admin Paid orders tab.
- [ ] **Persistent disk** mounted at `DATA_DIR` (a temporary disk loses all orders on redeploy). Download a backup once a week as well.
- [ ] `ADMIN_PASSWORD` set to a long unique value; two-factor on (`node scripts/totp-secret.js`).
- [ ] SMTP set (order emails, receipts) and `ADMIN_EMAIL` correct. Send a test order.
- [ ] SMS (Twilio, with India DLT registration) if OTP is wanted; then switch on "Require mobile OTP".
- [ ] WhatsApp Business API and approved templates `payment_failed` (2 variables: name, service) and `refund_processed` (3: name, amount, service), if wanted.
- [ ] Owner has read and approved the Privacy, Terms, Refund, Disclaimer and Cookie pages. **Have a lawyer review them.**
- [ ] Custom domain, HTTPS, `SITE_URL` set; sitemap submitted in Google Search Console; Google Business Profile created.
- [ ] Real social links in Settings; check prices on `/pricing.html` (for example Corporate Consultation).
- [ ] `npm test` passes; Lighthouse run on the home page.

## Deploying
Push to `main`. CI runs `npm test`. The host redeploys; the app finishes in-flight requests on shutdown. Roll back by redeploying the previous commit; the database is unchanged by rollbacks (new columns are additive).

## If something goes wrong
| Problem | Action |
|---|---|
| Site down or erroring | Check the host logs and `/healthz`. Turn on Maintenance mode from `/admin` if you need to stop traffic. |
| Customer paid but no order | Look up the payment id in the Razorpay dashboard. The webhook normally records it; if not, check the webhook delivery log and secret. |
| Wrong refund | Refunds cannot be undone. Check the Razorpay dashboard and the Audit log. |
| Data lost / disk wiped | Restore from the latest backup: stop the app, copy the `.db` file to `DATA_DIR/numerology.db`, start the app. |
| Suspected breach | Change `ADMIN_PASSWORD` and API keys, check the Audit log, tell affected people and the Data Protection Board as the law requires. |

## Maintenance
Update dependencies monthly (`npm audit`, `npm update`, `npm test`), review the Audit log, download a backup, and check the Razorpay settlement report against the Payments tab.
