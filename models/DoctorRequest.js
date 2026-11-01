const mongoose = require("mongoose");

const proofSchema = new mongoose.Schema({
  label: String,          // e.g. "Registration Certificate"
  data: Buffer,
  contentType: String,
  name: String,
  size: Number
}, { _id: false });

const doctorRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true }, // bcrypt hash, used when the account is created on approval
  clinic: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  specialization: { type: String, required: true },
  qualification: { type: String, trim: true },
  experience: { type: Number, default: 0 },
  regNo: { type: String, required: true, trim: true },       // medical council registration number
  councilName: { type: String, trim: true },
  proofs: [proofSchema],
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  rejectionReason: { type: String, default: null },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  verificationId: { type: String, default: null },            // license issued by admin on approval
  doctorId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("DoctorRequest", doctorRequestSchema);
