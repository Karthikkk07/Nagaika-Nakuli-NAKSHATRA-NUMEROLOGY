const PDFDocument = require('pdfkit');

const BRAND = 'Nagaika, Nakuli Numerology';
const ORANGE = '#ee6a12', MAROON = '#7a1f0b', GREY = '#6b6b6b', LINE = '#ecd9a8', CREAM = '#fff6e0';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST' : '-');
const fmtDob = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${+m[3]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${m[1]}` : s || '-'; };
const rs = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN');

function buildOrderPdf(order, opts = {}) {
  const details = JSON.parse(order.details || '{}');
  const result = order.result ? JSON.parse(order.result) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `${order.service} - ${order.name}`, Author: BRAND, Subject: 'Service order and payment receipt' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
    const need = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom - 24) doc.addPage(); };
    const section = (title) => { need(40); doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(12).fillColor(MAROON).text(title, L, doc.y); doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).lineWidth(1.2).strokeColor(ORANGE).stroke(); doc.moveDown(0.5); };
    const kv = (rows, labelW = 130) => rows.forEach(([k, v]) => {
      need(18);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(GREY).text(k, L, y, { width: labelW });
      doc.font('Helvetica').fontSize(10.5).fillColor('#222').text(String(v == null || v === '' ? '-' : v), L + labelW, y, { width: W - labelW });
      doc.y = Math.max(doc.y, y + 15) + 2;
    });

    // header band
    doc.rect(0, 0, doc.page.width, 78).fill(ORANGE);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(20).text(BRAND, L, 20, { width: W });
    doc.font('Helvetica').fontSize(11).text('Numerology & Nakshatra, Bengaluru  |  Service order and payment receipt', L, 46, { width: W });
    doc.y = 96;

    // reference strip
    doc.roundedRect(L, doc.y, W, 44, 4).fill(CREAM);
    const ry = doc.y + 8;
    doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8.5).text('ORDER REFERENCE', L + 12, ry).text('DATE', L + 190, ry).text('PAYMENT', L + 360, ry);
    const paid = order.pay_status === 'paid', free = order.pay_status === 'free';
    doc.fillColor('#222').font('Helvetica-Bold').fontSize(11).text(order.id.slice(0, 8).toUpperCase(), L + 12, ry + 14).text(fmtDate(order.paid_at || order.created_at), L + 190, ry + 14, { width: 160 });
    doc.fillColor(paid || free ? '#14753a' : '#b3261e').text(paid ? 'PAID' : free ? 'FREE SERVICE' : 'NOT PAID', L + 360, ry + 14);
    doc.y = ry + 46;

    section('Customer contact');
    kv([['Name', order.name], ['Mobile', order.phone], ['Email', order.email]]);

    section('Service and payment');
    kv([
      ['Service', order.service],
      ['Amount', free ? 'Free (no payment required)' : rs(order.amount)],
      ['Payment status', paid ? 'Paid' : free ? 'Free' : 'Pending'],
      ['Payment method', order.pay_mode === 'razorpay' ? 'Razorpay (UPI / card / netbanking)' : order.pay_mode === 'demo' ? 'DEMO payment - no real money was charged' : '-'],
      ['Payment ID', order.payment_id || '-'],
      ['Paid on', fmtDate(order.paid_at)],
    ]);

    if (result && result.type === 'marriage' && !opts.customer) {
      const { groom, bride } = result;
      const d = details.marriage || {};
      section('Marriage horoscope matching: birth details');
      const colW = (W - 14) / 2;
      if (doc.y + 190 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      const y0 = doc.y;
      const person = (x, title, p, who) => {
        doc.roundedRect(x, y0, colW, 186, 4).lineWidth(1).strokeColor(LINE).stroke();
        doc.rect(x, y0, colW, 22).fill(MAROON);
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10.5).text(title, x + 10, y0 + 6, { width: colW - 20 });
        const rows = [['Name', who.name], ['Date of birth', fmtDob(who.dob)], ['Time of birth', who.tobUnknown ? 'Not known (noon used)' : who.tob || '-'], ['Place of birth', who.pob || '-'],
          ['Moon Nakshatra', `${p.nakshatra}, Pada ${p.pada}`], ['Moon sign', `${p.rashiName} (${p.rashiEnglish})`], ['Gana / Yoni / Nadi', `${p.gana} / ${p.yoni} / ${p.nadi}`], ['Birth / Life path no.', `${p.birthNumber} / ${p.lifePath}`]];
        let yy = y0 + 30;
        rows.forEach(([k, v]) => {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREY).text(k, x + 10, yy, { width: 82 });
          doc.font('Helvetica').fontSize(9.5).fillColor('#222').text(String(v), x + 94, yy, { width: colW - 104 });
          yy += doc.heightOfString(String(v), { width: colW - 104 }) > 12 ? 26 : 19;
        });
      };
      person(L, 'GROOM (Male)', groom, d.groom || {});
      person(L + colW + 14, 'BRIDE (Female)', bride, d.bride || {});
      doc.y = y0 + 196;

      section('Notes for the numerologist');
      doc.font('Helvetica').fontSize(10.5).fillColor('#222').text('Both birth details are above, with the Moon Nakshatra and related details worked out for reference. Please contact the customer to discuss the match.', L, doc.y, { width: W });
      if (groom.edge || bride.edge) doc.moveDown(0.3).fillColor('#b3261e').text('A Moon position is close to a Nakshatra boundary. Please confirm the exact birth time with the customer.', { width: W });
      if (d.groom?.tobUnknown || d.bride?.tobUnknown) doc.moveDown(0.3).fillColor('#b3261e').text('At least one birth time is unknown, so that Nakshatra may be off by one.', { width: W });
    } else if (result && result.type === 'marriage') {
      const m = details.marriage || {};
      const one = (w) => `${w.name || '-'}, born ${fmtDob(w.dob)}${w.tobUnknown ? '' : ' at ' + (w.tob || '-')}${w.pob ? ', ' + w.pob : ''}`;
      section('Details you submitted');
      kv([['Groom (Male)', one(m.groom || {})], ['Bride (Female)', one(m.bride || {})]]);
    } else if (order.service === 'Nadi Astrology') {
      section(opts.customer ? 'Details you submitted' : 'Nadi Astrology: fingerprint and details');
      kv([['Date of birth', fmtDob(details.dob)], ['Fingerprint of', details.hand || '-'], ['Preferred mode', details.mode], ['Message', details.message]]);
      if (!opts.customer) {
        const m = /^data:image\/(?:jpeg|png);base64,(.+)$/.exec(details.fingerprint || '');
        if (m) {
          need(230);
          doc.moveDown(0.4);
          const y = doc.y;
          doc.roundedRect(L, y, 220, 210, 4).lineWidth(1).strokeColor(LINE).stroke();
          doc.image(Buffer.from(m[1], 'base64'), L + 5, y + 5, { fit: [210, 200], align: 'center', valign: 'center' });
          doc.y = y + 218;
        } else {
          kv([['Fingerprint', 'Not attached']]);
        }
      }
    } else {
      section('Details submitted by the customer');
      kv([['Date of birth', fmtDob(details.dob)], ['Preferred mode', details.mode], ['Message', details.message]]);
    }

    section('Next step');
    doc.font('Helvetica').fontSize(10).fillColor('#222').text(opts.customer
      ? `Our numerologist will contact you on ${order.phone}${order.email ? ' or at ' + order.email : ''} to discuss your request. Please keep this receipt for your records.`
      : `Contact ${order.name} on ${order.phone}${order.email ? ' or ' + order.email : ''} to confirm the consultation and share the reading.`, L, doc.y, { width: W });

    doc.moveDown(0.6);
    need(40);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor(LINE).stroke(); doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text(
      'Guidance for reflection and learning only, not a prediction or guarantee. Decisions about marriage or other life matters should also rest on facts, family discussion and professional advice. Moon positions are approximate (Lahiri ayanamsa) and birth times are read as Indian Standard Time. A full Kundali also needs the ascendant and the other planets.',
      L, doc.y, { width: W });
    doc.moveDown(0.5);
    doc.text(`${BRAND}, 2, P2, 4th Floor, No. 95, Gold Signature, Mosque Road, Fraser Town, Bengaluru 560005  |  +91 98456 10894`, L, doc.y, { width: W });
    doc.end();
  });
}

module.exports = { buildOrderPdf };
