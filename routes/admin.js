const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const Admin = require("../models/Admin");
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const Receptionist = require("../models/Receptionist");
const VerifiedDoctor = require("../models/VerifiedDoctor");
const DoctorRequest = require("../models/DoctorRequest");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { notify } = require("../utils/notify");
const { sendMail } = require("../utils/mailer");
const Appointment = require("../models/Appointment");
const ActivityLog = require("../models/ActivityLog");
const { logActivity, recordFailedLogin } = require("../utils/activityLogger");
const { requireAuth } = require("../middeware/auth");

/* =========================
   Admin Login
========================= */

router.get("/login", (req, res) => {
  res.render("adminLogin", { error: null });
});

router.post("/login", async (req, res) => {
  const ip = req.ip;
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username });
  if (!admin) {
    await recordFailedLogin({ actor: username, role: "admin", ip });
    return res.render("adminLogin", { error: "Admin not found" });
  }

  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) {
    await recordFailedLogin({ actor: username, role: "admin", ip });
    return res.render("adminLogin", { error: "Invalid password" });
  }

  const token = jwt.sign(
    { id: admin._id, role: "admin", name: admin.username },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
  res.redirect("/admin/dashboard");
});

/* =========================
   Admin Dashboard
========================= */

router.get("/dashboard", requireAuth("admin"), async (req, res) => {
  const [doctors, patients, receptionists, appointments, flaggedActivity, recentActivity, pendingRequests] = await Promise.all([
    Doctor.find().sort({ createdAt: -1 }),
    Patient.find().sort({ createdAt: -1 }),
    Receptionist.find().sort({ createdAt: -1 }),
    Appointment.find().sort({ createdAt: -1 }).limit(20),
    ActivityLog.find({ flagged: true, resolved: false }).sort({ createdAt: -1 }),
    ActivityLog.find().sort({ createdAt: -1 }).limit(15),
    DoctorRequest.find({ status: "pending" }).select("-proofs.data -password").sort({ createdAt: -1 })
  ]);

  res.render("adminDashboard", {
    admin: req.user,
    doctors,
    patients,
    receptionists,
    appointments,
    flaggedActivity,
    recentActivity,
    pendingRequests,
    stats: {
      totalDoctors: doctors.filter(d => d.status !== "removed").length,
      totalPatients: patients.length,
      flaggedPatients: patients.filter(p => p.flagged).length,
      totalReceptionists: receptionists.filter(r => r.status !== "removed").length,
      totalAppointments: appointments.length,
      openAlerts: flaggedActivity.length,
      pendingRequests: pendingRequests.length
    }
  });
});

/* =========================
   Remove / Restore Doctor
========================= */

router.post("/doctor/remove/:id", requireAuth("admin"), async (req, res) => {
  const doctor = await Doctor.findByIdAndUpdate(req.params.id, {
    status: "removed",
    removedReason: req.body.reason || "Removed by admin"
  });

  await logActivity({
    type: "doctor_removed",
    actor: req.user.name,
    role: "admin",
    description: `Admin removed doctor "${doctor ? doctor.name : req.params.id}". Reason: ${req.body.reason || "n/a"}`,
    severity: "warning"
  });

  res.redirect("/admin/dashboard#doctors");
});

router.post("/doctor/restore/:id", requireAuth("admin"), async (req, res) => {
  const doctor = await Doctor.findByIdAndUpdate(req.params.id, { status: "active", removedReason: null });
  await logActivity({
    type: "doctor_restored",
    actor: req.user.name,
    role: "admin",
    description: `Admin restored doctor "${doctor ? doctor.name : req.params.id}".`,
    severity: "info"
  });
  res.redirect("/admin/dashboard#doctors");
});

/* =========================
   Remove Patient
========================= */

router.post("/patient/remove/:id", requireAuth("admin"), async (req, res) => {
  const patient = await Patient.findOneAndDelete({ patientId: req.params.id });

  await logActivity({
    type: "patient_removed",
    actor: req.user.name,
    role: "admin",
    description: `Admin removed patient record "${patient ? patient.name : req.params.id}" (ID: ${req.params.id}). Reason: ${req.body.reason || "n/a"}`,
    severity: "warning"
  });

  res.redirect("/admin/dashboard#patients");
});

/* =========================
   Flag / Unflag Patient
========================= */

