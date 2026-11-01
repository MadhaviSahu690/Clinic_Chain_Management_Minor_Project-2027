/**
 * One place that talks to the AI service.
 * Supports Google Gemini (default if GEMINI_API_KEY is set) and Anthropic Claude.
 *
 * .env options:
 *   GEMINI_API_KEY=...            (get it free at https://aistudio.google.com/apikey)
 *   GEMINI_MODEL=gemini-3.5-flash (optional)
 *   ANTHROPIC_API_KEY=...         (optional alternative)
 *   AI_PROVIDER=gemini | anthropic (optional, only needed if both keys are set)
 */
const axios = require("axios");

class AIError extends Error {
  constructor(userMessage, detail) {
    super(detail || userMessage);
    this.userMessage = userMessage;
  }
}

function activeProvider() {
  const want = (process.env.AI_PROVIDER || "").toLowerCase();
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  if (want === "anthropic" && hasClaude) return "anthropic";
  if (want === "gemini" && hasGemini) return "gemini";
  if (hasGemini) return "gemini";
  if (hasClaude) return "anthropic";
  return null;
}

function isConfigured() {
  return activeProvider() !== null;
}

/* ---------- Gemini ---------- */

async function callGemini(system, user) {
  const base = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  // try the chosen model first, then safe fallbacks (a model name can be retired by Google)
  const models = [process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-2.5-flash"]
    .filter(Boolean)
    .filter((m, i, arr) => arr.indexOf(m) === i);

  let lastErr = null;

  for (const model of models) {
    try {
      const response = await axios.post(
        `${base}/models/${model}:generateContent`,
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.4 }
        },
        {
          headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
          timeout: 45000
        }
      );

      const data = response.data || {};
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join("\n").trim();

      if (!text) {
        const blocked = data.promptFeedback && data.promptFeedback.blockReason;
        throw new AIError(
          blocked
            ? "The AI could not answer this request. Please rephrase your question."
            : "The AI returned an empty answer. Please try again."
        );
      }
      return { text, provider: "gemini", model };
    } catch (err) {
      if (err instanceof AIError) throw err;
      lastErr = err;
      const status = err.response && err.response.status;
      if (status === 404) continue; // model name not available, try the next one
      throw toAIError(err);
    }
  }
  throw new AIError(
    "The Gemini model was not found. Set GEMINI_MODEL in your .env to a model shown in Google AI Studio.",
    lastErr && lastErr.message
  );
}

function toAIError(err) {
  const status = err.response && err.response.status;
  const apiMsg = err.response && err.response.data && err.response.data.error && err.response.data.error.message;
  console.error("Gemini error:", status, apiMsg || err.message);

  if (status === 400 && /api key/i.test(apiMsg || "")) {
    return new AIError("The Gemini API key is not valid. Please check GEMINI_API_KEY in the .env file.");
  }
  if (status === 401 || status === 403) {
    return new AIError("The Gemini API key was rejected. Check the key, and that the Gemini API is allowed for it.");
  }
  if (status === 429) {
    return new AIError("The free AI limit was reached for now. Please wait a minute and try again.");
  }
  if (err.code === "ECONNABORTED") {
    return new AIError("The AI took too long to answer. Please try again.");
  }
  return new AIError("Sorry, something went wrong while contacting the AI assistant. Please try again shortly.");
}

/* ---------- Anthropic (optional) ---------- */

async function callAnthropic(system, user) {
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: user }]
      },
      {
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        timeout: 45000
      }
    );
    const text = (response.data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (!text) throw new AIError("The AI returned an empty answer. Please try again.");
    return { text, provider: "anthropic", model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5" };
  } catch (err) {
    if (err instanceof AIError) throw err;
    console.error("Anthropic error:", err.response ? err.response.data : err.message);
    throw new AIError("Sorry, something went wrong while contacting the AI assistant. Please try again shortly.");
  }
}

async function generate({ system, user }) {
  const provider = activeProvider();
  if (!provider) {
    throw new AIError("The AI assistant isn't configured yet. Add GEMINI_API_KEY to the server's .env file to enable it.");
  }
  return provider === "gemini" ? callGemini(system, user) : callAnthropic(system, user);
}

module.exports = { generate, isConfigured, activeProvider, AIError };