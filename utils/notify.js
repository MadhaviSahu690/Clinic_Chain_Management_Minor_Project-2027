const Notification = require("../models/Notification");

async function notify({ role, recipientId = "all", title, message, link = null }) {
  try {
    return await Notification.create({ recipientRole: role, recipientId: String(recipientId), title, message, link });
  } catch (err) {
    console.error("Failed to create notification:", err.message);
    return null;
  }
}

module.exports = { notify };
