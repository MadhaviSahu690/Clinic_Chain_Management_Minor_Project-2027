const express = require("express");
const router = express.Router();

const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const { logActivity } = require("../utils/activityLogger");
const { requireAuth, attachUser } = require("../middeware/auth");

/* =========================
   Booking form
========================= */

async function renderBookingForm(req, res) {
  const doctors = await Doctor.find({ status: "active", verified: { $ne: false } }).sort({ specialization: 1, name: 1 });
  let patient = null;
  if (req.params.patientId) {
    patient = await Patient.findOne({ patientId: req.params.patientId });
  }
  res.render("bookAppointment", {
    doctors,
    specializations: Doctor.SPECIALIZATIONS,
    patient,
    user: req.user,
    selectedDoctor: req.query.doctor || "",
    error: null,
    success: null
  });
}

router.get("/book", attachUser, renderBookingForm);
router.get("/book/:patientId", attachUser, renderBookingForm);

router.post("/book", attachUser, async (req, res) => {
  const { patientId, doctorId, date, time, reason } = req.body;

  const doctors = await Doctor.find({ status: "active", verified: { $ne: false } }).sort({ specialization: 1, name: 1 });

  try {
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.render("bookAppointment", {
        doctors, specializations: Doctor.SPECIALIZATIONS, patient: null, user: req.user,
        error: "No patient found with that Patient ID. Please double-check or register first.",
        success: null
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || doctor.status !== "active") {
      return res.render("bookAppointment", {
        doctors, specializations: Doctor.SPECIALIZATIONS, patient, user: req.user,
        error: "Selected doctor is not available.",
        success: null
      });
    }

    // prevent double-booking the same doctor at the same date & time
    const clash = await Appointment.findOne({ doctorId, date, time, status: { $in: ["pending", "confirmed"] } });
    if (clash) {
      return res.render("bookAppointment", {
        doctors, specializations: Doctor.SPECIALIZATIONS, patient, user: req.user,
        error: `Dr. ${doctor.name} is already booked at ${time} on ${date}. Please pick another slot.`,
        success: null
      });
    }

    const bookedBy = req.user ? (req.user.role === "receptionist" ? req.user.name : req.user.role) : "patient";

    const appt = await Appointment.create({
      patientId: patient.patientId,
      patientName: patient.name,
      doctorId: doctor._id,
      doctorName: doctor.name,
      specialization: doctor.specialization,
      date, time, reason,
      bookedBy
    });

    await logActivity({
      type: "appointment_booked",
      actor: bookedBy,
      role: req.user ? req.user.role : "patient",
      description: `Appointment booked for patient "${patient.name}" (${patient.patientId}) with Dr. ${doctor.name} on ${date} at ${time}.`,
      severity: "info"
    });

    res.render("bookAppointment", {
      doctors, specializations: Doctor.SPECIALIZATIONS, patient, user: req.user,
      error: null,
      success: `Appointment booked with Dr. ${doctor.name} on ${date} at ${time}. Status: pending confirmation.`
    });
  } catch (err) {
    console.error(err);
    res.render("bookAppointment", {
      doctors, specializations: Doctor.SPECIALIZATIONS, patient: null, user: req.user,
      error: "Server error while booking. Please try again.",
      success: null
    });
  }
});

/* =========================
   Calendar / list (doctor, receptionist, admin)
========================= */

router.get("/calendar", requireAuth("doctor", "admin", "receptionist"), async (req, res) => {
  let filter = {};
  if (req.user.role === "doctor") {
    filter.doctorId = req.user.id;
  }
  const appointments = await Appointment.find(filter).sort({ date: 1, time: 1 });

  // group by date for the calendar view
  const byDate = {};
  appointments.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  res.render("appointments", { appointments, byDate, user: req.user });
});

router.post("/status/:id", requireAuth("doctor", "admin", "receptionist"), async (req, res) => {
  const appt = await Appointment.findByIdAndUpdate(req.params.id, { status: req.body.status });
  await logActivity({
    type: "appointment_status_changed",
    actor: req.user.name,
    role: req.user.role,
    description: `Appointment for "${appt ? appt.patientName : req.params.id}" marked as ${req.body.status}.`,
    severity: "info"
  });
  res.redirect("/appointment/calendar");
});

module.exports = router;
