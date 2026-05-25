const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { sendMessage, sendQuickReplies } = require('../services/messenger');
const { uploadImage } = require('../services/upload');

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
          const attachments = event.message.attachments || [];
          handleMessage(event.sender.id, text, payload, attachments);
        }
      });
    });
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
});

async function handleMessage(senderId, messageText, quickReplyPayload, attachments) {
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

  // Report category selection
  if (state === 'report_category') {
    const map = { CAT_INFRA: 'Infrastructure', CAT_SAFETY: 'Safety', CAT_SANITATION: 'Sanitation', CAT_NOISE: 'Noise', CAT_OTHER: 'Other' };
    if (map[text]) {
      tempData.report_category = map[text];
      await db.query("UPDATE residents SET conversation_state = 'report_description', temp_data = $1 WHERE messenger_id = $2", [JSON.stringify(tempData), senderId]);
      return sendMessage(senderId, `Category: ${map[text]}\n\nDescribe the issue or send a photo:`);
    }
    return sendQuickReplies(senderId, 'Select a category:', [
      { title: '🏗️ Infrastructure', payload: 'CAT_INFRA' },
      { title: '🚨 Safety', payload: 'CAT_SAFETY' },
      { title: '🧹 Sanitation', payload: 'CAT_SANITATION' },
      { title: '🔊 Noise', payload: 'CAT_NOISE' },
      { title: '📌 Other', payload: 'CAT_OTHER' },
    ]);
  }

  // Report description with photo support
  if (state === 'report_description') {
    let imageUrl = null;

    if (attachments && attachments.length > 0 && attachments[0].type === 'image') {
      await sendMessage(senderId, '📷 Processing your photo...');
      imageUrl = await uploadImage(attachments[0].payload.url);
      if (imageUrl) {
        await sendMessage(senderId, '✅ Photo attached to your report.');
      } else {
        await sendMessage(senderId, '⚠️ Could not process photo, but your report will be submitted.');
      }
    }

    if (text && text.length >= 10) {
      await db.query(
        'INSERT INTO reports (resident_id, category, description, image_url) VALUES ($1, $2, $3, $4)',
        [resident.id, tempData.report_category, text, imageUrl]
      );
      await db.query("UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
      const idRes = await db.query('SELECT lastval() as id');
      const reportId = idRes.rows[0].id;
      
      let reply = `✅ Report #${reportId} submitted!\n\nCategory: ${tempData.report_category}\nDescription: ${text}`;
      if (imageUrl) reply += '\n📷 Photo attached';
      reply += '\n\nBarangay staff will review this.';
      
      return sendQuickReplies(senderId, reply, [
        { title: '📝 New Report', payload: 'MENU_REPORT' },
        { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
        { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
      ]);
    }

    if (imageUrl && (!text || text.length < 10)) {
      await db.query(
        'INSERT INTO reports (resident_id, category, description, image_url) VALUES ($1, $2, $3, $4)',
        [resident.id, tempData.report_category, 'Photo report (no description)', imageUrl]
      );
      await db.query("UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
      
      return sendQuickReplies(senderId, '✅ Photo report submitted! Barangay staff will review it.', [
        { title: '📝 New Report', payload: 'MENU_REPORT' },
        { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
      ]);
    }

    return sendMessage(senderId, 'Please provide more detail (at least 10 characters) or send a photo of the issue.');
  }

  // Fallback
  return sendQuickReplies(senderId, "I didn't understand. What would you like to do?", [
    { title: '📝 Submit Report', payload: 'MENU_REPORT' },
    { title: '❓ FAQs', payload: 'MENU_FAQ' },
    { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
  ]);
}

async function showMainMenu(senderId, firstName) {
  const resident = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);
  
  if (!resident.rows.length) {
    return sendQuickReplies(senderId, 'Hello! What would you like to do?', [
      { title: '📝 Submit Report', payload: 'MENU_REPORT' },
      { title: '❓ FAQs', payload: 'MENU_FAQ' },
    ]);
  }

  const residentId = resident.rows[0].id;
  
  const pendingCount = await db.query(
    "SELECT COUNT(*) as count FROM reports WHERE resident_id = $1 AND status IN ('pending', 'in_progress')",
    [residentId]
  );
  const totalCount = await db.query(
    'SELECT COUNT(*) as count FROM reports WHERE resident_id = $1',
    [residentId]
  );

  const openReports = parseInt(pendingCount.rows[0].count);
  const hasSubmitted = parseInt(totalCount.rows[0].count) > 0;

  let greeting;
  if (openReports > 0) {
    greeting = `Welcome back, ${firstName}! 👋\n\nYou have ${openReports} open report${openReports > 1 ? 's' : ''}. The barangay is working on ${openReports > 1 ? 'them' : 'it'}.\n\nWhat would you like to do?`;
  } else if (hasSubmitted) {
    greeting = `Welcome back, ${firstName}! 👋\n\nAll your previous reports have been resolved. Need help with something new?\n\nWhat would you like to do?`;
  } else {
    greeting = `Welcome back, ${firstName}! 👋\n\nNeed to report an issue in your barangay? I'm here to help.\n\nWhat would you like to do?`;
  }

  return sendQuickReplies(senderId, greeting, [
    { title: '📝 Submit Report', payload: 'MENU_REPORT' },
    { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
    { title: '❓ FAQs', payload: 'MENU_FAQ' },
  ]);
}

async function showFAQ(senderId) {
  return sendQuickReplies(senderId,
    '❓ Frequently Asked Questions\n\n🕗 Office Hours: Mon-Fri, 8AM-5PM\n\n📄 Barangay Clearance: Bring ID + P50 fee\n\n🆔 Barangay ID: 2 IDs + proof of residency, P25\n\n🚔 Emergency: 0912-345-6789\n\n🗑️ Garbage: Tue & Fri, 6AM\n\n💊 Health Center: Mon-Fri, 8AM-4PM',
    [{ title: '📝 Submit Report', payload: 'MENU_REPORT' }, { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' }]
  );
}

module.exports = router;