const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const result = await db.query('SELECT id, first_name, last_name, age, address, created_at FROM residents ORDER BY created_at DESC');
  res.json(result.rows);
});
router.get('/:id', async (req, res) => {
  const resident = await db.query(
    'SELECT id, first_name, last_name, age, address, created_at FROM residents WHERE id = $1',
    [req.params.id]
  );
  
  if (resident.rows.length === 0) {
    return res.status(404).json({ error: 'Resident not found' });
  }

  const reports = await db.query(
    'SELECT * FROM reports WHERE resident_id = $1 ORDER BY created_at DESC',
    [req.params.id]
  );

  res.json({
    ...resident.rows[0],
    reports: reports.rows,
    total_reports: reports.rows.length,
  });
});
module.exports = router;