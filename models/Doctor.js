const mongoose = require("mongoose")

const SPECIALIZATIONS = [
  "General Physician",
  "Gynecologist",
  "Cardiologist",
  "Neurologist",
  "Dermatologist",
  "Orthopedic",
  "Pediatrician",
  "ENT Specialist",
  "Psychiatrist",
  "Dentist",
  "Ophthalmologist",
  "Urologist",
  "Endocrinologist",
  "Gastroenterologist"
];

const doctorSchema = new mongoose.Schema({

name:String,
clinic:String,
license:String,
password:String,
email: { type: String, lowercase: true, trim: true },
phone: String,
city: String,
state: String,
qualification: String,
experience: { type: Number, default: 0 },
regNo: String,            // medical council registration number
councilName: String,
verified: { type: Boolean, default: true },
verificationId: String,   // license issued by the admin (CCL-XXXXXX)
requestId: String,
verifiedAt: Date,
verifiedBy: String,
specialization: { type: String, enum: SPECIALIZATIONS, default: "General Physician" },
status: { type: String, enum: ["active", "removed"], default: "active" },
removedReason: { type: String, default: null },
createdAt: { type: Date, default: Date.now }

})

doctorSchema.statics.SPECIALIZATIONS = SPECIALIZATIONS;

module.exports = mongoose.model("Doctor",doctorSchema)