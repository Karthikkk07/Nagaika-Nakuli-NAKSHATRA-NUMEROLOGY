# Admin guide

Open `/admin` and sign in with `ADMIN_USER` and `ADMIN_PASSWORD`. If `ADMIN_TOTP_SECRET` is set you also enter the 6-digit code from your authenticator app. After 5 wrong attempts an address is locked out for 15 minutes.

## Tabs
| Tab | What it does |
|---|---|
| Paid orders | Every paid or free order with its PDF. Call, WhatsApp or email the customer, set a status, add notes, **Refund** (full or part), delete. |
| Live visitors | People online now, visitors and page views today, peak online, pages being viewed, last 14 days. Refreshes every 10 seconds. |
| Enquiries, Chatbot leads, Payments | Contact-form enquiries (CSV export), chatbot leads and the payments log. |
| Blogs, YouTube videos | Write and publish articles; add or remove YouTube videos and Shorts. |
| Audit log | Who did what and when: sign-ins (including failed ones), refunds, erasures, setting changes. It never stores customer details. |
| Settings | Social links, the switches below, Google Analytics ID, data erasure and backup download. |

## Site switches (Settings tab)
- **Accept online bookings and payments:** turn off to pause new orders. Payments already in progress still complete.
- **Maintenance mode:** visitors see a "back soon" page. This admin area stays available.
- **Show "N online now" in the footer:** off by default.
- **Require mobile OTP before an order:** every order and enquiry form first asks for the mobile number and an SMS code. It only takes effect once SMS (Twilio) is set up on the server, so a missing provider cannot lock customers out. A number that passes OTP but sends wrong details also gets a WhatsApp message (once per 10 minutes) when WhatsApp is set up.

## Refunds
Open the order and press **Refund**. For online payments the refund is sent to Razorpay and goes back to the customer's original payment method in 5 to 7 working days; for demo payments it is only recorded. The customer is told by email (and WhatsApp when set up). An order can be refunded once.

## Data requests (DPDP Act)
Settings > Data protection: enter the person's mobile number and/or email. Enquiries are deleted; orders are anonymised but keep the amount and payment reference for accounts.

## Backups
The server saves a copy of the database every day in `DATA_DIR/backups` (7 kept). On hosts with a temporary disk these are lost on redeploy, so also use **Settings > Download backup** regularly. The file holds customer data: keep it private.

## IndiaMART leads
Set `INDIAMART_CRM_KEY` (seller.indiamart.com > Lead Manager > Import/Export Leads > Pull API; needs a paid IndiaMART seller account). New leads are copied into the Enquiries tab every 6 minutes with the source "indiamart" and you get an email and SMS. Settings > IndiaMART leads shows the status and has **Sync now** (IndiaMART allows one call per 5 minutes). The key expires if it is unused for 7 days.

## Starter articles
Blogs tab > **Add 4 starter articles as drafts**. Read and edit them, then tick Published. They are added only once.

## Visiting card
`/card.html` shows the e-visiting card with a QR code and a save-contact file. To change the details, edit the `CARD` block in `server.js`.

## Google Analytics (optional)
Paste a GA4 measurement ID. The cookie notice then asks visitors to Accept or Decline, and tracking starts only after Accept.
