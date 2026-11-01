require("dotenv").config(); // load .env first
require("dns").setServers(["8.8.8.8", "1.1.1.1"]);

const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patient");
const recordRoutes = require("./routes/record");
const adminRoutes = require("./routes/admin");
const receptionistRoutes = require("./routes/receptionist");
const appointmentRoutes = require("./routes/appointment");
const chatbotRoutes = require("./routes/chatbot");
const doctorsRoutes = require("./routes/doctors");
const notificationRoutes = require("./routes/notifications");
const Notification = require("./models/Notification");

const { attachUser } = require("./middeware/auth");
const Doctor = require("./models/Doctor");

const app = express();

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Middleware
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static("public"));
app.use(attachUser); // makes req.user available (or null) on every route, including views

// make the logged-in user (and unread notification count) available in every EJS view
app.use(async (req, res, next) => {
  res.locals.currentUser = req.user || null;
  res.locals.unreadCount = 0;
  if (req.user && req.user.role) {
    try {
      res.locals.unreadCount = await Notification.countDocuments({
        recipientRole: req.user.role,
        recipientId: { $in: [String(req.user.id), "all"] },
        read: false
      });
    } catch (err) { /* ignore, bell just shows no count */ }
  }
  next();
});

// Routes
app.get("/", (req, res) => res.render("home"));

app.get("/dashboard", async (req, res) => {
  if (!req.user) return res.redirect("/auth/login");
  if (req.user.role === "admin") return res.redirect("/admin/dashboard");
  if (req.user.role === "receptionist") return res.redirect("/receptionist/dashboard");
  // default: doctor dashboard
  let doctor = null;
  try { doctor = await Doctor.findById(req.user.id).select("-password"); } catch (err) { /* ignore */ }
  res.render("dashboard", { user: req.user, doctor });
});

app.get("/about", (req, res) => res.render("about"));

app.use("/auth", authRoutes);
app.use("/patient", patientRoutes);
app.use("/record", recordRoutes);
app.use("/admin", adminRoutes);
app.use("/receptionist", receptionistRoutes);
app.use("/appointment", appointmentRoutes);
app.use("/chatbot", chatbotRoutes);
app.use("/doctors", doctorsRoutes);
app.use("/notifications", notificationRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
