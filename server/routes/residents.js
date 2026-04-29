const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const result = await db.query('SELECT id, first_name, last_name, age, address, created_at FROM residents ORDER BY created_at DESC');
  res.json(result.rows);
});

module.exports = router;