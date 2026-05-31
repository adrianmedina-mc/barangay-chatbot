const express = require('express');
const router  = express.Router();
const db      = require('../db/init');
const { sendMessage, sendQuickReplies, sendLocationRequest } = require('../services/messenger');
const { uploadImage } = require('../services/upload');

const VERIFY_TOKEN      = process.env.MESSENGER_VERIFY_TOKEN;
const LOCATION_PAGE_URL = process.env.LOCATION_PAGE_URL; // e.g. "https://yourserver.com"

// ── WEBHOOK VERIFICATION ──────────────────────────────────────────────────

router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// ── WEBHOOK RECEIVER ─────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    body.entry.forEach((entry) => {
      entry.messaging.forEach((event) => {
        if (event.postback) {
          handleMessage(event.sender.id, event.postback.payload);
        } else if (event.message) {
          const text        = event.message.text || '';
          const payload     = event.message.quick_reply?.payload || '';
          const attachments = event.message.attachments || [];
          handleMessage(event.sender.id, text, payload, attachments);
        }
      });
    });
    return res.status(200).send('EVENT_RECEIVED');
  }
  return res.sendStatus(404);
});

// ── MAIN HANDLER ─────────────────────────────────────────────────────────

async function handleMessage(senderId, messageText, quickReplyPayload, attachments) {
  const text      = (quickReplyPayload || messageText || '').trim();
  const upperText = text.toUpperCase();

  // ── Global commands ──
  if (['HELP', 'MENU', 'RESTART'].includes(upperText)) return showMainMenu(senderId);

  if (upperText === 'CANCEL') {
    await db.query(
      "UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1",
      [senderId]
    );
    return sendMessage(senderId, 'Cancelled! What would you like to do?');
  }

  if (text === 'GET_STARTED') return showMainMenu(senderId);
  if (text === 'MENU_FAQ')    return showFAQ(senderId);

  if (text === 'MENU_REPORT') {
    await db.query(
      "UPDATE residents SET conversation_state = 'report_category', temp_data = '{}' WHERE messenger_id = $1",
      [senderId]
    );
    return sendQuickReplies(senderId, 'What type of issue are you reporting?', [
      { title: '🏗️ Infrastructure', payload: 'CAT_INFRA' },
      { title: '🚨 Safety',         payload: 'CAT_SAFETY' },
      { title: '🧹 Sanitation',     payload: 'CAT_SANITATION' },
      { title: '🔊 Noise',          payload: 'CAT_NOISE' },
      { title: '📌 Other',          payload: 'CAT_OTHER' },
    ]);
  }

  if (text === 'MENU_MY_REPORTS') {
    const residentRes = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);
    const resident    = residentRes.rows[0];
    if (!resident) return sendMessage(senderId, 'Please complete registration first. Type HELP.');

    const reportsRes = await db.query(
      'SELECT * FROM reports WHERE resident_id = $1 ORDER BY created_at DESC LIMIT 5',
      [resident.id]
    );
    if (reportsRes.rows.length === 0) {
      return sendQuickReplies(senderId, 'You have no reports.', [
        { title: '📝 Submit Report', payload: 'MENU_REPORT' },
        { title: '🏠 Main Menu',    payload: 'MENU_FAQ' },
      ]);
    }
    let reply = '📋 Your recent reports:\n\n';
    reportsRes.rows.forEach((r) => {
      const statusEmoji = r.status === 'pending' ? '🟡' : r.status === 'in_progress' ? '🔵' : '🟢';
      const pinTag      = r.latitude ? ' 📍' : '';
      reply += `${statusEmoji} #${r.id} - ${r.category}${pinTag}\n   ${r.status}\n   ${new Date(r.created_at).toLocaleDateString()}\n\n`;
    });
    return sendQuickReplies(senderId, reply, [
      { title: '📝 New Report', payload: 'MENU_REPORT' },
      { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
    ]);
  }

  // ── Load resident ──
  let residentRes = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);
  let resident    = residentRes.rows[0];

  if (!resident) {
    await db.query(
      "INSERT INTO residents (messenger_id, conversation_state, temp_data) VALUES ($1, 'registration_resident', '{}')",
      [senderId]
    );
    return sendQuickReplies(
      senderId,
      '👋 Welcome to Barangay Dos ChatBot!\n\nThis service is exclusive for residents of Barangay 2, Daet Camarines Norte.\n\nAre you a resident?',
      [
        { title: '✅ Yes, I am a resident', payload: 'RESIDENT_YES' },
        { title: '❌ No',                   payload: 'RESIDENT_NO' },
      ]
    );
  }

  const state    = resident.conversation_state;
  let   tempData = JSON.parse(resident.temp_data || '{}');

  // ── REGISTRATION FLOW ────────────────────────────────────────────────────

  if (state === 'registration_resident') {
    const choice = quickReplyPayload || text;
    if (choice === 'RESIDENT_YES' || text.includes('Yes, I am a reside')) {
      tempData.is_resident = true;
      await db.query(
        "UPDATE residents SET is_resident = true, conversation_state = 'registration_name', temp_data = $1 WHERE messenger_id = $2",
        [JSON.stringify(tempData), senderId]
      );
      return sendMessage(senderId, 'Please enter your full name:');
    }
    if (choice === 'RESIDENT_NO' || text.includes('No')) {
      await db.query(
        "UPDATE residents SET is_resident = false, conversation_state = 'non_resident_message', temp_data = '{}' WHERE messenger_id = $1",
        [senderId]
      );
      return sendMessage(
        senderId,
        '📢 Thank you for your interest!\n\nThe chatbot features are exclusive to Barangay 2, Daet Camarines Norte residents only. ' +
        'However, if you have a concern, you may type it here and a staff member may review it.\n\nType MENU to start over.'
      );
    }
    return sendQuickReplies(senderId, 'Please select an option:', [
      { title: '✅ Yes, I am a resident', payload: 'RESIDENT_YES' },
      { title: '❌ No',                   payload: 'RESIDENT_NO' },
    ]);
  }

  if (state === 'non_resident_message') {
    if (text.length >= 5) {
      await db.query(
        "INSERT INTO reports (resident_id, category, description, status) VALUES ($1, 'Other', $2, 'pending')",
        [resident.id, `[NON-RESIDENT] ${text}`]
      );
      await db.query(
        "UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1",
        [senderId]
      );
      return sendMessage(senderId, '✅ Your message has been received. Thank you!');
    }
    return sendMessage(senderId, 'Please provide more detail (at least 5 characters) or type MENU to exit.');
  }

  if (state === 'registration_name') {
    if (text.length < 3) return sendMessage(senderId, 'Please enter your full name (at least 3 characters).');
    tempData.first_name = text;
    await db.query(
      "UPDATE residents SET first_name = $1, conversation_state = 'registration_age', temp_data = $2 WHERE messenger_id = $3",
      [text, JSON.stringify(tempData), senderId]
    );
    return sendMessage(senderId, `Thanks, ${text}! How old are you?`);
  }

  if (state === 'registration_age') {
    const age = parseInt(text);
    if (isNaN(age) || age < 10 || age > 120) return sendMessage(senderId, 'Enter a valid age (10-120).');
    tempData.age = age;
    await db.query(
      "UPDATE residents SET age = $1, conversation_state = 'registration_purok', temp_data = $2 WHERE messenger_id = $3",
      [age, JSON.stringify(tempData), senderId]
    );
    return sendMessage(senderId, 'What is your Purok number? (e.g., 3)');
  }

  if (state === 'registration_purok') {
    tempData.purok = text;
    await db.query(
      "UPDATE residents SET purok = $1, conversation_state = 'registration_street', temp_data = $2 WHERE messenger_id = $3",
      [text, JSON.stringify(tempData), senderId]
    );
    return sendMessage(senderId, 'What is your street? (e.g., Mabini Street)');
  }

  if (state === 'registration_street') {
    tempData.street = text;
    await db.query(
      "UPDATE residents SET street = $1, conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $2",
      [text, senderId]
    );
    return sendMessage(
      senderId,
      '✅ Registration complete!\n\nYour account is pending approval from the barangay admin. ' +
      'You can still submit reports while waiting.\n\nType MENU to get started.'
    );
  }

  if (state === 'idle') return showMainMenu(senderId, resident.first_name);

  // ── REPORT FLOW ──────────────────────────────────────────────────────────

  if (state === 'report_category') {
    const categoryMap = {
      CAT_INFRA:      'Infrastructure',
      CAT_SAFETY:     'Safety',
      CAT_SANITATION: 'Sanitation',
      CAT_NOISE:      'Noise',
      CAT_OTHER:      'Other',
    };
    if (categoryMap[text]) {
    tempData.report_category = categoryMap[text];
    await db.query(
      "UPDATE residents SET conversation_state = 'report_location', temp_data = $1 WHERE messenger_id = $2",
      [JSON.stringify(tempData), senderId]
    );
    // Send the button template that opens the location page
    await sendLocationRequest(senderId, LOCATION_PAGE_URL);
    // Also send a Skip button in chat
    return sendQuickReplies(senderId, 'Tap the button above to share your location, or tap Skip to continue without it.', [
      { title: '⏭️ Skip', payload: 'LOCATION_SKIP' },
    ]);
  }
    return sendQuickReplies(senderId, 'Please select a category:', [
      { title: '🏗️ Infrastructure', payload: 'CAT_INFRA' },
      { title: '🚨 Safety',         payload: 'CAT_SAFETY' },
      { title: '🧹 Sanitation',     payload: 'CAT_SANITATION' },
      { title: '🔊 Noise',          payload: 'CAT_NOISE' },
      { title: '📌 Other',          payload: 'CAT_OTHER' },
    ]);
  }

  // ── LOCATION STATE ───────────────────────────────────────────────────────
  // Coordinates are injected server-side via POST /locate/submit (not through chat).
  // The only user message expected here is LOCATION_SKIP.

  if (state === 'report_location') {
    if (text === 'LOCATION_SKIP') {
      await db.query(
        "UPDATE residents SET conversation_state = 'report_description', temp_data = $1 WHERE messenger_id = $2",
        [JSON.stringify(tempData), senderId]
      );
      return sendMessage(
        senderId,
        'No problem! Please describe the issue (at least 10 characters). You can also send a photo:'
      );
    }
    // They sent a message while waiting — remind them
    return sendLocationRequest(senderId, LOCATION_PAGE_URL);
  }

  // ── REPORT DESCRIPTION ───────────────────────────────────────────────────

  if (state === 'report_description') {
    const imageUrl = tempData.pending_image || null;

    if (attachments && attachments.length > 0 && attachments[0].type === 'image') {
      await sendMessage(senderId, '📷 Processing your photo...');
      const uploadedUrl = await uploadImage(attachments[0].payload.url);
      if (uploadedUrl) {
        if (text && text.length >= 10) {
          await saveReport(resident.id, tempData, text, uploadedUrl, senderId);
          return sendReportConfirmation(senderId, tempData, text, uploadedUrl);
        }
        tempData.pending_image = uploadedUrl;
        await db.query('UPDATE residents SET temp_data = $1 WHERE messenger_id = $2', [
          JSON.stringify(tempData), senderId,
        ]);
        return sendMessage(
          senderId,
          '✅ Photo received! Please describe what this photo is about (at least 10 characters):'
        );
      }
      return sendMessage(senderId, '⚠️ Could not process photo. Please try again or describe the issue in text.');
    }

    if (text && text.length >= 10) {
      await saveReport(resident.id, tempData, text, imageUrl, senderId);
      return sendReportConfirmation(senderId, tempData, text, imageUrl);
    }

    return sendMessage(senderId, 'Please provide more detail (at least 10 characters) or send a photo of the issue.');
  }

  // ── FALLBACK ─────────────────────────────────────────────────────────────

  return sendQuickReplies(senderId, "I didn't understand. What would you like to do?", [
    { title: '📝 Submit Report', payload: 'MENU_REPORT' },
    { title: '❓ FAQs',          payload: 'MENU_FAQ' },
    { title: '📋 My Reports',   payload: 'MENU_MY_REPORTS' },
  ]);
}

