const axios = require('axios');

const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;

async function sendMessage(recipientId, messageText) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message: { text: messageText },
      }
    );
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
}

async function sendQuickReplies(recipientId, messageText, buttons) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message: {
          text: messageText,
          quick_replies: buttons.map((btn) => ({
            content_type: 'text',
            title: btn.title,
            payload: btn.payload,
          })),
        },
      }
    );
  } catch (error) {
    console.error('Error sending quick replies:', error.response?.data || error.message);
  }
}

async function broadcastToResidents(residentIds, messageText) {
  let sent = 0;
  for (const id of residentIds) {
    try {
      await sendMessage(id, messageText);
      sent++;
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch (error) {
      console.error(`Failed to send to ${id}:`, error.message);
    }
  }
  return sent;
}

module.exports = { sendMessage, sendQuickReplies, broadcastToResidents };