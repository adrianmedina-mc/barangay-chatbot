const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/init');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
  const admin = result.rows[0];
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, name: admin.name });
});

router.post('/setup', async (req, res) => {
  const { email, password, name } = req.body;
  const existing = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
  if (existing.rows.length > 0) return res.status(400).json({ error: 'Admin exists' });
  const hash = bcrypt.hashSync(password, 10);
  await db.query('INSERT INTO admins (email, password_hash, name) VALUES ($1, $2, $3)', [email, hash, name]);
  res.json({ message: 'Admin created' });
});

module.exports = router;