const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const Receptionist = require("../models/Receptionist");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const generateClientId = require("../utils/generateClientId");
const { logActivity, recordFailedLogin, recordDuplicatePatientAttempt } = require("../utils/activityLogger");
const { requireAuth } = require("../middeware/auth");

/* =========================
   Login
========================= */

router.get("/login", (req, res) => {
  res.render("receptionistLogin", { error: null });
});

router.post("/login", async (req, res) => {
  const ip = req.ip;
  const { username, password } = req.body;

  const rec = await Receptionist.findOne({ username });
  if (!rec) {
    await recordFailedLogin({ actor: username, role: "receptionist", ip });
    return res.render("receptionistLogin", { error: "Account not found" });
  }

  if (rec.status === "removed") {
    await logActivity({
      type: "blocked_login",
      actor: username,
      role: "receptionist",
      description: `Removed receptionist account "${username}" attempted to log in.`,
      severity: "high",
      flagged: true,
      ip
    });
    return res.render("receptionistLogin", { error: "This account has been deactivated." });
  }

  const valid = await bcrypt.compare(password, rec.password);
  if (!valid) {
    await recordFailedLogin({ actor: username, role: "receptionist", ip });
    return res.render("receptionistLogin", { error: "Invalid password" });
  }

  const token = jwt.sign(
    { id: rec._id, role: "receptionist", name: rec.username, displayName: rec.name },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
  res.redirect("/receptionist/dashboard");
});

/* =========================
   Dashboard
========================= */

router.get("/dashboard", requireAuth("receptionist"), async (req, res) => {
  const [patients, appointments] = await Promise.all([
    Patient.find().sort({ createdAt: -1 }).limit(25),
    Appointment.find().sort({ createdAt: -1 }).limit(25)
  ]);
  res.render("receptionistDashboard", { user: req.user, patients, appointments });
});

/* =========================
   Add Patient (receptionist)
========================= */

router.get("/add-patient", requireAuth("receptionist"), (req, res) => {
  res.render("receptionistAddPatient", { error: null, success: null });
});

router.post("/add-patient", requireAuth("receptionist"), async (req, res) => {
  const { name, phone, aadhar, dob, email, address, preferredLanguage } = req.body;
  const ip = req.ip;

  if (!name || !phone || !aadhar || !dob) {
    return res.render("receptionistAddPatient", { error: "All required fields must be filled.", success: null });
  }

  try {
    const existingPatient = await Patient.findOne({ aadhar, dob });
    if (existingPatient) {
      await recordDuplicatePatientAttempt({ actor: req.user.name, role: "receptionist", ip, aadhar });
      return res.render("receptionistAddPatient", { error: "A patient with this Aadhar & DOB already exists!", success: null });
    }

    const patientId = generateClientId();
    const jwtLib = require("jsonwebtoken");
    const secureData = jwtLib.sign({ aadhar, dob }, process.env.JWT_SECRET, { expiresIn: "100y" });

    const patient = await Patient.create({
      patientId, name, phone, secureData, aadhar, dob,
      email, address,
      preferredLanguage: preferredLanguage || "English",
      registeredBy: req.user.name
    });

    await logActivity({
      type: "patient_registered",
      actor: req.user.name,
      role: "receptionist",
      description: `Receptionist "${req.user.name}" registered new patient "${patient.name}" (ID: ${patient.patientId}).`,
      severity: "info"
    });

    res.render("receptionistAddPatient", { error: null, success: `Patient registered! Patient ID: ${patientId}` });
  } catch (err) {
    console.error(err);
    res.render("receptionistAddPatient", { error: "Server error. Try again!", success: null });
  }
});

/* =========================
   Search / list patients
========================= */

router.get("/patients", requireAuth("receptionist"), async (req, res) => {
  const q = req.query.q;
  let patients;
  if (q) {
    patients = await Patient.find({
      $or: [
        { patientId: new RegExp(q, "i") },
        { name: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") }
      ]
    });
  } else {
    patients = await Patient.find().sort({ createdAt: -1 }).limit(50);
  }
  res.render("receptionistPatients", { patients, q: q || "" });
});

router.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

module.exports = router;
