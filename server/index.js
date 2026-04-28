require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db/init');

const webhookRoutes = require('./routes/webhook');
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const residentRoutes = require('./routes/residents');
const announcementRoutes = require('./routes/announcements');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/webhook', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/residents', residentRoutes);
app.use('/api/announcements', announcementRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});// force deploy 
