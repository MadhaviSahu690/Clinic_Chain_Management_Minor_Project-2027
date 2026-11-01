const mongoose = require("mongoose");

const receptionistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  clinic: { type: String },
  phone: { type: String },
  status: { type: String, enum: ["active", "removed"], default: "active" },
  createdBy: { type: String, default: "admin" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Receptionist", receptionistSchema);
