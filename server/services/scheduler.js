const db = require('../db/init');
const { broadcastToResidents } = require('./messenger');

function startScheduler() {
  console.log('Scheduler started — checking every 60 seconds');
  setInterval(async () => {
    try {
      const result = await db.query("SELECT * FROM announcements WHERE status = 'scheduled' AND scheduled_at <= NOW()");
      for (const a of result.rows) {
        let query = "SELECT messenger_id FROM residents WHERE conversation_state = 'idle'";
        const params = [];
        if (a.age_min) { query += ' AND age >= $' + (params.length + 1); params.push(a.age_min); }
        if (a.age_max) { query += ' AND age <= $' + (params.length + 1); params.push(a.age_max); }
        const residents = await db.query(query, params);
        const ids = residents.rows.map(r => r.messenger_id);
        const count = await broadcastToResidents(ids, `📢 Barangay Announcement:\n\n${a.message}`);
        await db.query("UPDATE announcements SET status = 'sent', recipient_count = $1 WHERE id = $2", [count, a.id]);
        console.log(`Announcement #${a.id} sent to ${count} residents`);
      }
    } catch (e) {
      console.error('Scheduler error:', e);
    }
  }, 60000);
}

module.exports = { startScheduler };