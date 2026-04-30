const db = require('./init');
const bcrypt = require('bcryptjs');

// Clear existing data (optional — comment out if you want to keep your real data)
db.exec('DELETE FROM announcements');
db.exec('DELETE FROM reports');
db.exec('DELETE FROM residents');
db.exec('DELETE FROM admins');

// Create admin
const hash = bcrypt.hashSync('admin123', 10);
db.prepare('INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)').run(
  'admin@barangay.gov.ph',
  hash,
  'Kap. Juan Dela Cruz'
);

// Create residents
const residents = [
  { messenger_id: 'test_resident_1', first_name: 'Maria', last_name: 'Santos', age: 28, address: 'Purok 3, Barangay San Roque' },
  { messenger_id: 'test_resident_2', first_name: 'Pedro', last_name: 'Reyes', age: 45, address: 'Block 7, Barangay San Roque' },
  { messenger_id: 'test_resident_3', first_name: 'Juana', last_name: 'Garcia', age: 62, address: 'Purok 1, Barangay San Roque' },
  { messenger_id: 'test_resident_4', first_name: 'Antonio', last_name: 'Mendoza', age: 19, address: 'Block 3, Barangay San Roque' },
  { messenger_id: 'test_resident_5', first_name: 'Elena', last_name: 'Cruz', age: 35, address: 'Purok 5, Barangay San Roque' },
];

const insertResident = db.prepare(
  'INSERT INTO residents (messenger_id, first_name, last_name, age, address, conversation_state, temp_data) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

for (const r of residents) {
  insertResident.run(r.messenger_id, r.first_name, r.last_name, r.age, r.address, 'idle', '{}');
}

// Get resident IDs
const residentIds = db.prepare('SELECT id, first_name FROM residents').all();

// Create reports
const reports = [
  { resident_idx: 0, category: 'Infrastructure', description: 'Street light not working near the basketball court. It has been dark for 3 nights now.', status: 'pending' },
  { resident_idx: 0, category: 'Sanitation', description: 'Uncollected garbage along the main road near the sari-sari store.', status: 'in_progress' },
  { resident_idx: 1, category: 'Safety', description: 'Stray dogs roaming around the school area during dismissal time. Concerned for children\'s safety.', status: 'pending' },
  { resident_idx: 2, category: 'Infrastructure', description: 'Water pipe leak on Purok 1 main road. Water has been flowing for 2 days.', status: 'resolved' },
  { resident_idx: 3, category: 'Noise', description: 'Loud videoke until 2 AM from neighbor at Block 3. Happening every weekend.', status: 'pending' },
  { resident_idx: 4, category: 'Other', description: 'Requesting barangay clearance for job application. What are the requirements?', status: 'in_progress' },
  { resident_idx: 1, category: 'Sanitation', description: 'Clogged drainage causing flooding during rain near Block 7.', status: 'pending' },
  { resident_idx: 2, category: 'Safety', description: 'Suspicious person loitering near the entrance of Purok 1 at night.', status: 'resolved' },
];

const insertReport = db.prepare(
  'INSERT INTO reports (resident_id, category, description, status, created_at) VALUES (?, ?, ?, ?, ?)'
);

for (const r of reports) {
  const resident = residentIds[r.resident_idx];
  // Add some date variation
  const daysAgo = Math.floor(Math.random() * 14) + 1;
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  insertReport.run(resident.id, r.category, r.description, r.status, date);
}

// Create announcements
const announcements = [
  { message: 'Barangay General Assembly this Saturday, 2PM at the Barangay Hall. All residents are encouraged to attend.', age_min: null, age_max: null, recipient_count: 5 },
  { message: 'Free medical checkup for senior citizens on Friday, 8AM-12NN at the Health Center. Please bring your senior citizen ID.', age_min: 60, age_max: 120, recipient_count: 1 },
  { message: 'Youth sports league registration is now open! Ages 15-30 can sign up at the Barangay Hall until end of month.', age_min: 15, age_max: 30, recipient_count: 2 },
];

const getAdminId = db.prepare('SELECT id FROM admins LIMIT 1').get();

const insertAnnouncement = db.prepare(
  'INSERT INTO announcements (admin_id, message, age_min, age_max, recipient_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);

for (const a of announcements) {
  const daysAgo = Math.floor(Math.random() * 7) + 1;
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  insertAnnouncement.run(getAdminId.id, a.message, a.age_min, a.age_max, a.recipient_count, date);
}