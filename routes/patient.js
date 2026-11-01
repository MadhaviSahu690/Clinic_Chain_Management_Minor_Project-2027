const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const Patient = require("../models/Patient");
const Record = require("../models/Record");
const generateClientId = require("../utils/generateClientId");
const jwt = require("jsonwebtoken");
const { logActivity, recordDuplicatePatientAttempt } = require("../utils/activityLogger");

// ==========================
// Registration Page
// ==========================
router.get("/register", (req, res) => {
  res.render("registerPatient", { error: null, message: null });
});

// ==========================
// Show Patient ID page (after registration)
// ==========================
router.get("/showPatient/:id", (req, res) => {
  res.render("showPatientId", { patientId: req.params.id });
});

// ==========================
// Registration POST
// ==========================
router.post("/register", async (req, res) => {
  const { name, phone, aadhar, dob, preferredLanguage } = req.body;
  const patientId = generateClientId();

  if (!name || !phone || !aadhar || !dob) {
    return res.render("registerPatient", { error: "All fields are required!", message: null });
  }

  try {
    const existingPatient = await Patient.findOne({ aadhar, dob });
    if (existingPatient) {
      await recordDuplicatePatientAttempt({ actor: name, role: "patient", ip: req.ip, aadhar });
      return res.render("registerPatient", { error: "Patient with this Aadhar & DOB already exists!", message: null });
    }

    const secureData = jwt.sign({ aadhar, dob }, process.env.JWT_SECRET, { expiresIn: "100y" });

    await Patient.create({
      patientId, name, phone, secureData, aadhar, dob,
      preferredLanguage: preferredLanguage || "English",
      registeredBy: "self"
    });

    await logActivity({
      type: "patient_registered",
      actor: name,
      role: "patient",
      description: `Patient "${name}" self-registered (ID: ${patientId}).`,
      severity: "info"
    });

    return res.redirect(`/patient/showPatient/${patientId}`);

  } catch (err) {
    console.error(err);
    res.render("registerPatient", { error: "Server error. Try again!", message: null });
  }
});

// ==========================
// Search patient
// ==========================
router.get("/search", (req, res) => {
  res.render("searchPatient", { error: null });
});

router.post("/search", async (req, res) => {
  const { patientId } = req.body;

  if (!patientId) {
    return res.render("searchPatient", { error: "Please enter a Patient ID" });
  }

  try {
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.render("searchPatient", { error: "Patient not found!" });
    }

    res.render("patientProfile", { patient });
  } catch (err) {
    console.error(err);
    res.render("searchPatient", { error: "Server error!" });
  }
});

// ==========================
// View patient history
// ==========================
router.get("/history/:id", async (req, res) => {
  try {
    const records = await Record.find({ patientId: req.params.id }).sort({ date: 1 });
    const qr = await QRCode.toDataURL(`http://localhost:3000/patient/history/${req.params.id}`);
    res.render("history", { records, qr, patientId: req.params.id });
  } catch (err) {
    console.error(err);
    res.send("Error loading history");
  }
});

// ==========================
// QR Generation
// ==========================
router.get("/qr/:id", async (req, res) => {
  try {
    const historyUrl = `http://192.168.1.45:3000/patient/history/${req.params.id}`;
    const qr = await QRCode.toDataURL(historyUrl);
    res.render("qrView", { qr });
  } catch (err) {
    console.error(err);
    res.send("Error generating QR");
  }
});

// ==========================
// OTP STORE (temporary, in-memory)
// ==========================
let otpStore = {};

// ==========================
// Forgot Patient ID
// ==========================
router.get("/forgot-patient-id", (req, res) => {
  res.render("forgotPatient", { step: 1, error: null, phone: null, patientId: null });
});

router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;

  try {
    const patient = await Patient.findOne({ phone });
    if (!patient) {
      return res.render("forgotPatient", { step: 1, error: "Phone number not found!", phone: null, patientId: null });
    }

    const otp = Math.floor(1000 + Math.random() * 9000);
    otpStore[phone] = { otp, expires: Date.now() + 2 * 60 * 1000 }; // 2 min expiry
    console.log(`OTP for ${phone}: ${otp}`);

    res.render("forgotPatient", { step: 2, error: null, phone, patientId: null });
  } catch (err) {
    console.error(err);
    res.render("forgotPatient", { step: 1, error: "Server error!", phone: null, patientId: null });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;
  const data = otpStore[phone];

  if (!data || Date.now() > data.expires) {
    return res.render("forgotPatient", { step: 1, error: "OTP expired! Please resend.", phone: null, patientId: null });
  }

  if (data.otp != otp) {
    return res.render("forgotPatient", { step: 2, error: "Invalid OTP!", phone, patientId: null });
  }

  const patient = await Patient.findOne({ phone });
  res.render("forgotPatient", { step: 3, error: null, phone: null, patientId: patient.patientId });
});

router.post("/resend-otp", (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.render("forgotPatient", { step: 1, error: "Phone number missing!", phone: null, patientId: null });
  }

  const otp = Math.floor(1000 + Math.random() * 9000);
  otpStore[phone] = { otp, expires: Date.now() + 2 * 60 * 1000 };
  console.log(`Resent OTP for ${phone}: ${otp}`);

  res.render("forgotPatient", { step: 2, error: "OTP resent!", phone, patientId: null });
});

module.exports = router;