// ── SHARED HELPERS ───────────────────────────────────────────────────────────

async function saveReport(residentId, tempData, description, imageUrl, senderId) {
  await db.query(
    'INSERT INTO reports (resident_id, category, description, image_url, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
    [residentId, tempData.report_category, description, imageUrl || null, tempData.latitude || null, tempData.longitude || null]
  );
  await db.query(
    "UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1",
    [senderId]
  );
}

async function sendReportConfirmation(senderId, tempData, description, imageUrl) {
  const idRes    = await db.query('SELECT lastval() as id');
  const reportId = idRes.rows[0].id;

  let reply = `✅ Report #${reportId} submitted!\n\nCategory: ${tempData.report_category}\nDescription: ${description}`;
  if (imageUrl)          reply += '\n📷 Photo attached';
  if (tempData.latitude) reply += `\n📍 Location pinned`;
  reply += '\n\nBarangay staff will review this.';

  return sendQuickReplies(senderId, reply, [
    { title: '📝 New Report',  payload: 'MENU_REPORT' },
    { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
    { title: '🏠 Main Menu',  payload: 'MENU_FAQ' },
  ]);
}

async function showMainMenu(senderId, firstName) {
  const result = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);
  if (!result.rows.length) {
    return sendQuickReplies(senderId, 'Hello! What would you like to do?', [
      { title: '📝 Submit Report', payload: 'MENU_REPORT' },
      { title: '❓ FAQs',          payload: 'MENU_FAQ' },
    ]);
  }
  const r = result.rows[0];
  if (r.is_resident === false) {
    return sendQuickReplies(senderId, 'You are registered as a non-resident. You can submit reports or leave a message.', [
      { title: '📝 Submit Report', payload: 'MENU_REPORT' },
      { title: '❓ FAQs',          payload: 'MENU_FAQ' },
    ]);
  }
  if (!r.approved) {
    return sendQuickReplies(
      senderId,
      `Welcome, ${firstName || 'resident'}!\n\nYour account is pending approval. You can submit reports while waiting.\n\nWhat would you like to do?`,
      [
        { title: '📝 Submit Report', payload: 'MENU_REPORT' },
        { title: '📋 My Reports',   payload: 'MENU_MY_REPORTS' },
        { title: '❓ FAQs',          payload: 'MENU_FAQ' },
      ]
    );
  }

  const pendingCount = await db.query(
    "SELECT COUNT(*) as count FROM reports WHERE resident_id = $1 AND status IN ('pending', 'in_progress')",
    [r.id]
  );
  const totalCount = await db.query('SELECT COUNT(*) as count FROM reports WHERE resident_id = $1', [r.id]);
  const openReports  = parseInt(pendingCount.rows[0].count);
  const hasSubmitted = parseInt(totalCount.rows[0].count) > 0;
  const name         = firstName || r.first_name || 'resident';

  let greeting;
  if (openReports > 0) {
    greeting = `Welcome back, ${name}! 👋\n\nYou have ${openReports} open report${openReports > 1 ? 's' : ''}. The barangay is working on ${openReports > 1 ? 'them' : 'it'}.\n\nWhat would you like to do?`;
  } else if (hasSubmitted) {
    greeting = `Welcome back, ${name}! 👋\n\nAll your previous reports have been resolved. Need help with something new?\n\nWhat would you like to do?`;
  } else {
    greeting = `Welcome back, ${name}! 👋\n\nNeed to report an issue in your barangay? I'm here to help.\n\nWhat would you like to do?`;
  }

  return sendQuickReplies(senderId, greeting, [
    { title: '📝 Submit Report', payload: 'MENU_REPORT' },
    { title: '📋 My Reports',   payload: 'MENU_MY_REPORTS' },
    { title: '❓ FAQs',          payload: 'MENU_FAQ' },
  ]);
}

async function showFAQ(senderId) {
  return sendQuickReplies(
    senderId,
    '❓ Frequently Asked Questions\n\n' +
    '🕗 Office Hours: Mon-Fri, 8AM-5PM\n\n' +
    '📄 Barangay Clearance: Bring ID + P50 fee\n\n' +
    '🆔 Barangay ID: 2 IDs + proof of residency, P25\n\n' +
    '🚔 Emergency: 0912-345-6789\n\n' +
    '🗑️ Garbage: Tue & Fri, 6AM\n\n' +
    '💊 Health Center: Mon-Fri, 8AM-4PM',
    [
      { title: '📝 Submit Report', payload: 'MENU_REPORT' },
      { title: '📋 My Reports',   payload: 'MENU_MY_REPORTS' },
    ]
  );
}

module.exports = router;