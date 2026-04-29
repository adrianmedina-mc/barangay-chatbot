const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');
const { broadcastToResidents } = require('../services/messenger');
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const result = await db.query('SELECT * FROM announcements ORDER BY created_at DESC');
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { message, age_min, age_max, scheduled_at } = req.body;

  if (scheduled_at) {
    await db.query('INSERT INTO announcements (admin_id, message, age_min, age_max, status, scheduled_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.admin.id, message, age_min || null, age_max || null, 'scheduled', scheduled_at]);
    return res.json({ message: 'Announcement scheduled' });
  }

  let query = "SELECT messenger_id FROM residents WHERE conversation_state = 'idle'";
  const params = [];
  if (age_min) { query += ' AND age >= $' + (params.length + 1); params.push(age_min); }
  if (age_max) { query += ' AND age <= $' + (params.length + 1); params.push(age_max); }

  const residents = await db.query(query, params);
  const ids = residents.rows.map(r => r.messenger_id);
  const count = await broadcastToResidents(ids, `📢 Barangay Announcement:\n\n${message}`);

  await db.query('INSERT INTO announcements (admin_id, message, age_min, age_max, recipient_count, status) VALUES ($1, $2, $3, $4, $5, $6)',
    [req.admin.id, message, age_min || null, age_max || null, count, 'sent']);

  res.json({ message: 'Announcement sent', recipients: count });
});

module.exports = router;