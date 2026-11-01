/**
 * Creates a default admin account so you can log in to /admin/login
 * the first time you run the project.
 *
 * Usage:
 *   node scripts/seedAdmin.js
 *
 * Reads MONGO_URI from .env. Username/password can be overridden with
 * ADMIN_USERNAME / ADMIN_PASSWORD env vars.
 */

require("dotenv").config();
require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD || "admin123";

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await Admin.findOne({ username });
  if (existing) {
    console.log(`Admin "${username}" already exists. Nothing to do.`);
    return process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 10);
  await Admin.create({ username, password: hashed, role: "admin" });

  console.log("✅ Admin account created:");
  console.log(`   username: ${username}`);
  console.log(`   password: ${password}`);
  console.log("   Please log in at /admin/login and change this password setup as needed.");
  process.exit(0);
}

run().catch(err => {
  console.error("Failed to seed admin:", err);
  process.exit(1);
});
