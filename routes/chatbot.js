const express = require("express");
const router = express.Router();
const ai = require("../utils/aiProvider");

const Patient = require("../models/Patient");
const Record = require("../models/Record");
const { logActivity } = require("../utils/activityLogger");

const SUPPORTED_LANGUAGES = [
  "English", "Hindi", "Bengali", "Marathi", "Telugu",
  "Tamil", "Gujarati", "Urdu", "Kannada", "Punjabi", "Malayalam"
];

/* =========================
   Chat page
========================= */

router.get("/:patientId", async (req, res) => {
  const patient = await Patient.findOne({ patientId: req.params.patientId });
  if (!patient) return res.send("Patient not found");

  const records = await Record.find({ patientId: req.params.patientId }).sort({ date: -1 });

  res.render("chatbot", {
    patient,
    records,
    languages: SUPPORTED_LANGUAGES,
    aiConfigured: ai.isConfigured(),
    aiProvider: ai.activeProvider()
  });
});

/* =========================
   Summarize a specific record, or answer a free-text
   question about the patient's history, in the chosen language.
   Expects JSON: { patientId, recordId (optional), language, question (optional) }
========================= */

router.post("/ask", express.json(), async (req, res) => {
  const { patientId, recordId, language, question } = req.body;

  if (!ai.isConfigured()) {
    return res.status(500).json({
      reply: "The AI assistant isn't configured yet. Please add GEMINI_API_KEY in the server's .env file to enable this feature."
    });
  }

  try {
    const patient = await Patient.findOne({ patientId });
    if (!patient) return res.status(404).json({ reply: "Patient not found." });

    let records = [];
    if (recordId) {
      const r = await Record.findById(recordId);
      if (r) records = [r];
    } else {
      records = await Record.find({ patientId }).sort({ date: -1 }).limit(10);
    }

    const recordsText = records.length
      ? records.map((r, i) =>
          `Record ${i + 1} (Date: ${r.date ? new Date(r.date).toDateString() : "n/a"}):\n` +
          `Doctor: ${r.doctor || "n/a"}\nSymptoms: ${r.symptoms || "n/a"}\n` +
          `Diagnosis: ${r.diagnosis || "n/a"}\nMedicines: ${r.medicines || "n/a"}\nTests: ${r.tests || "n/a"}`
        ).join("\n\n")
      : "No medical records are on file for this patient yet.";

    const targetLanguage = language || patient.preferredLanguage || "English";

    const systemPrompt =
      "You are a caring, careful medical-records assistant for a clinic app called Clinic Chain. " +
      "You explain a patient's own medical records to them in simple, plain, non-alarming language. " +
      `Always respond in ${targetLanguage}, using natural, easy-to-understand wording (avoid heavy medical jargon; explain any term you must use). ` +
      "Never invent facts that are not in the records provided. If information is missing, say so. " +
      "Always end with a short reminder that this is a summary only and the patient should consult their doctor for medical advice, especially before changing any medication.";

    const userPrompt = question
      ? `Here are the patient's medical records:\n\n${recordsText}\n\nThe patient asks: "${question}"\n\nAnswer helpfully and safely, in ${targetLanguage}.`
      : `Here are the patient's medical record(s):\n\n${recordsText}\n\nPlease give the patient a clear, friendly summary of what this means, in ${targetLanguage}.`;

    const result = await ai.generate({ system: systemPrompt, user: userPrompt });
    const reply = result.text;

    await logActivity({
      type: "ai_summary_requested",
      actor: patientId,
      role: "patient",
      description: `AI report summary requested for patient ${patientId} in ${targetLanguage}.`,
      severity: "info"
    });

    res.json({ reply, language: targetLanguage });
  } catch (err) {
    console.error("Chatbot error:", err.message);
    res.status(500).json({ reply: err.userMessage || "Sorry, something went wrong while contacting the AI assistant. Please try again shortly." });
  }
});

module.exports = router;
