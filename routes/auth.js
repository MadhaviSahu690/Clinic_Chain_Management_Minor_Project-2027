const express = require("express")
const router = express.Router()

const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const multer = require("multer")

const Doctor = require("../models/Doctor")
const DoctorRequest = require("../models/DoctorRequest")
const { logActivity, recordFailedLogin } = require("../utils/activityLogger")
const { notify } = require("../utils/notify")

/* =========================
   Proof document upload (kept in memory, saved in MongoDB with the request)
========================= */

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true)
    cb(new Error("Only PDF, JPG or PNG files are allowed."))
  }
}).fields([
  { name: "registrationCertificate", maxCount: 1 },
  { name: "degreeCertificate", maxCount: 1 },
  { name: "idProof", maxCount: 1 }
])

const PROOF_FIELDS = [
  { field: "registrationCertificate", label: "Medical Registration Certificate" },
  { field: "degreeCertificate", label: "Degree Certificate" },
  { field: "idProof", label: "Government ID Proof" }
]

function renderRequestForm(res, error, form = {}) {
  return res.status(error ? 400 : 200).render("doctorRequest", {
    specializations: Doctor.SPECIALIZATIONS,
    error,
    form
  })
}

/* =========================
   Doctor: request a license (replaces direct registration)
========================= */

router.get("/register", (req, res) => res.redirect("/auth/request-license"))

router.get("/request-license", (req, res) => {
  renderRequestForm(res, null, {})
})

router.post("/request-license", (req, res, next) => {
  upload(req, res, (err) => {
    if (!err) return next()
    const msg = err.code === "LIMIT_FILE_SIZE" ? "Each file must be 4 MB or smaller." : err.message
    renderRequestForm(res, msg, req.body || {})
  })
}, async (req, res) => {
  const form = req.body || {}

  try {
    const required = ["name", "email", "phone", "password", "specialization", "qualification", "regNo", "councilName", "clinic", "city", "state"]
    const missing = required.filter(k => !form[k] || !String(form[k]).trim())
    if (missing.length) return renderRequestForm(res, "Please fill in all the required fields.", form)

    if (!Doctor.SPECIALIZATIONS.includes(form.specialization)) {
      return renderRequestForm(res, "Please choose a valid specialization.", form)
    }
    if (String(form.password).length < 6) {
      return renderRequestForm(res, "Password must be at least 6 characters.", form)
    }

    const files = req.files || {}
    const missingProofs = PROOF_FIELDS.filter(p => !files[p.field] || !files[p.field][0])
    if (missingProofs.length) {
      return renderRequestForm(res, "Proof is required. Please upload: " + missingProofs.map(p => p.label).join(", ") + ".", form)
    }

    const email = String(form.email).trim().toLowerCase()
    const regNo = String(form.regNo).trim()

    if (await Doctor.findOne({ email })) {
      return renderRequestForm(res, "A doctor account with this email already exists. Please log in.", form)
    }
    const openRequest = await DoctorRequest.findOne({
      status: { $in: ["pending", "approved"] },
      $or: [{ email }, { regNo }]
    })
    if (openRequest) {
      return renderRequestForm(res, "A request with this email or registration number is already " + openRequest.status + ". Use 'Check request status' to see it.", form)
    }

    const proofs = PROOF_FIELDS.map(p => {
      const f = files[p.field][0]
      return { label: p.label, data: f.buffer, contentType: f.mimetype, name: f.originalname, size: f.size }
    })

    const request = await DoctorRequest.create({
      name: form.name.trim(),
      email,
      phone: form.phone.trim(),
      password: await bcrypt.hash(form.password, 10),
      clinic: form.clinic.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      specialization: form.specialization,
      qualification: form.qualification.trim(),
      experience: Math.max(0, parseInt(form.experience, 10) || 0),
      regNo,
      councilName: form.councilName.trim(),
      proofs
    })

    await notify({
      role: "admin",
      title: "New doctor license request",
      message: `Dr. ${request.name} (${request.specialization}, ${request.city}) has requested a license and uploaded proof documents.`,
      link: "/admin/requests/" + request._id
    })

    await logActivity({
      type: "license_requested",
      actor: request.name,
      role: "doctor",
      description: `License request submitted by "${request.name}" (${request.specialization}, ${request.city}).`,
      severity: "info",
      ip: req.ip
    })

    res.redirect("/auth/request-status?email=" + encodeURIComponent(email) + "&submitted=1")
  } catch (err) {
    console.error(err)
    renderRequestForm(res, "Server error while submitting your request. Please try again.", form)
  }
})

/* =========================
   Doctor: check request status
========================= */

router.get("/request-status", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase()
  let request = null
  let searched = false

  if (email) {
    searched = true
    request = await DoctorRequest.findOne({ email }).sort({ createdAt: -1 }).select("-proofs.data -password")
  }

  res.render("requestStatus", { email, request, searched, submitted: req.query.submitted === "1" })
})

/* =========================
   Doctor Login (works only after the admin approves the request)
========================= */

router.get("/login", (req, res) => {
  res.render("login", { error: null })
})

router.post("/login", async (req, res) => {

  const ip = req.ip
  const identifier = String(req.body.email || req.body.name || "").trim()

  const doctor = identifier
    ? await Doctor.findOne({ $or: [{ email: identifier.toLowerCase() }, { name: identifier }] })
    : null

  if (!doctor) {
    // Not an approved doctor. Maybe a request is still waiting?
    const request = identifier
      ? await DoctorRequest.findOne({ email: identifier.toLowerCase() }).sort({ createdAt: -1 })
      : null

    if (request && request.status === "pending") {
      return res.render("login", { error: "Your license request is still waiting for admin approval. You can log in once it is approved." })
    }
    if (request && request.status === "rejected") {
      return res.render("login", { error: "Your license request was rejected" + (request.rejectionReason ? ": " + request.rejectionReason : ".") + " Please submit a new request with correct documents." })
    }

    await recordFailedLogin({ actor: identifier || "unknown", role: "doctor", ip })
    return res.render("login", { error: "Doctor not found. If you are new, request a license first." })
  }

  if (doctor.status === "removed") {
    await logActivity({
      type: "blocked_login",
      actor: doctor.name,
      role: "doctor",
      description: `Removed/blocked doctor "${doctor.name}" attempted to log in.`,
      severity: "high",
      flagged: true,
      ip
    })
    return res.render("login", { error: "This account has been deactivated. Contact the clinic admin." })
  }

  const validPassword = await bcrypt.compare(req.body.password || "", doctor.password)

  if (!validPassword) {
    await recordFailedLogin({ actor: identifier, role: "doctor", ip })
    return res.render("login", { error: "Invalid password" })
  }

  const token = jwt.sign(
    { id: doctor._id, role: "doctor", name: doctor.name, specialization: doctor.specialization },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  )

  res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 })

  res.redirect("/dashboard")

})

/* =========================
   Logout (all roles)
========================= */

router.get("/logout", (req, res) => {
  res.clearCookie("token")
  res.redirect("/")
})

module.exports = router
