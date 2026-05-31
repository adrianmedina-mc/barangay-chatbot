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
        if (event.postback) {
          handleMessage(event.sender.id, event.postback.payload);
        } else if (event.message) {
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
    await db.query(
      "UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1",
      [senderId]
    );
    return sendMessage(senderId, 'Cancelled! What would you like to do?');
  }

  if (text === 'GET_STARTED') {
    return showMainMenu(senderId);
  }

  if (text === 'MENU_REPORT') {
    await db.query(
      "UPDATE residents SET conversation_state = 'report_category', temp_data = '{}' WHERE messenger_id = $1",
      [senderId]
    );
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
    const reportsRes = await db.query(
      'SELECT * FROM reports WHERE resident_id = $1 ORDER BY created_at DESC LIMIT 5',
      [resident.id]
    );
    if (reportsRes.rows.length === 0) {
      return sendQuickReplies(senderId, 'You have no reports.', [
        { title: '📝 Submit Report', payload: 'MENU_REPORT' },
        { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
      ]);
    }
    let reply = '📋 Your recent reports:\n\n';
    reportsRes.rows.forEach((r) => {
      const emoji = r.status === 'pending' ? '🟡' : r.status === 'in_progress' ? '🔵' : '🟢';
      const hasPin = r.latitude ? ' 📍' : '';
      reply += `${emoji} #${r.id} - ${r.category}${hasPin}\n   ${r.status}\n   ${new Date(r.created_at).toLocaleDateString()}\n\n`;
    });
    return sendQuickReplies(senderId, reply, [
      { title: '📝 New Report', payload: 'MENU_REPORT' },
      { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
    ]);
  }

  let residentRes = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);
  let resident = residentRes.rows[0];

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
        { title: '❌ No', payload: 'RESIDENT_NO' },
      ]
    );
  }

  const state = resident.conversation_state;
  let tempData = JSON.parse(resident.temp_data || '{}');

  // ─── REGISTRATION FLOW ───

  if (state === 'registration_resident') {
    const choice = quickReplyPayload || text;
    if (choice === 'RESIDENT_YES' || text.includes('Yes, I am a reside') || text === '✅ Yes, I am a reside...') {
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
        '📢 Thank you for your interest!\n\n' +
          'The chatbot features are exclusive to Barangay 2, Daet Camarines Norte residents only. ' +
          'However, if you have a concern or report, you may type it here and a barangay staff member may review it.\n\n' +
          'Type your message below or type MENU to start over.'
      );
    }
    return sendQuickReplies(senderId, 'Please select an option:', [
      { title: '✅ Yes, I am a resident', payload: 'RESIDENT_YES' },
      { title: '❌ No', payload: 'RESIDENT_NO' },
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
      return sendMessage(senderId, '✅ Your message has been received. A barangay staff member may review it. Thank you!');
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
      '✅ Registration complete!\n\n' +
        'Your account is pending approval from the barangay admin. ' +
        'Once approved, you will have full access to all features including announcements.\n\n' +
        'You can still submit reports while waiting for approval.\n\n' +
        'Type MENU to get started.'
    );
  }

  if (state === 'idle') return showMainMenu(senderId, resident.first_name);

  // ─── REPORT FLOW ───

  if (state === 'report_category') {
    const map = {
      CAT_INFRA: 'Infrastructure',
      CAT_SAFETY: 'Safety',
      CAT_SANITATION: 'Sanitation',
      CAT_NOISE: 'Noise',
      CAT_OTHER: 'Other',
    };
    if (map[text]) {
      tempData.report_category = map[text];
      await db.query(
        "UPDATE residents SET conversation_state = 'report_location', temp_data = $1 WHERE messenger_id = $2",
        [JSON.stringify(tempData), senderId]
      );
      // Ask for location before description
      return sendQuickReplies(
        senderId,
        `Category: ${map[text]}\n\n📍 Can you share the location of this issue?\n\nTap the 📎 attachment icon → Location to share your current location, or tap Skip.`,
        [{ title: '⏭️ Skip location', payload: 'LOCATION_SKIP' }]
      );
    }
    return sendQuickReplies(senderId, 'Select a category:', [
      { title: '🏗️ Infrastructure', payload: 'CAT_INFRA' },
      { title: '🚨 Safety', payload: 'CAT_SAFETY' },
      { title: '🧹 Sanitation', payload: 'CAT_SANITATION' },
      { title: '🔊 Noise', payload: 'CAT_NOISE' },
      { title: '📌 Other', payload: 'CAT_OTHER' },
    ]);
  }

  // ─── LOCATION STATE ───
  // Messenger sends location as an attachment with type 'location'
  // containing payload.coordinates = { lat, long }

  if (state === 'report_location') {
    // Check for location attachment
    const locationAttachment = attachments && attachments.find((a) => a.type === 'location');

    if (locationAttachment) {
      const { lat, long } = locationAttachment.payload.coordinates;
      tempData.latitude = lat;
      tempData.longitude = long;
      await db.query(
        "UPDATE residents SET conversation_state = 'report_description', temp_data = $1 WHERE messenger_id = $2",
        [JSON.stringify(tempData), senderId]
      );
      return sendMessage(
        senderId,
        '✅ Location received! 📍\n\nNow please describe the issue (at least 10 characters, include any extra location details if needed). You can also send a photo:'
      );
    }

    // User tapped Skip or sent text instead of a location
    if (text === 'LOCATION_SKIP' || text.length > 0) {
      // If they typed something substantial, treat it as the description directly
      if (text !== 'LOCATION_SKIP' && text.length >= 10) {
        // No location, jump straight to saving with the description
        await db.query(
          'INSERT INTO reports (resident_id, category, description, image_url, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
          [resident.id, tempData.report_category, text, null, null, null]
        );
        await db.query(
          "UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1",
          [senderId]
        );
        const idRes = await db.query('SELECT lastval() as id');
        return sendQuickReplies(
          senderId,
          `✅ Report #${idRes.rows[0].id} submitted!\n\nCategory: ${tempData.report_category}\nDescription: ${text}\n\nBarangay staff will review this.`,
          [
            { title: '📝 New Report', payload: 'MENU_REPORT' },
            { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
            { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
          ]
        );
      }

      // Skipped — move to description step without coordinates
      await db.query(
        "UPDATE residents SET conversation_state = 'report_description', temp_data = $1 WHERE messenger_id = $2",
        [JSON.stringify(tempData), senderId]
      );
      return sendMessage(
        senderId,
        'No problem! Please describe the issue (at least 10 characters, include the location in your description if possible). You can also send a photo:'
      );
    }

    // They sent something we can't handle — re-prompt
    return sendQuickReplies(
      senderId,
      '📍 Please share your location using the 📎 attachment icon → Location, or tap Skip.',
      [{ title: '⏭️ Skip location', payload: 'LOCATION_SKIP' }]
    );
  }

  // ─── REPORT DESCRIPTION ───

  if (state === 'report_description') {
    let imageUrl = null;

    if (tempData.pending_image) {
      imageUrl = tempData.pending_image;
    }

    // Check for location attachment sent during description step (bonus: user shares location here)
    const locationAttachmentInDesc = attachments && attachments.find((a) => a.type === 'location');
    if (locationAttachmentInDesc && !tempData.latitude) {
      const { lat, long } = locationAttachmentInDesc.payload.coordinates;
      tempData.latitude = lat;
      tempData.longitude = long;
      await db.query('UPDATE residents SET temp_data = $1 WHERE messenger_id = $2', [
        JSON.stringify(tempData),
        senderId,
      ]);
      return sendMessage(
        senderId,
        '✅ Location saved! 📍 Now please describe the issue in text (at least 10 characters):'
      );
    }

    if (attachments && attachments.length > 0 && attachments[0].type === 'image') {
      await sendMessage(senderId, '📷 Processing your photo...');
      const uploadedUrl = await uploadImage(attachments[0].payload.url);
      if (uploadedUrl) {
        if (text && text.length >= 10) {
          await db.query(
            'INSERT INTO reports (resident_id, category, description, image_url, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
            [resident.id, tempData.report_category, text, uploadedUrl, tempData.latitude || null, tempData.longitude || null]
          );
          await db.query(
            "UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1",
            [senderId]
          );
          const idRes = await db.query('SELECT lastval() as id');
          const locationNote = tempData.latitude ? '\n📍 Location attached' : '';
          return sendQuickReplies(
            senderId,
            `✅ Report #${idRes.rows[0].id} submitted!\n\nCategory: ${tempData.report_category}\nDescription: ${text}\n📷 Photo attached${locationNote}\n\nBarangay staff will review this.`,
            [
              { title: '📝 New Report', payload: 'MENU_REPORT' },
              { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
              { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
            ]
          );
        }
        tempData.pending_image = uploadedUrl;
        await db.query('UPDATE residents SET temp_data = $1 WHERE messenger_id = $2', [
          JSON.stringify(tempData),
          senderId,
        ]);
        return sendMessage(
          senderId,
          '✅ Photo received! Please describe what this photo is about (include the location if possible, at least 10 characters):'
        );
      } else {
        return sendMessage(senderId, '⚠️ Could not process photo. Please try again or describe the issue in text.');
      }
    }

    if (text && text.length >= 10) {
      await db.query(
        'INSERT INTO reports (resident_id, category, description, image_url, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
        [resident.id, tempData.report_category, text, imageUrl, tempData.latitude || null, tempData.longitude || null]
      );
      await db.query(
        "UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1",
        [senderId]
      );
      const idRes = await db.query('SELECT lastval() as id');

      let reply = `✅ Report #${idRes.rows[0].id} submitted!\n\nCategory: ${tempData.report_category}\nDescription: ${text}`;
      if (imageUrl) reply += '\n📷 Photo attached';
      if (tempData.latitude) reply += '\n📍 Location attached';
      reply += '\n\nBarangay staff will review this.';

      return sendQuickReplies(senderId, reply, [
        { title: '📝 New Report', payload: 'MENU_REPORT' },
        { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
        { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
      ]);
    }

    return sendMessage(
      senderId,
      'Please provide more detail (at least 10 characters, include the location) or send a photo of the issue.'
    );
  }

  // Fallback
  return sendQuickReplies(senderId, "I didn't understand. What would you like to do?", [
    { title: '📝 Submit Report', payload: 'MENU_REPORT' },
    { title: '❓ FAQs', payload: 'MENU_FAQ' },
    { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
  ]);
}

// ─── HELPER FUNCTIONS ───

async function showMainMenu(senderId, firstName) {
  const resident = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);

  if (!resident.rows.length) {
    return sendQuickReplies(senderId, 'Hello! What would you like to do?', [
      { title: '📝 Submit Report', payload: 'MENU_REPORT' },
      { title: '❓ FAQs', payload: 'MENU_FAQ' },
    ]);
  }

  const r = resident.rows[0];

  if (r.is_resident === false) {
    return sendQuickReplies(
      senderId,
      'You are registered as a non-resident. You can submit reports or leave a message for the barangay.',
      [
        { title: '📝 Submit Report', payload: 'MENU_REPORT' },
        { title: '❓ FAQs', payload: 'MENU_FAQ' },
      ]
    );
  }

  if (!r.approved) {
    return sendQuickReplies(
      senderId,
      `Welcome, ${firstName || 'resident'}!\n\n` +
        'Your account is pending approval. You can submit reports while waiting.\n\n' +
        'What would you like to do?',
      [
        { title: '📝 Submit Report', payload: 'MENU_REPORT' },
        { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
        { title: '❓ FAQs', payload: 'MENU_FAQ' },
      ]
    );
  }

  const pendingCount = await db.query(
    "SELECT COUNT(*) as count FROM reports WHERE resident_id = $1 AND status IN ('pending', 'in_progress')",
    [r.id]
  );
  const totalCount = await db.query('SELECT COUNT(*) as count FROM reports WHERE resident_id = $1', [r.id]);

  const openReports = parseInt(pendingCount.rows[0].count);
  const hasSubmitted = parseInt(totalCount.rows[0].count) > 0;
  const name = firstName || r.first_name || 'resident';

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
    { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
    { title: '❓ FAQs', payload: 'MENU_FAQ' },
  ]);
}

async function showFAQ(senderId) {
  return sendQuickReplies(
    senderId,
    '❓ Frequently Asked Questions\n\n🕗 Office Hours: Mon-Fri, 8AM-5PM\n\n📄 Barangay Clearance: Bring ID + P50 fee\n\n🆔 Barangay ID: 2 IDs + proof of residency, P25\n\n🚔 Emergency: 0912-345-6789\n\n🗑️ Garbage: Tue & Fri, 6AM\n\n💊 Health Center: Mon-Fri, 8AM-4PM',
    [
      { title: '📝 Submit Report', payload: 'MENU_REPORT' },
      { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
    ]
  );
}

module.exports = router;