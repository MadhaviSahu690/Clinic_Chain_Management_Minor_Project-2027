const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  type: { type: String, required: true }, // e.g. failed_login, duplicate_patient, doctor_removed...
  actor: { type: String, default: "unknown" }, // username/id who triggered it
  role: { type: String, default: "unknown" }, // doctor | admin | receptionist | patient | system
  description: { type: String, required: true },
  severity: { type: String, enum: ["info", "warning", "high"], default: "info" },
  flagged: { type: Boolean, default: false },
  resolved: { type: Boolean, default: false },
  ip: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);
