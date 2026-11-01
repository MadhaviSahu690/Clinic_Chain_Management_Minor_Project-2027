const mongoose = require("mongoose")

const verifiedDoctorSchema = new mongoose.Schema({

name:String,
licenseNumber:String,
state:String,
hospital:String,
specialization: { type: String, default: "General Physician" },
addedAt: { type: Date, default: Date.now }

})

module.exports = mongoose.model("VerifiedDoctor",verifiedDoctorSchema)