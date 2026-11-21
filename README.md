# Nagaika, Nakuli Numerology

**Live site:** https://nagaika-nakuli-nakshatra-numerology.onrender.com/

A numerology and Nakshatra website for a consultancy in Bengaluru: yellow top bar, right-hand sidebar, Moon Nakshatra finder, the 27 Nakshatras, numerology calculators and a downloadable study guide. The backend from the first version is unchanged.

## What's new in this design

- **Home:** Nakshatra finder form, banner carousel, free tools, the 27 Nakshatras, consultant card, services, guidance, YouTube, and a sidebar with today's Nakshatra, the study guide and a life path calculator
- **Nakshatra & Numerology** (`nakshatra.html`): Moon Nakshatra, Pada, ruler and naming sound from a date and time of birth (with the birth number and life path number), today's Nakshatra for six cities, the 27 Nakshatras table, the four Padas, numerology numbers 1-9, simple birth-date calculations and a download of the study guide PDF. Based on `public/downloads/Nakshatra_Numerology_Study_Guide_English.pdf`
- **Numerology tools** (`tools.html`): life path and birth number, name number (destiny, soul urge, personality), mobile number and vehicle number
- Mega-menu navigation, floating share buttons, a welcome pop-up and breadcrumbs on every page
- **Paid services and the admin PDF:** every service on the Services page (and `payment.html`) goes through the same flow: the customer enters name, mobile, email and details, pays, and an order is created (`POST /api/orders`, then `/api/orders/:id/pay`). The fee for fixed-fee services comes from `public/js/services-data.js` and is enforced on the server. On payment the server builds a PDF (customer contact, service, payment receipt, submitted details) with `pdfkit`, emails it to `ADMIN_EMAIL` (and a receipt to the customer) when SMTP is set, and lists it in the admin **Paid orders** tab. There the admin can open or download the PDF, call, WhatsApp, or email the customer from the portal (with the PDF attached), set a status and keep notes. The customer can download their own receipt from the confirmation screen.
- **Marriage Horoscope Matching (`marriage.html`):** Male and Female columns (name, DOB, TOB, POB), a Rs 5,000 fee, then a confirmation and receipt for the customer. The customer sees no score or result: the admin gets a PDF with the customer's contact details, both birth details and the Moon Nakshatra, sign, Gana, Yoni and Nadi worked out for reference (`lib/engine.js`, reusing the site's Nakshatra and numerology scripts), and contacts the customer. The 36-point Ashtakoota scoring code is still in `lib/engine.js` (`ashtakoota`) but is not used or shown for now. The Moon position is approximate and times are read as IST.
- **Demo payments:** with no `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, payment runs in a clearly labelled demo mode (no money moves, the PDF and admin flow still work, orders show a "demo payment" badge). It is on by default outside production; on a production host set `DEMO_PAYMENTS=true` to keep it. Add the Razorpay keys to take real payments.
- **Horoscope in Numerology:** a home page section (`#horoscope`) where a visitor picks Male or Female and enters name, mobile, date, time and place of birth. It shows the Moon Nakshatra and Pada, Rashi, Gana, birth, life path and name numbers, a Moon chart and the nine planets (logic in `public/js/horoscope.js`). Each submission is saved as a lead (`POST /api/horoscope`, source `horoscope`) in the admin Enquiries tab. The Moon position is approximate and the time is taken as IST; it is for learning, not a full Kundali.
- **Lead generation:** every calculator and Nakshatra result ends with a WhatsApp chat button, a "Share my result" button and a call-back form (`POST /api/lead`, saved in the admin Enquiries tab with source `lead`). The home page has a "How it works" strip, today's number, a daily-updates WhatsApp button, a mobile Call / WhatsApp / Book bar, LocalBusiness data for Google and a Facebook link (set it in the admin Settings tab).
- **Languages:** a "Read in" bar on every page with English, Hindi, Kannada, Telugu, Tamil, Malayalam, Marathi, Gujarati and Bengali. It uses Google Translate, which is loaded only when a visitor picks a non-English language, and the choice is remembered in a cookie. Brand name, share buttons and the language bar itself are never translated. To change the list, edit `LANGS` in `public/js/main.js`.
- **Sanskrit terms:** Nakshatra names and similar terms are locked from machine translation and shown in each language's own script from a fixed table, `public/js/terms-i18n.js`. To add a term, wrap it with `sk('Term')` (or `<span class="sk notranslate" translate="no">`) and add it to that table.

## Kept from the first version

Services, enquiry form with optional OTP, guided chatbot, WhatsApp button, Razorpay and PayPal payment page, blog, gallery, YouTube videos, and the `/admin` dashboard (enquiries, blogs, videos, settings, payments, chatbot leads, CSV export).

## Admin dashboard

Open `/admin` and sign in with `ADMIN_USER` and `ADMIN_PASSWORD` from `.env`. It has the same yellow and orange look as the site and works on phones. Tabs: enquiries (search, status filter, notes, CSV export), chatbot leads, payments, blogs, YouTube videos and social-link settings.

To fill the dashboard with sample enquiries and chatbot leads, run `node scripts/seed-demo.js`. Remove them again with `node scripts/seed-demo.js --clear`.


## Customising

- **Name, phone, WhatsApp, address:** the `SITE` block at the top of `public/js/main.js`
- **Services and fees:** `public/js/services-data.js`
- **Nakshatra list, rulers, Pada sounds and numbers 1-9 table:** `public/js/nakshatra.js`
- **Colours:** the variables at the top of `public/css/style.css`
- **Logo:** replace `public/img/logo.png`

## Notes on the content

- Nakshatra values are calculated from the Moon's position (Lahiri ayanamsa) and are approximate, so a result can differ near a Nakshatra or Pada boundary. Birth time is taken as Indian Standard Time.
- There is no universally accepted table that maps each Nakshatra to a number, so the site shows the two systems side by side and does not pair them.
- Numerology tools use the Pythagorean letter values.

## Disclaimer

Numerology and Nakshatra consultations are guidance and reflection based on traditional belief systems. They are not scientifically established predictions or guarantees of future outcomes.
