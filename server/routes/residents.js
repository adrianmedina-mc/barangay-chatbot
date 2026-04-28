const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const residents = db.prepare('SELECT id, first_name, last_name, age, address, created_at FROM residents ORDER BY created_at DESC').all();
  res.json(residents);
});

module.exports = router;