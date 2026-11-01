const ActivityLog = require("../models/ActivityLog");

/**
 * Record an activity log entry.
 * severity: "info" | "warning" | "high"
 * flagged: whether this should show up in the admin "Needs Review" queue
 */
async function logActivity({ type, actor = "unknown", role = "unknown", description, severity = "info", flagged = false, ip = null, meta = {} }) {
  try {
    return await ActivityLog.create({ type, actor, role, description, severity, flagged, ip, meta });
  } catch (err) {
    console.error("Failed to write activity log:", err.message);
    return null;
  }
}

/**
 * Called on every failed login attempt. If the same username/actor fails
 * repeatedly within a short window, escalate to a flagged "high" severity
 * entry so the admin can see it under Unwanted Activity.
 */
async function recordFailedLogin({ actor, role, ip }) {
  await logActivity({
    type: "failed_login",
    actor,
    role,
    description: `Failed login attempt for "${actor}" (${role})`,
    severity: "warning",
    ip
  });

  const windowStart = new Date(Date.now() - 15 * 60 * 1000); // last 15 min
  const recentFailures = await ActivityLog.countDocuments({
    type: "failed_login",
    actor,
    createdAt: { $gte: windowStart }
  });

  if (recentFailures >= 5) {
    await logActivity({
      type: "brute_force_suspected",
      actor,
      role,
      description: `${recentFailures} failed login attempts for "${actor}" in the last 15 minutes — possible brute-force attempt.`,
      severity: "high",
      flagged: true,
      ip,
      meta: { recentFailures }
    });
  }
}

/**
 * Called when someone tries to register a patient that already exists
 * (duplicate aadhar/dob). A handful of these from the same actor can
 * indicate probing/duplication attempts.
 */
async function recordDuplicatePatientAttempt({ actor, role, ip, aadhar }) {
  await logActivity({
    type: "duplicate_patient_attempt",
    actor,
    role,
    description: `Attempted to register a patient that already exists (Aadhar ending ${String(aadhar).slice(-4)}).`,
    severity: "warning",
    flagged: true,
    ip
  });
}

module.exports = { logActivity, recordFailedLogin, recordDuplicatePatientAttempt };
