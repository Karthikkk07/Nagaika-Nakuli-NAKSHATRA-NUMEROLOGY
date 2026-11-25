# API reference

JSON over HTTPS. Errors look like `{ "ok": false, "error": "message" }`. Bad requests return 4xx; server faults return 500 with a generic message.

## Public
| Method and path | Purpose |
|---|---|
| `GET /healthz` | Health check (also checks the database). |
| `GET /api/config` | Payment mode, Razorpay key id, whether OTP is required on orders. |
| `GET /api/settings` | Social links, analytics ID and the online-count switch only (an allow-list). Never contains secrets or admin state. |
| `POST /api/otp/send` `{phone}` / `POST /api/otp/verify` `{phone, code}` | SMS code; verify returns a 30-minute `token`. |
| `POST /api/enquiry`, `/api/lead`, `/api/horoscope` | Contact and lead forms. |
| `POST /api/orders` | Create an order. Body: `service, name, phone, email`, service details, and `otpToken` when OTP is required. Returns `{ id, amount, free }`. Fixed fees are enforced on the server. 503 when bookings are paused. |
| `POST /api/orders/:id/pay` | Start payment (Razorpay order or demo mode). |
| `POST /api/orders/:id/demo-pay` | Demo payment (only when demo mode is on). |
| `POST /api/payments/razorpay/verify` | Browser confirmation; the signature is checked on the server. |
| `POST /api/payments/razorpay/webhook` | Razorpay events, signed with `RAZORPAY_WEBHOOK_SECRET` (HMAC-SHA256 of the raw body in `X-Razorpay-Signature`). Handles `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`. Idempotent; the amount is checked against the order. |
| `GET /api/orders/:id`, `/api/orders/:id/receipt.pdf` | A customer's own order and receipt; the id is an unguessable UUID. |
| `POST /api/presence` `{id, page, view}` | Anonymous visitor heartbeat. 204. |
| `GET /api/online` | `{show, online}`; hidden unless switched on. |
| `GET /api/search?q=&limit=` | Site search over pages, services, Nakshatras and published articles. |
| `POST /api/auth/signup`, `/signin`, `/signout`, `GET /api/auth/me` | Customer accounts. Sign-up needs a verified mobile number when OTP is on. Cookie `sid` (HttpOnly, SameSite=Lax, 30 days). Five wrong sign-ins lock a login for 15 minutes. |
| `GET /api/auth/orders`, `POST /api/auth/verify-phone`, `/delete` | My orders, verify the account's mobile number, delete the account. |
| `POST /api/auth/forgot`, `/reset` | Password reset by emailed link (needs SMTP) or by a mobile number verified with OTP. |
| `GET /api/card`, `/card.vcf`, `/card-qr.svg` | E-visiting card data, contact file and QR code. |
| `GET /api/blogs`, `/api/blogs/:id`, `/api/videos` | Content. |
| `GET /robots.txt`, `/sitemap.xml` | SEO. |

## Admin (`/admin/...`, needs the signed-in session cookie)
`GET /admin/api/data`, `GET /admin/api/settings`, `GET /admin/api/live`, `GET /admin/api/audit`, `GET /admin/api/indiamart`, `POST /admin/api/indiamart/sync`, `POST /admin/api/blogs/starter`, `POST /admin/api/settings`, `POST /admin/api/orders/:id` (status, notes), `POST /admin/api/orders/:id/refund` `{amount?}`, `POST /admin/api/orders/:id/email`, `DELETE /admin/api/orders/:id`, `POST /admin/api/erase` `{phone?, email?}`, blog and video CRUD, `GET /admin/export.csv`, `GET /admin/backup.db`, `GET /admin/orders/:id.pdf`.
Every change made here is written to the audit log.

## Limits
Rate limits apply per address to form, order and OTP endpoints (HTTP 429). Request bodies are capped at 200 KB (1 MB for order creation, which can carry a fingerprint photo).
