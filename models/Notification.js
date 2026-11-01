const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipientRole: { type: String, enum: ["admin", "doctor", "receptionist"], required: true },
  recipientId: { type: String, default: "all" }, // user id, or "all" for every user of that role
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String, default: null },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Notification", notificationSchema);
