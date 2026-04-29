const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const result = await db.query('SELECT r.*, res.first_name, res.last_name, res.address FROM reports r JOIN residents res ON r.resident_id = res.id ORDER BY r.created_at DESC');
  res.json(result.rows);
});

router.patch('/:id', async (req, res) => {
  await db.query('UPDATE reports SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
  res.json({ message: 'Updated' });
});

module.exports = router;