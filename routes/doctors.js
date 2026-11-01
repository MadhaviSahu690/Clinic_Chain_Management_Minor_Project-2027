const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Doctor = require("../models/Doctor");

const PUBLIC_FIELDS = "name clinic city state specialization qualification experience regNo councilName verificationId verifiedAt";
const ACTIVE = { status: "active", verified: { $ne: false } };

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function specializationCounts() {
  const rows = await Doctor.aggregate([
    { $match: ACTIVE },
    { $group: { _id: "$specialization", count: { $sum: 1 } } }
  ]);
  const map = {};
  rows.forEach(r => { map[r._id] = r.count; });
  return map;
}

/* =========================
   Public directory: Find a verified doctor
   filters: specialization, city/state/clinic (place), name
========================= */

router.get("/", async (req, res) => {
  const specialization = Doctor.SPECIALIZATIONS.includes(req.query.specialization) ? req.query.specialization : "";
  const place = String(req.query.place || "").trim().slice(0, 60);
  const q = String(req.query.q || "").trim().slice(0, 60);

  const filter = { ...ACTIVE };
  if (specialization) filter.specialization = specialization;
  if (q) filter.name = new RegExp(escapeRegex(q), "i");
  if (place) {
    const rx = new RegExp(escapeRegex(place), "i");
    filter.$or = [{ city: rx }, { state: rx }, { clinic: rx }];
  }

  const [doctors, counts] = await Promise.all([
    Doctor.find(filter).select(PUBLIC_FIELDS).sort({ specialization: 1, name: 1 }),
    specializationCounts()
  ]);

  res.render("doctors", {
    doctors,
    counts,
    specializations: Doctor.SPECIALIZATIONS,
    filters: { specialization, place, q },
    verifyResult: null
  });
});

/* =========================
   Check a License ID (CCL-XXXXXX) given by a doctor
========================= */

router.get("/verify", async (req, res) => {
  const licenseId = String(req.query.licenseId || "").trim().toUpperCase().slice(0, 20);
  let verifyResult = { searched: false };

  if (licenseId) {
    const doctor = await Doctor.findOne({ verificationId: licenseId }).select(PUBLIC_FIELDS + " status");
    verifyResult = { searched: true, licenseId, doctor: doctor && doctor.status === "active" ? doctor : null, removed: !!(doctor && doctor.status !== "active") };
  }

  const counts = await specializationCounts();
  const doctors = await Doctor.find(ACTIVE).select(PUBLIC_FIELDS).sort({ specialization: 1, name: 1 });

  res.render("doctors", {
    doctors,
    counts,
    specializations: Doctor.SPECIALIZATIONS,
    filters: { specialization: "", place: "", q: "" },
    verifyResult
  });
});

/* =========================
   Public doctor profile
========================= */

router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render("notFound", { message: "Doctor not found" });
  const doctor = await Doctor.findOne({ _id: req.params.id, ...ACTIVE }).select(PUBLIC_FIELDS);
  if (!doctor) return res.status(404).render("notFound", { message: "Doctor not found" });
  res.render("doctorProfile", { doctor });
});

module.exports = router;
