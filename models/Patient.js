const mongoose = require("mongoose");

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String },
  patientId: { type: String, required: true, unique: true },
  aadhar: { type: String, required: true, unique: true },  // UNIQUE to prevent duplicates
  dob: { type: Date, required: true },
  email: { type: String },
  address: { type: String },
  preferredLanguage: { type: String, default: "English" },
  registeredBy: { type: String, default: "self" }, // "self" | receptionist username
  flagged: { type: Boolean, default: false },
  flagReason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }

});

module.exports = mongoose.model("Patient", PatientSchema);