// Adds demo enquiries and chatbot leads so the admin dashboard has something to show.
// Add:    node scripts/seed-demo.js
// Remove: node scripts/seed-demo.js --clear
const store = require('../db');

if (process.argv.includes('--clear')) {
  store.db.prepare(`DELETE FROM enquiries WHERE id LIKE 'demo-%'`).run();
  store.db.prepare(`DELETE FROM chat_leads WHERE solution LIKE '[demo]%'`).run();
  console.log('Demo data removed.');
  process.exit(0);
}

const ago = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
// name, email, phone, service, mode, dob, message, source, hours ago, phone verified, status, notes
const enquiries = [
  ['Ravi Kumar', 'ravi.kumar@example.com', '+919876500001', 'Career Guidance', 'Face to face', '1992-03-14', 'Feeling stuck in my IT job for 5 years. Want guidance on whether to switch careers.', 'contact', 2, 1, 'new', ''],
  ['Priya Sharma', 'priya.sharma@example.com', '+919876500002', 'Marriage Compatibility', 'WhatsApp', '1996-11-02', 'Looking for a compatibility discussion before finalising a proposal.', 'contact', 9, 1, 'new', ''],
  ['Suresh Reddy', 'suresh.reddy@example.com', '+919876500003', 'Naming Consultation', 'Phone call', '2025-08-21', 'Need a numerology-based name for our newborn daughter.', 'chatbot', 26, 0, 'new', ''],
  ['Anita Desai', 'anita.desai@example.com', '+919876500004', 'Nakshatra & Numerology Reading', 'Face to face', '1994-06-30', 'I would like to know my Moon Nakshatra and birth number. Wedding planned for early next year.', 'contact', 50, 1, 'contacted', 'Called, appointment fixed for Saturday.'],
  ['Mohammed Irfan', 'irfan.m@example.com', '+919876500005', 'Corporate Consultation', 'Face to face', '1985-01-19', 'Starting a new business and want to discuss suitable timing and business name.', 'contact', 75, 0, 'contacted', 'Sent fee details on WhatsApp.'],
  ['Lakshmi Narayan', 'lakshmi.n@example.com', '+919876500006', 'Naming Consultation', 'Phone call', '1978-09-08', 'Need a name starting with the right Pada sound for my grandson.', 'contact', 120, 1, 'done', 'Names suggested and confirmed.'],
  ['Divya Menon', 'divya.menon@example.com', '+919876500007', 'Personal Numerology Reading', 'WhatsApp', '2001-12-25', 'Curious about my life path number and what it means for my studies.', 'chatbot', 160, 0, 'new', ''],
  ['Karthik S', 'karthik.s@example.com', '+919876500008', 'Free Consultation for People in Need', 'Phone call', '1970-04-11', 'Going through a difficult financial period and need some guidance.', 'contact', 200, 1, 'done', 'Free slot given.'],
];

enquiries.forEach((e, i) => {
  const id = 'demo-' + (i + 1);
  store.db.prepare(`DELETE FROM enquiries WHERE id = ?`).run(id);
  store.addEnquiry({
    id, receivedAt: ago(e[8]), name: e[0], email: e[1], phone: e[2], phoneVerified: !!e[9],
    service: e[3], mode: e[4], dob: e[5], date: '', message: e[6], source: e[7],
  });
  store.updateEnquiry(id, e[10], e[11]);
});

// Same options as the website chatbot: challenge, assistance, service area
const chats = [
  ['Career Stagnation', 'Personal Reading Report', 'Job/Career'],
  ['Legal Delays', 'Instant Chat Consultation', 'Court Case'],
  ['Exam Stress', 'Personal Reading Report', 'Exam Guidance'],
  ['Vehicle Bad Luck', 'Document & Number Correction', 'Vehicle Number'],
  ['Phone Number', 'Document & Number Correction', 'Job/Career'],
  ['Exam Stress', 'Instant Chat Consultation', 'Exam Guidance'],
  ['Career Stagnation', 'Instant Chat Consultation', 'Job/Career'],
  ['Legal Delays', 'Personal Reading Report', 'Court Case'],
];
store.db.prepare(`DELETE FROM chat_leads WHERE solution LIKE '[demo]%'`).run();
chats.forEach((c, i) => {
  store.db.prepare(`INSERT INTO chat_leads (created_at, topic, solution, service) VALUES (?, ?, ?, ?)`).run(ago(3 + (chats.length - 1 - i) * 11), c[0], '[demo] ' + c[1], c[2]);
});

console.log(`Added ${enquiries.length} demo enquiries and ${chats.length} chatbot leads. Remove them with: node scripts/seed-demo.js --clear`);