router.post("/patient/flag/:id", requireAuth("admin"), async (req, res) => {
  const patient = await Patient.findOneAndUpdate(
    { patientId: req.params.id },
    { flagged: true, flagReason: req.body.reason || "Flagged by admin for review" }
  );
  await logActivity({
    type: "patient_flagged",
    actor: req.user.name,
    role: "admin",
    description: `Admin flagged patient "${patient ? patient.name : req.params.id}" for review. Reason: ${req.body.reason || "n/a"}`,
    severity: "warning",
    flagged: true
  });
  res.redirect("/admin/dashboard#patients");
});

router.post("/patient/unflag/:id", requireAuth("admin"), async (req, res) => {
  await Patient.findOneAndUpdate({ patientId: req.params.id }, { flagged: false, flagReason: null });
  res.redirect("/admin/dashboard#patients");
});

/* =========================
   Manage Receptionists
========================= */

router.get("/receptionist/add", requireAuth("admin"), (req, res) => {
  res.render("addReceptionist", { error: null });
});

router.post("/receptionist/add", requireAuth("admin"), async (req, res) => {
  try {
    const existing = await Receptionist.findOne({ username: req.body.username });
    if (existing) {
      return res.render("addReceptionist", { error: "Username already taken." });
    }
    const hashed = await bcrypt.hash(req.body.password, 10);
    const rec = await Receptionist.create({
      name: req.body.name,
      username: req.body.username,
      password: hashed,
      clinic: req.body.clinic,
      phone: req.body.phone,
      createdBy: req.user.name
    });

    await logActivity({
      type: "receptionist_added",
      actor: req.user.name,
      role: "admin",
      description: `Admin created receptionist account "${rec.username}".`,
      severity: "info"
    });

    res.redirect("/admin/dashboard#receptionists");
  } catch (err) {
    console.error(err);
    res.render("addReceptionist", { error: "Server error, please try again." });
  }
});

router.post("/receptionist/remove/:id", requireAuth("admin"), async (req, res) => {
  const rec = await Receptionist.findByIdAndUpdate(req.params.id, { status: "removed" });
  await logActivity({
    type: "receptionist_removed",
    actor: req.user.name,
    role: "admin",
    description: `Admin removed receptionist "${rec ? rec.username : req.params.id}".`,
    severity: "warning"
  });
  res.redirect("/admin/dashboard#receptionists");
});

/* =========================
   Doctor license requests
   (doctor submits details + proof, admin reviews and approves / rejects)
========================= */

