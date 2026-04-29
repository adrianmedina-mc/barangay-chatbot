const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { sendMessage, sendQuickReplies } = require('../services/messenger');

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

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

async function handleMessage(senderId, messageText, quickReplyPayload) {
  const text = (quickReplyPayload || messageText || '').trim();
  const upperText = text.toUpperCase();

  if (upperText === 'HELP' || upperText === 'MENU' || upperText === 'RESTART') {
    return showMainMenu(senderId);
  }

  if (upperText === 'CANCEL') {
    await db.query("UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
    return sendMessage(senderId, 'Cancelled! What would you like to do?');
  }

  if (text === 'MENU_REPORT') {
    await db.query("UPDATE residents SET conversation_state = 'report_category', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
    return sendQuickReplies(senderId, 'What type of issue are you reporting?', [
      { title: '🏗️ Infrastructure', payload: 'CAT_INFRA' },
      { title: '🚨 Safety', payload: 'CAT_SAFETY' },
      { title: '🧹 Sanitation', payload: 'CAT_SANITATION' },
      { title: '🔊 Noise', payload: 'CAT_NOISE' },
      { title: '📌 Other', payload: 'CAT_OTHER' },
    ]);
  }

  if (text === 'MENU_FAQ') return showFAQ(senderId);

  if (text === 'MENU_MY_REPORTS') {
    const residentRes = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);
    const resident = residentRes.rows[0];
    if (!resident) return sendMessage(senderId, 'Please complete registration first. Type HELP.');
    const reportsRes = await db.query('SELECT * FROM reports WHERE resident_id = $1 ORDER BY created_at DESC LIMIT 5', [resident.id]);
    if (reportsRes.rows.length === 0) {
      return sendQuickReplies(senderId, 'You have no reports.', [
        { title: '📝 Submit Report', payload: 'MENU_REPORT' },
        { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
      ]);
    }
    let reply = '📋 Your recent reports:\n\n';
    reportsRes.rows.forEach((r) => {
      const emoji = r.status === 'pending' ? '🟡' : r.status === 'in_progress' ? '🔵' : '🟢';
      reply += `${emoji} #${r.id} - ${r.category}\n   ${r.status}\n   ${new Date(r.created_at).toLocaleDateString()}\n\n`;
    });
    return sendQuickReplies(senderId, reply, [
      { title: '📝 New Report', payload: 'MENU_REPORT' },
      { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
    ]);
  }

  let residentRes = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);
  let resident = residentRes.rows[0];

  if (!resident) {
    await db.query("INSERT INTO residents (messenger_id, conversation_state, temp_data) VALUES ($1, 'registration_name', '{}')", [senderId]);
    return sendMessage(senderId, '👋 Welcome to Barangay Bot!\n\nWhat is your first name?');
  }

  const state = resident.conversation_state;
  let tempData = JSON.parse(resident.temp_data || '{}');

  if (state === 'registration_name') {
    if (text.length < 2) return sendMessage(senderId, 'Name too short.');
    tempData.first_name = text;
    await db.query("UPDATE residents SET conversation_state = 'registration_age', temp_data = $1 WHERE messenger_id = $2", [JSON.stringify(tempData), senderId]);
    return sendMessage(senderId, `Thanks, ${text}! How old are you?`);
  }

  if (state === 'registration_age') {
    const age = parseInt(text);
    if (isNaN(age) || age < 10 || age > 120) return sendMessage(senderId, 'Enter a valid age (10-120).');
    tempData.age = age;
    await db.query("UPDATE residents SET conversation_state = 'registration_address', temp_data = $1 WHERE messenger_id = $2", [JSON.stringify(tempData), senderId]);
    return sendMessage(senderId, 'What is your address?');
  }

  if (state === 'registration_address') {
    tempData.address = text;
    await db.query("UPDATE residents SET first_name = $1, age = $2, address = $3, conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $4", [tempData.first_name, tempData.age, tempData.address, senderId]);
    return showMainMenu(senderId, tempData.first_name);
  }

  if (state === 'idle') return showMainMenu(senderId, resident.first_name);

  // Report flow
  if (state === 'report_category') {
    const map = { CAT_INFRA: 'Infrastructure', CAT_SAFETY: 'Safety', CAT_SANITATION: 'Sanitation', CAT_NOISE: 'Noise', CAT_OTHER: 'Other' };
    if (map[text]) {
      tempData.report_category = map[text];
      await db.query("UPDATE residents SET conversation_state = 'report_description', temp_data = $1 WHERE messenger_id = $2", [JSON.stringify(tempData), senderId]);
      return sendMessage(senderId, `Category: ${map[text]}\n\nDescribe the issue:`);
    }
    return sendQuickReplies(senderId, 'Select a category:', [
      { title: '🏗️ Infrastructure', payload: 'CAT_INFRA' },
      { title: '🚨 Safety', payload: 'CAT_SAFETY' },
      { title: '🧹 Sanitation', payload: 'CAT_SANITATION' },
      { title: '🔊 Noise', payload: 'CAT_NOISE' },
      { title: '📌 Other', payload: 'CAT_OTHER' },
    ]);
  }

  if (state === 'report_description') {
    if (text.length < 10) return sendMessage(senderId, 'Please provide more detail (at least 10 characters).');
    await db.query('INSERT INTO reports (resident_id, category, description) VALUES ($1, $2, $3)', [resident.id, tempData.report_category, text]);
    await db.query("UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
    const idRes = await db.query('SELECT lastval() as id');
    const reportId = idRes.rows[0].id;
    return sendQuickReplies(senderId, `✅ Report #${reportId} submitted!`, [
      { title: '📝 New Report', payload: 'MENU_REPORT' },
      { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
      { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
    ]);
  }

  return sendQuickReplies(senderId, "I didn't understand. What would you like to do?", [
    { title: '📝 Submit Report', payload: 'MENU_REPORT' },
    { title: '❓ FAQs', payload: 'MENU_FAQ' },
    { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
  ]);
}

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
    '❓ Frequently Asked Questions\n\n🕗 Office Hours: Mon-Fri, 8AM-5PM\n\n📄 Barangay Clearance: Bring ID + P50 fee\n\n🆔 Barangay ID: 2 IDs + proof of residency, P25\n\n🚔 Emergency: 0912-345-6789\n\n🗑️ Garbage: Tue & Fri, 6AM\n\n💊 Health Center: Mon-Fri, 8AM-4PM',
    [{ title: '📝 Submit Report', payload: 'MENU_REPORT' }, { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' }]
  );
}

module.exports = router;