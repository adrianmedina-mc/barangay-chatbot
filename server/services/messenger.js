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
          quick_replies: buttons.map((btn) => {
            // If button has content_type, use it (for location, email, etc.)
            if (btn.content_type) {
              return {
                content_type: btn.content_type,
                title: btn.title,
                payload: btn.payload || 'LOCATION_SHARED',
              };
            }
            // Regular text quick reply
            return {
              content_type: 'text',
              title: btn.title,
              payload: btn.payload,
            };
          }),
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

async function setMessengerProfile() {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        get_started: {
          payload: 'GET_STARTED',
        },
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              {
                type: 'postback',
                title: '📝 Submit Report',
                payload: 'MENU_REPORT',
              },
              {
                type: 'postback',
                title: '📋 My Reports',
                payload: 'MENU_MY_REPORTS',
              },
              {
                type: 'postback',
                title: '❓ FAQs',
                payload: 'MENU_FAQ',
              },
            ],
          },
        ],
      }
    );
    console.log('Messenger profile set successfully');
  } catch (error) {
    console.error('Error setting messenger profile:', error.response?.data || error.message);
  }
}

async function deletePersistentMenu() {
  try {
    await axios.delete(
      `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        data: {
          fields: ['persistent_menu'],
        },
      }
    );
    console.log('Persistent menu deleted');
  } catch (error) {
    console.error('Error deleting persistent menu:', error.response?.data || error.message);
  }
}

async function setIceBreakers() {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        ice_breakers: [
          {
            question: '👋 Get Started',
            payload: 'GET_STARTED',
          },
          {
            question: 'ℹ️ About this Bot',
            payload: 'MENU_FAQ',
          },
        ],
      }
    );
    console.log('Ice breakers set');
  } catch (error) {
    console.error('Error setting ice breakers:', error.response?.data || error.message);
  }
}

module.exports = { sendMessage, sendQuickReplies, broadcastToResidents, deletePersistentMenu, setIceBreakers };