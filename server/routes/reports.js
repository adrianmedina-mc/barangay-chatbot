const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Get all reports
router.get('/', (req, res) => {
  const reports = db.prepare(`
    SELECT r.*, res.first_name, res.last_name, res.address 
    FROM reports r 
    JOIN residents res ON r.resident_id = res.id 
    ORDER BY r.created_at DESC
  `).all();
  res.json(reports);
});

// Update report status
router.patch('/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'Updated' });
});

module.exports = router;