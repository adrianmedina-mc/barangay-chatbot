/**
 * routes/locate.js
 *
 * Serves the location capture page and receives the coordinates
 * posted back from it. Then triggers the bot to continue the
 * conversation with the location saved.
 *
 * Mount this in your app:
 *   const locateRoute = require('./routes/locate');
 *   app.use('/locate', locateRoute);
 */

const express  = require('express');
const path     = require('path');
const router   = express.Router();
const db       = require('../db/init');
const { sendMessage, sendQuickReplies } = require('../services/messenger');

// ── GET /locate?sid=SENDER_ID ──────────────────────────────────────────────
// Serves the HTML page to the user's browser.
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/locate.html'));
});

// ── POST /locate/submit ────────────────────────────────────────────────────
// Called by the browser page via fetch() once it has coordinates.
router.post('/submit', async (req, res) => {
  const { senderId, lat, lng } = req.body;

  // Basic validation
  if (!senderId || lat == null || lng == null) {
    return res.status(400).json({ error: 'Missing senderId, lat, or lng' });
  }
  const latitude  = parseFloat(lat);
  const longitude = parseFloat(lng);
  if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    // Load the resident's current temp_data
    const residentRes = await db.query(
      'SELECT * FROM residents WHERE messenger_id = $1',
      [senderId]
    );
    const resident = residentRes.rows[0];

    if (!resident) {
      return res.status(404).json({ error: 'Resident not found' });
    }

    // Save coordinates into temp_data and advance state to report_description
    const tempData = JSON.parse(resident.temp_data || '{}');
    tempData.latitude  = latitude;
    tempData.longitude = longitude;

    await db.query(
      "UPDATE residents SET conversation_state = 'report_description', temp_data = $1 WHERE messenger_id = $2",
      [JSON.stringify(tempData), senderId]
    );

    // Send a Messenger message to the user to bring them back
    await sendQuickReplies(
      senderId,
      `✅ Location received! 📍 (${latitude.toFixed(5)}, ${longitude.toFixed(5)})\n\n` +
      `Now go back to Messenger and describe the issue (at least 10 characters). You can also send a photo:`,
      [
        { title: '⏭️ Skip description', payload: 'SKIP_DESC' },
      ]
    );

    return res.json({ ok: true });

  } catch (err) {
    console.error('Location submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;