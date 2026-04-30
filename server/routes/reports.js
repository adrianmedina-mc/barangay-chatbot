const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authMiddleware = require('../middleware/auth');
router.use(authMiddleware);

router.get('/stats', async (req, res) => {
  const byCategory = await db.query(
    "SELECT category, COUNT(*)::int as count FROM reports GROUP BY category ORDER BY count DESC"
  );
  const byStatus = await db.query(
    "SELECT status, COUNT(*)::int as count FROM reports GROUP BY status"
  );
  res.json({
    byCategory: byCategory.rows,
    byStatus: byStatus.rows,
  });
});

router.get('/', async (req, res) => {
  const { startDate, endDate } = req.query;
  
  let query = 'SELECT r.*, res.first_name, res.last_name, res.address FROM reports r JOIN residents res ON r.resident_id = res.id';
  const params = [];
  const conditions = [];

  if (startDate) {
    conditions.push('r.created_at >= $' + (params.length + 1));
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('r.created_at <= $' + (params.length + 1));
    params.push(endDate + 'T23:59:59'); // Include the entire end date
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY r.created_at DESC';

  const result = await db.query(query, params);
  res.json(result.rows);
});

router.patch('/:id', async (req, res) => {
  await db.query('UPDATE reports SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
  res.json({ message: 'Updated' });
});

const { sendMessage } = require('../services/messenger');

router.post('/:id/reply', async (req, res) => {
  const report = await db.query(
    'SELECT r.*, res.first_name, res.messenger_id FROM reports r JOIN residents res ON r.resident_id = res.id WHERE r.id = $1',
    [req.params.id]
  );
  
  if (report.rows.length === 0) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const { messenger_id, first_name } = report.rows[0];
  await sendMessage(messenger_id, `📩 Barangay Update on Report #${req.params.id}:\n\n${req.body.message}`);

  res.json({ message: 'Reply sent' });
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
  res.json({ message: 'Report deleted' });
});

router.get('/export', async (req, res) => {
  const result = await db.query(
    "SELECT r.id, r.category, r.description, r.status, res.first_name || ' ' || res.last_name as resident, res.address, r.created_at FROM reports r JOIN residents res ON r.resident_id = res.id ORDER BY r.created_at DESC"
  );

  const headers = ['ID', 'Category', 'Description', 'Status', 'Resident', 'Address', 'Date'];
  let csv = headers.join(',') + '\n';

  result.rows.forEach(row => {
    const escaped = headers.map(h => {
      const key = h.toLowerCase();
      let val = row[key] || '';
      if (key === 'date') val = new Date(row.created_at).toLocaleDateString('en-PH');
      // Escape commas and quotes
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    csv += escaped.join(',') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=barangay-reports.csv');
  res.send(csv);
});

module.exports = router;