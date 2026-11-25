// IndiaMART Lead Manager "Pull API" (crmListing v2). Needs the seller's Pull API key (IndiaMART seller panel > Lead Manager > Import/Export Leads > Pull API).
// Limits from IndiaMART's documentation: at most one request every 5 minutes and a window of at most 7 days (times in IST).
const BASE_URL = 'https://mapi.indiamart.com/wservce/crm/crmListing/v2/';
const IST_MS = 330 * 60 * 1000;
const TYPE_LABELS = { W: 'Direct enquiry', B: 'Buy lead', P: 'Phone call (PNS)', BIZ: 'Catalog view', WA: 'WhatsApp enquiry' };

const pad = (n) => String(n).padStart(2, '0');

// DD-MM-YYYYHH:MM:SS in Indian time, the timestamp format the API accepts
function istStamp(ms) {
  const d = new Date(ms + IST_MS);
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function buildUrl(key, startMs, endMs, base = BASE_URL) {
  const sevenDays = 7 * 24 * 3600 * 1000;
  const start = Math.max(startMs, endMs - sevenDays + 60 * 1000);
  return `${base}?glusr_crm_key=${encodeURIComponent(key)}&start_time=${istStamp(start)}&end_time=${istStamp(endMs)}`;
}

// "2026-11-25 14:05:09" (IST) -> ISO string; falls back to now
function queryTimeToIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return new Date().toISOString();
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - IST_MS).toISOString();
}

const clean = (v, n) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, n);

// One IndiaMART lead -> one row for the enquiries table (source "indiamart")
function toEnquiry(lead) {
  const id = clean(lead.UNIQUE_QUERY_ID, 60);
  if (!id) return null;
  const phone = clean(lead.SENDER_MOBILE, 30).replace(/[^\d+]/g, '');
  const place = [lead.SENDER_CITY, lead.SENDER_STATE].map((x) => clean(x, 60)).filter(Boolean).join(', ');
  const bits = [
    TYPE_LABELS[lead.QUERY_TYPE] || 'IndiaMART lead',
    clean(lead.QUERY_MESSAGE, 1200),
    lead.SENDER_COMPANY ? 'Company: ' + clean(lead.SENDER_COMPANY, 100) : '',
    place ? 'Location: ' + place : '',
  ].filter(Boolean);
  return {
    id: 'im-' + id,
    receivedAt: queryTimeToIso(lead.QUERY_TIME),
    phoneVerified: false,
    name: clean(lead.SENDER_NAME, 100) || 'IndiaMART Buyer',
    email: clean(lead.SENDER_EMAIL, 150),
    phone,
    service: clean(lead.QUERY_PRODUCT_NAME, 100) || 'IndiaMART enquiry',
    mode: '',
    dob: '',
    date: '',
    message: bits.join('. '),
    source: 'indiamart',
  };
}

// Calls the API and returns { ok, leads, error }. The API answers 200 with a CODE field even for errors.
async function fetchLeads(key, startMs, endMs, base = process.env.INDIAMART_API_URL || BASE_URL, fetchImpl = fetch) {
  let body;
  try {
    const r = await fetchImpl(buildUrl(key, startMs, endMs, base), { signal: AbortSignal.timeout(20000) });
    body = await r.json();
  } catch (e) {
    return { ok: false, leads: [], error: 'Could not reach IndiaMART.' };
  }
  if (Array.isArray(body)) return { ok: true, leads: body };
  if (body && Number(body.CODE) === 200) return { ok: true, leads: Array.isArray(body.RESPONSE) ? body.RESPONSE : [] };
  return { ok: false, leads: [], error: clean((body && (body.MESSAGE || body.STATUS)) || 'IndiaMART returned an error.', 200) };
}

module.exports = { istStamp, buildUrl, queryTimeToIso, toEnquiry, fetchLeads, TYPE_LABELS };