function newLicenseId() {
  return "CCL-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

router.get("/requests", requireAuth("admin"), async (req, res) => {
  const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";

  const [requests, pending, approved, rejected] = await Promise.all([
    DoctorRequest.find({ status }).select("-proofs.data -password").sort({ createdAt: -1 }),
    DoctorRequest.countDocuments({ status: "pending" }),
    DoctorRequest.countDocuments({ status: "approved" }),
    DoctorRequest.countDocuments({ status: "rejected" })
  ]);

  res.render("adminRequests", { requests, status, counts: { pending, approved, rejected } });
});

router.get("/requests/:id", requireAuth("admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send("Request not found");
  const request = await DoctorRequest.findById(req.params.id).select("-proofs.data -password");
  if (!request) return res.status(404).send("Request not found");
  res.render("adminRequestDetail", { request, error: req.query.error || null });
});

// View / download one proof document
router.get("/requests/:id/proof/:idx", requireAuth("admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send("Not found");
  const request = await DoctorRequest.findById(req.params.id);
  const proof = request && request.proofs[parseInt(req.params.idx, 10)];
  if (!proof) return res.status(404).send("Document not found");

  const disposition = req.query.download ? "attachment" : "inline";
  res.set({
    "Content-Type": proof.contentType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(proof.name || "document")}`,
    "X-Content-Type-Options": "nosniff"
  });
  res.send(proof.data);
});

router.post("/requests/:id/approve", requireAuth("admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.redirect("/admin/requests");
  const request = await DoctorRequest.findById(req.params.id);
  if (!request || request.status !== "pending") return res.redirect("/admin/requests");

  if (await Doctor.findOne({ email: request.email })) {
    return res.redirect(`/admin/requests/${request._id}?error=` + encodeURIComponent("A doctor account with this email already exists."));
  }

  let licenseId = newLicenseId();
  while (await Doctor.findOne({ verificationId: licenseId })) licenseId = newLicenseId();

  const doctor = await Doctor.create({
    name: request.name,
    clinic: request.clinic,
    license: licenseId,
    password: request.password,
    email: request.email,
    phone: request.phone,
    city: request.city,
    state: request.state,
    qualification: request.qualification,
    experience: request.experience,
    regNo: request.regNo,
    councilName: request.councilName,
    specialization: request.specialization,
    verified: true,
    verificationId: licenseId,
    requestId: String(request._id),
    verifiedAt: new Date(),
    verifiedBy: req.user.name,
    status: "active"
  });

  await VerifiedDoctor.create({
    name: request.name,
    licenseNumber: licenseId,
    state: request.state,
    hospital: request.clinic,
    specialization: request.specialization
  });

  request.status = "approved";
  request.verificationId = licenseId;
  request.doctorId = String(doctor._id);
  request.reviewedBy = req.user.name;
  request.reviewedAt = new Date();
  request.rejectionReason = null;
  await request.save();

  // notification for the doctor (shown after login + on the status page) and optional email
  await notify({
    role: "doctor",
    recipientId: doctor._id,
    title: "Your license is approved",
    message: `Congratulations Dr. ${doctor.name}! Your documents were verified. Your Clinic Chain License ID is ${licenseId}. Patients can now find you as a verified ${doctor.specialization}.`,
    link: "/dashboard"
  });

  await sendMail({
    to: request.email,
    subject: "Your Clinic Chain license is approved",
    text: `Hello Dr. ${doctor.name},\n\nYour license request was approved. Your License ID is ${licenseId}.\nYou can now log in with your email and the password you chose.\n\nClinic Chain`
  });

  await logActivity({
    type: "license_approved",
    actor: req.user.name,
    role: "admin",
    description: `Admin approved license request of "${doctor.name}" (${doctor.specialization}). License ID ${licenseId}.`,
    severity: "info"
  });

  res.redirect("/admin/requests?status=approved");
});

router.post("/requests/:id/reject", requireAuth("admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.redirect("/admin/requests");
  const request = await DoctorRequest.findById(req.params.id);
  if (!request || request.status !== "pending") return res.redirect("/admin/requests");

  const reason = String(req.body.reason || "").trim();
  if (!reason) {
    return res.redirect(`/admin/requests/${request._id}?error=` + encodeURIComponent("Please write a reason for rejection."));
  }

  request.status = "rejected";
  request.rejectionReason = reason;
  request.reviewedBy = req.user.name;
  request.reviewedAt = new Date();
  await request.save();

  await sendMail({
    to: request.email,
    subject: "Your Clinic Chain license request was not approved",
    text: `Hello Dr. ${request.name},\n\nYour license request could not be approved.\nReason: ${reason}\n\nYou can submit a new request with correct documents.\n\nClinic Chain`
  });

  await logActivity({
    type: "license_rejected",
    actor: req.user.name,
    role: "admin",
    description: `Admin rejected license request of "${request.name}". Reason: ${reason}`,
    severity: "warning"
  });

  res.redirect("/admin/requests?status=rejected");
});

// Full details of an approved doctor, including the proof he/she submitted
router.get("/doctor/:id", requireAuth("admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send("Doctor not found");
  const doctor = await Doctor.findById(req.params.id).select("-password");
  if (!doctor) return res.status(404).send("Doctor not found");
  const request = await DoctorRequest.findOne({ doctorId: String(doctor._id) }).select("-proofs.data -password");
  res.render("adminDoctorDetail", { doctor, request });
});

/* =========================
   Unwanted Activity Log
========================= */

router.get("/activity", requireAuth("admin"), async (req, res) => {
  const filter = req.query.filter || "all";
  let query = {};
  if (filter === "flagged") query = { flagged: true };
  if (filter === "unresolved") query = { flagged: true, resolved: false };

  const activity = await ActivityLog.find(query).sort({ createdAt: -1 }).limit(200);
  res.render("activityLog", { activity, filter });
});

router.post("/activity/resolve/:id", requireAuth("admin"), async (req, res) => {
  await ActivityLog.findByIdAndUpdate(req.params.id, { resolved: true });
  res.redirect("/admin/activity?filter=unresolved");
});

module.exports = router;
