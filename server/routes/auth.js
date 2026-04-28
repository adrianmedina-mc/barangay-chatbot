const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/init');

const JWT_SECRET = process.env.JWT_SECRET;

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, name: admin.name });
});

// Register first admin (run once, or use to seed)
router.post('/setup', (req, res) => {
  const { email, password, name } = req.body;
  
  const existing = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (existing) {
    return res.status(400).json({ error: 'Admin already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)').run(email, hash, name);
  res.json({ message: 'Admin created' });
});

module.exports = router;