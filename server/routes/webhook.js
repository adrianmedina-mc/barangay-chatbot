const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { sendMessage, sendQuickReplies } = require('../services/messenger');

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;

// Facebook webhook verification (GET)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Incoming messages (POST)
router.post('/', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach((entry) => {
      entry.messaging.forEach((event) => {
        if (event.message) {
          const text = event.message.text || '';
          const payload = event.message.quick_reply?.payload || '';
          handleMessage(event.sender.id, text, payload);
        }
      });
    });
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
});

// Message handler
// Message handler
async function handleMessage(senderId, messageText, quickReplyPayload) {
  const text = (quickReplyPayload || messageText || '').trim();
  const upperText = text.toUpperCase();

  // Universal commands (work in any state)
  if (upperText === 'HELP' || upperText === 'MENU' || upperText === 'RESTART') {
    return showMainMenu(senderId);
  }

  if (upperText === 'CANCEL') {
    db.prepare('UPDATE residents SET conversation_state = ?, temp_data = ? WHERE messenger_id = ?')
      .run('idle', '{}', senderId);
    return sendMessage(senderId, 'Cancelled! What would you like to do?');
  }

    // Handle main menu quick reply payloads (works regardless of state)
  if (text === 'MENU_REPORT') {
    db.prepare('UPDATE residents SET conversation_state = ?, temp_data = ? WHERE messenger_id = ?')
      .run('report_category', '{}', senderId);
    return sendQuickReplies(senderId, 'What type of issue are you reporting?', [
      { title: '🏗️ Infrastructure', payload: 'CAT_INFRA' },
      { title: '🚨 Safety', payload: 'CAT_SAFETY' },
      { title: '🧹 Sanitation', payload: 'CAT_SANITATION' },
      { title: '🔊 Noise', payload: 'CAT_NOISE' },
      { title: '📌 Other', payload: 'CAT_OTHER' },
    ]);
  }

  if (text === 'MENU_FAQ') {
    return showFAQ(senderId);
  }

  if (text === 'MENU_MY_REPORTS') {
    const residentForReports = db.prepare('SELECT * FROM residents WHERE messenger_id = ?').get(senderId);
    if (!residentForReports) {
      return sendMessage(senderId, 'Please complete registration first. Type HELP to start.');
    }
    const reports = db.prepare('SELECT * FROM reports WHERE resident_id = ? ORDER BY created_at DESC LIMIT 5').all(residentForReports.id);
    if (reports.length === 0) {
      return sendQuickReplies(senderId, 'You have no submitted reports yet.', [
        { title: '📝 Submit Report', payload: 'MENU_REPORT' },
        { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
      ]);
    }
    let reply = '📋 Your recent reports:\n\n';
    reports.forEach((r) => {
      const statusEmoji = r.status === 'pending' ? '🟡' : r.status === 'in_progress' ? '🔵' : '🟢';
      reply += `${statusEmoji} #${r.id} - ${r.category}\n   Status: ${r.status.replace('_', ' ')}\n   Date: ${new Date(r.created_at).toLocaleDateString()}\n\n`;
    });
    return sendQuickReplies(senderId, reply, [
      { title: '📝 New Report', payload: 'MENU_REPORT' },
      { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
    ]);
  }
  // Find resident
  let resident = db.prepare('SELECT * FROM residents WHERE messenger_id = ?').get(senderId);

  // Brand new user — start registration
  if (!resident) {
    db.prepare('INSERT INTO residents (messenger_id, conversation_state, temp_data) VALUES (?, ?, ?)').run(senderId, 'registration_name', '{}');
    return sendMessage(
      senderId,
      '👋 Welcome to Barangay Bot!\n\nI\'ll help you submit reports, check FAQs, and receive announcements from your barangay.\n\nLet\'s get you registered first. Type CANCEL at any time to stop, or RESTART to begin again.\n\nWhat is your first name?'
    );
  }

  const state = resident.conversation_state;
  let tempData = JSON.parse(resident.temp_data || '{}');

  // ---- REGISTRATION FLOW ----
  if (state === 'registration_name') {
    if (text.length < 2 || text.length > 50) {
      return sendMessage(senderId, 'Please enter a valid name (2-50 characters).');
    }
    tempData.first_name = text;
    db.prepare('UPDATE residents SET conversation_state = ?, temp_data = ? WHERE messenger_id = ?')
      .run('registration_age', JSON.stringify(tempData), senderId);
    return sendMessage(senderId, `Thanks, ${text}! How old are you?\n\n(Type a number, or CANCEL to stop)`);
  }

  if (state === 'registration_age') {
    const age = parseInt(text);
    if (isNaN(age) || age < 10 || age > 120) {
      return sendMessage(senderId, 'Please enter a valid age between 10 and 120.');
    }
    tempData.age = age;
    db.prepare('UPDATE residents SET conversation_state = ?, temp_data = ? WHERE messenger_id = ?')
      .run('registration_address', JSON.stringify(tempData), senderId);
    return sendMessage(senderId, 'Got it! What is your address?\n\n(e.g., Block 5, Purok 3, Barangay Name)');
  }

  if (state === 'registration_address') {
    if (text.length < 5) {
      return sendMessage(senderId, 'Please enter a more detailed address (at least 5 characters).');
    }
    tempData.address = text;
    db.prepare('UPDATE residents SET first_name = ?, age = ?, address = ?, conversation_state = ?, temp_data = ? WHERE messenger_id = ?')
      .run(tempData.first_name, tempData.age, tempData.address, 'idle', '{}', senderId);
    
    return sendQuickReplies(
      senderId,
      `✅ Registration complete! Welcome, ${tempData.first_name}!\n\nHere's what I can help you with:`,
      [
        { title: '📝 Submit Report', payload: 'MENU_REPORT' },
        { title: '❓ FAQs', payload: 'MENU_FAQ' },
        { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
      ]
    );
  }

  // ---- ALREADY REGISTERED ----
  if (state === 'idle') {
    // Returning user — show welcome back
    if (upperText === 'HELLO' || upperText === 'HI' || upperText === 'HEY' || text === '') {
      return showMainMenu(senderId, resident.first_name);
    }
    return showMainMenu(senderId, resident.first_name);
  }

  // ---- REPORT FLOW ----
  if (state === 'report_category') {
    const categoryPayloads = ['CAT_INFRA', 'CAT_SAFETY', 'CAT_SANITATION', 'CAT_NOISE', 'CAT_OTHER'];
    const categoryMap = { CAT_INFRA: 'Infrastructure', CAT_SAFETY: 'Safety', CAT_SANITATION: 'Sanitation', CAT_NOISE: 'Noise', CAT_OTHER: 'Other' };

    if (categoryPayloads.includes(text)) {
      tempData.report_category = categoryMap[text];
      db.prepare('UPDATE residents SET conversation_state = ?, temp_data = ? WHERE messenger_id = ?')
        .run('report_description', JSON.stringify(tempData), senderId);
      return sendMessage(senderId, `Category: ${categoryMap[text]}\n\nPlease describe the issue in detail. Include location if possible.\n\n(Type CANCEL to discard this report)`);
    }

    // If they typed something instead of clicking a button
    return sendQuickReplies(senderId, 'Please select a category by tapping one of the buttons below:', [
      { title: '🏗️ Infrastructure', payload: 'CAT_INFRA' },
      { title: '🚨 Safety', payload: 'CAT_SAFETY' },
      { title: '🧹 Sanitation', payload: 'CAT_SANITATION' },
      { title: '🔊 Noise', payload: 'CAT_NOISE' },
      { title: '📌 Other', payload: 'CAT_OTHER' },
    ]);
  }

  if (state === 'report_description') {
    if (text.length < 10) {
      return sendMessage(senderId, 'Please provide more detail about the issue (at least 10 characters). Include the location if possible.');
    }
    db.prepare('INSERT INTO reports (resident_id, category, description) VALUES (?, ?, ?)')
      .run(resident.id, tempData.report_category, text);
    db.prepare('UPDATE residents SET conversation_state = ?, temp_data = ? WHERE messenger_id = ?')
      .run('idle', '{}', senderId);
    const reportId = db.prepare('SELECT last_insert_rowid() as id').get();
    return sendQuickReplies(
      senderId,
      `✅ Report #${reportId.id} submitted!\n\nCategory: ${tempData.report_category}\nDescription: ${text}\n\nBarangay staff will review this. You can check the status anytime with "My Reports".`,
      [
        { title: '📝 New Report', payload: 'MENU_REPORT' },
        { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
        { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
      ]
    );
  }

  // Fallback
  return sendQuickReplies(senderId, 'I didn\'t quite understand that. What would you like to do?', [
    { title: '📝 Submit Report', payload: 'MENU_REPORT' },
    { title: '❓ FAQs', payload: 'MENU_FAQ' },
    { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
  ]);
}

// Helper: Show main menu
async function showMainMenu(senderId, firstName) {
  const greeting = firstName ? `Welcome back, ${firstName}!` : 'Hello!';
  return sendQuickReplies(senderId, `${greeting}\n\nWhat would you like to do?`, [
    { title: '📝 Submit Report', payload: 'MENU_REPORT' },
    { title: '❓ FAQs', payload: 'MENU_FAQ' },
    { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
  ]);
}
async function showFAQ(senderId) {
  return sendQuickReplies(senderId, 
    '❓ Frequently Asked Questions\n\n' +
    '🕗 Office Hours: Monday-Friday, 8:00 AM - 5:00 PM\n\n' +
    '📄 Barangay Clearance: Bring valid ID and pay P50 fee at the barangay hall. Processing takes 1-2 days.\n\n' +
    '🆔 Barangay ID: Bring 2 valid IDs and proof of residency (bill or lease). Fee: P25.\n\n' +
    '🚔 Emergency Hotline: 0912-345-6789\n\n' +
    '🗑️ Garbage Collection: Tuesday and Friday, 6:00 AM\n\n' +
    '💊 Health Center: Open Mon-Fri, 8AM-4PM. Free checkups for residents.\n\n' +
    'What else can I help with?',
    [
      { title: '📝 Submit Report', payload: 'MENU_REPORT' },
      { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
    ]
  );
}
module.exports = router;