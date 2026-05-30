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

  // Universal commands
  if (upperText === 'HELP' || upperText === 'MENU' || upperText === 'RESTART') {
    return showMainMenu(senderId);
  }

  if (upperText === 'CANCEL') {
    await db.query("UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
    return sendMessage(senderId, 'Cancelled! What would you like to do?');
  }

  // Get Started button
  if (text === 'GET_STARTED') {
    return showMainMenu(senderId);
  }

  // Menu navigation
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

  // Find or create resident
  let residentRes = await db.query('SELECT * FROM residents WHERE messenger_id = $1', [senderId]);
  let resident = residentRes.rows[0];

  // New user — ask residency first
  if (!resident) {
    await db.query("INSERT INTO residents (messenger_id, conversation_state, temp_data) VALUES ($1, 'registration_resident', '{}')", [senderId]);
    return sendQuickReplies(senderId, 
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

  // Residency check
  if (state === 'registration_resident') {
    const choice = quickReplyPayload || text;
    // Check payload, full text, or truncated text
    if (choice === 'RESIDENT_YES' || text.includes('Yes, I am a reside') || text === '✅ Yes, I am a reside...') {
      tempData.is_resident = true;
      await db.query("UPDATE residents SET is_resident = true, conversation_state = 'registration_name', temp_data = $1 WHERE messenger_id = $2", [JSON.stringify(tempData), senderId]);
      return sendMessage(senderId, 'Please enter your full name:');
    }
    if (choice === 'RESIDENT_NO' || text.includes('No')) {
      await db.query("UPDATE residents SET is_resident = false, conversation_state = 'non_resident_message', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
      return sendMessage(senderId, 
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

  // Non-resident message handling
  if (state === 'non_resident_message') {
    if (text.length >= 5) {
      await db.query(
        "INSERT INTO reports (resident_id, category, description, status) VALUES ($1, 'Other', $2, 'pending')",
        [resident.id, `[NON-RESIDENT] ${text}`]
      );
      await db.query("UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
      return sendMessage(senderId, '✅ Your message has been received. A barangay staff member may review it. Thank you!');
    }
    return sendMessage(senderId, 'Please provide more detail (at least 5 characters) or type MENU to exit.');
  }

  // Full name
  if (state === 'registration_name') {
    if (text.length < 3) return sendMessage(senderId, 'Please enter your full name (at least 3 characters).');
    tempData.first_name = text;
    await db.query("UPDATE residents SET first_name = $1, conversation_state = 'registration_age', temp_data = $2 WHERE messenger_id = $3", [text, JSON.stringify(tempData), senderId]);
    return sendMessage(senderId, `Thanks, ${text}! How old are you?`);
  }

  // Age
  if (state === 'registration_age') {
    const age = parseInt(text);
    if (isNaN(age) || age < 10 || age > 120) return sendMessage(senderId, 'Enter a valid age (10-120).');
    tempData.age = age;
    await db.query("UPDATE residents SET age = $1, conversation_state = 'registration_purok', temp_data = $2 WHERE messenger_id = $3", [age, JSON.stringify(tempData), senderId]);
    return sendMessage(senderId, 'What is your Purok? (e.g., Purok 3)');
  }

  // Purok
  if (state === 'registration_purok') {
    tempData.purok = text;
    await db.query("UPDATE residents SET purok = $1, conversation_state = 'registration_street', temp_data = $2 WHERE messenger_id = $3", [text, JSON.stringify(tempData), senderId]);
    return sendMessage(senderId, 'What is your street? (e.g., Mabini Street)');
  }

  // Street + complete registration
  if (state === 'registration_street') {
    tempData.street = text;
    await db.query(
      "UPDATE residents SET street = $1, conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $2",
      [text, senderId]
    );
    return sendMessage(senderId, 
      '✅ Registration complete!\n\n' +
      'Your account is pending approval from the barangay admin. ' +
      'Once approved, you will have full access to all features including announcements.\n\n' +
      'You can still submit reports while waiting for approval.\n\n' +
      'Type MENU to get started.'
    );
  }

  // Registered user idle — show main menu
  if (state === 'idle') return showMainMenu(senderId, resident.first_name);

  // Report location — user shares GPS or skips
  if (state === 'report_location') {
    let latitude = null;
    let longitude = null;

    // Check if user shared location via Messenger's location attachment
    if (attachments && attachments.length > 0 && attachments[0].type === 'location') {
      latitude = attachments[0].payload.coordinates.lat;
      longitude = attachments[0].payload.coordinates.long;
    }

    // Save the complete report (description + image + location)
    await db.query(
      'INSERT INTO reports (resident_id, category, description, image_url, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
      [resident.id, tempData.report_category, tempData.report_description, tempData.report_image || null, latitude, longitude]
    );
    await db.query("UPDATE residents SET conversation_state = 'idle', temp_data = '{}' WHERE messenger_id = $1", [senderId]);
    
    const idRes = await db.query('SELECT lastval() as id');
    const reportId = idRes.rows[0].id;
    
    let reply = `✅ Report #${reportId} submitted!\n\nCategory: ${tempData.report_category}\nDescription: ${tempData.report_description}`;
    if (tempData.report_image) reply += '\n📷 Photo attached';
    if (latitude) reply += `\n📍 Location shared`;
    reply += '\n\nBarangay staff will review this.';
    
    return sendQuickReplies(senderId, reply, [
      { title: '📝 New Report', payload: 'MENU_REPORT' },
      { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' },
      { title: '🏠 Main Menu', payload: 'MENU_FAQ' },
    ]);
  }

  // ─── REPORT FLOW ───

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

      if (tempData.pending_image) {
        imageUrl = tempData.pending_image;
      }

      if (attachments && attachments.length > 0 && attachments[0].type === 'image') {
        await sendMessage(senderId, '📷 Processing your photo...');
        const uploadedUrl = await uploadImage(attachments[0].payload.url);
        if (uploadedUrl) {
          if (text && text.length >= 10) {
            // Save report with photo + text, then ask for location
            tempData.report_description = text;
            tempData.report_image = uploadedUrl;
            await db.query("UPDATE residents SET conversation_state = 'report_location', temp_data = $1 WHERE messenger_id = $2", [JSON.stringify(tempData), senderId]);
            return sendQuickReplies(senderId, '📍 Would you like to share your location?', [
              { title: '📍 Share Location', payload: 'LOCATION_YES' },
              { title: '⏭️ Skip', payload: 'LOCATION_SKIP' },
            ]);
          }
          tempData.pending_image = uploadedUrl;
          await db.query("UPDATE residents SET temp_data = $1 WHERE messenger_id = $2", [JSON.stringify(tempData), senderId]);
          return sendMessage(senderId, '✅ Photo received! Please describe what this photo is about (at least 10 characters):');
        } else {
          return sendMessage(senderId, '⚠️ Could not process photo. Please try again or describe the issue in text.');
        }
      }

      if (text && text.length >= 10) {
        // Save description, ask for location
        tempData.report_description = text;
        tempData.report_image = imageUrl;
        await db.query("UPDATE residents SET conversation_state = 'report_location', temp_data = $1 WHERE messenger_id = $2", [JSON.stringify(tempData), senderId]);
        return sendQuickReplies(senderId, '📍 Would you like to share your location?', [
          { title: '📍 Share Location', payload: 'LOCATION_YES' },
          { title: '⏭️ Skip', payload: 'LOCATION_SKIP' },
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

  // If non-resident, limited menu
  if (r.is_resident === false) {
    return sendQuickReplies(senderId, 'You are registered as a non-resident. You can submit reports or leave a message for the barangay.', [
      { title: '📝 Submit Report', payload: 'MENU_REPORT' },
      { title: '❓ FAQs', payload: 'MENU_FAQ' },
    ]);
  }

  // If resident but not yet approved
  if (!r.approved) {
    return sendQuickReplies(senderId, 
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

  // Approved resident — full access
  const pendingCount = await db.query(
    "SELECT COUNT(*) as count FROM reports WHERE resident_id = $1 AND status IN ('pending', 'in_progress')",
    [r.id]
  );
  const totalCount = await db.query(
    'SELECT COUNT(*) as count FROM reports WHERE resident_id = $1',
    [r.id]
  );

  const openReports = parseInt(pendingCount.rows[0].count);
  const hasSubmitted = parseInt(totalCount.rows[0].count) > 0;

  let greeting;
  if (openReports > 0) {
    const name = firstName || r.first_name || 'resident';
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
  return sendQuickReplies(senderId,
    '❓ Frequently Asked Questions\n\n🕗 Office Hours: Mon-Fri, 8AM-5PM\n\n📄 Barangay Clearance: Bring ID + P50 fee\n\n🆔 Barangay ID: 2 IDs + proof of residency, P25\n\n🚔 Emergency: 0912-345-6789\n\n🗑️ Garbage: Tue & Fri, 6AM\n\n💊 Health Center: Mon-Fri, 8AM-4PM',
    [{ title: '📝 Submit Report', payload: 'MENU_REPORT' }, { title: '📋 My Reports', payload: 'MENU_MY_REPORTS' }]
  );
}

module.exports = router;