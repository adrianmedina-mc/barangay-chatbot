const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');
const { broadcastToResidents } = require('../services/messenger');

router.use(authMiddleware);

// Get all announcements
router.get('/', (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  res.json(announcements);
});

// Create and broadcast announcement
router.post('/', async (req, res) => {
  const { message, age_min, age_max } = req.body;

  // Save announcement
  db.prepare('INSERT INTO announcements (admin_id, message, age_min, age_max) VALUES (?, ?, ?, ?)')
    .run(req.admin.id, message, age_min || null, age_max || null);

  // Find matching residents
  let query = 'SELECT messenger_id FROM residents WHERE conversation_state = ?';
  const params = ['idle'];

  if (age_min) {
    query += ' AND age >= ?';
    params.push(age_min);
  }
  if (age_max) {
    query += ' AND age <= ?';
    params.push(age_max);
  }

  const residents = db.prepare(query).all(...params);
  const ids = residents.map((r) => r.messenger_id);
  const count = await broadcastToResidents(ids, `📢 Barangay Announcement:\n\n${message}`);

  // Update recipient count
  const announcementId = db.prepare('SELECT last_insert_rowid() as id').get();
  db.prepare('UPDATE announcements SET recipient_count = ? WHERE id = ?').run(count, announcementId.id);

  res.json({ message: 'Announcement sent', recipients: count });
});

module.exports = router;