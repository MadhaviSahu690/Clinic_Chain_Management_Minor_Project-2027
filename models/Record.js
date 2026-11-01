const mongoose = require("mongoose");

const recordSchema = new mongoose.Schema({
  patientId: String,
  doctor: String,
  symptoms: String,
  diagnosis: String,
  medicines: String,
  tests: String,
  file: {
    data: Buffer,         // file content
    contentType: String,  // file type like 'image/png' or 'application/pdf'
    name: String          // original filename
  },
  hash: String,
  previousHash: String,
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Record", recordSchema)