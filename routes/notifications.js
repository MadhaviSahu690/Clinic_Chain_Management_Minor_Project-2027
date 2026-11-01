const express = require("express");
const router = express.Router();

const Notification = require("../models/Notification");
const { requireAuth } = require("../middeware/auth");

function filterFor(user) {
  return { recipientRole: user.role, recipientId: { $in: [String(user.id), "all"] } };
}

router.get("/", requireAuth("doctor", "admin", "receptionist"), async (req, res) => {
  const filter = filterFor(req.user);
  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
  const unreadIds = notifications.filter(n => !n.read).map(n => n._id);

  res.render("notifications", { notifications, unreadIds: unreadIds.map(String) });

  // mark as read after rendering, so the page can still highlight the new ones
  if (unreadIds.length) {
    await Notification.updateMany({ _id: { $in: unreadIds } }, { read: true });
  }
});

module.exports = router;
