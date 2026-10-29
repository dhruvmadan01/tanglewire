/* The untangle endpoint.
 *
 * Holds the model key server-side so visitors need nothing of their own, and
 * owns the prompt so this cannot be used as a free, general-purpose LLM.
 * Everything the browser sends is treated as untrusted text to be sorted.
 *
 * Two providers. Whichever key is set is the one used:
 *   GEMINI_API_KEY      -> Google, which has a real free tier
 *   ANTHROPIC_API_KEY   -> Claude, pay as you go
 * Set both and TW_PROVIDER picks. Visitors who bring their own Anthropic key
 * never reach this file at all; their browser talks to Anthropic directly.
 */

const { TANGLEWIRE_SYSTEM } = require("../assets/prompt.js");

const PER_VISITOR_PER_DAY = int(process.env.TW_PER_VISITOR_PER_DAY, 6);
const GLOBAL_PER_DAY = int(process.env.TW_GLOBAL_PER_DAY, 600);

const MAX_DUMP = 4000;
const MAX_CONTEXT = 1200;
const MAX_EXISTING = 30;
const MAX_TOKENS = 2600;

function int(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}

function provider() {
  const want = (process.env.TW_PROVIDER || "").trim().toLowerCase();
  if (want === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (want === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function modelFor(which) {
  if (process.env.TW_MODEL) return process.env.TW_MODEL;
  return which === "gemini" ? "gemini-2.5-flash" : "claude-haiku-5-5";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function visitorKey(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "");
  return fwd.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

/* ---- rate limiting -----------------------------------------------------
 * Upstash Redis over REST when configured. Without it, a per-instance
 * counter: a speed bump that stops casual hammering, not a real limit. The
 * provider's own spend cap is the backstop that cannot be bypassed.
 */
function memBump(day, visitor) {
  const m = globalThis.__tw_mem || (globalThis.__tw_mem = { day: "", seen: new Map(), total: 0 });
  if (m.day !== day) { m.day = day; m.seen.clear(); m.total = 0; }
  if (m.seen.size > 5000) m.seen.clear();
  m.total += 1;
  const v = (m.seen.get(visitor) || 0) + 1;
  m.seen.set(visitor, v);
  return { visitor: v, total: m.total };
}

async function bump(keys) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const cmds = [];
  for (const k of keys) {
    cmds.push(["INCR", k]);
    cmds.push(["EXPIRE", k, "172800", "NX"]);
  }
  try {
    const res = await fetch(url.replace(/\/$/, "") + "/pipeline", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmds)
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const counts = {};
    keys.forEach((k, i) => { counts[k] = Number(rows[i * 2]?.result ?? 0); });
    return counts;
  } catch (e) {
    return null;   // never let the limiter take the product down
  }
}

/* ---- the two providers ------------------------------------------------- */

async function askGemini(userText) {
  const model = modelFor("gemini");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" +
    encodeURIComponent(process.env.GEMINI_API_KEY);

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: TANGLEWIRE_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: MAX_TOKENS,
        temperature: 0.4,
        responseMimeType: "application/json"
      }
    })
  });

  const body = await res.text();
  if (!res.ok) {
    let detail = body.slice(0, 300);
    try { detail = JSON.parse(body)?.error?.message || detail; } catch (e) {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  const data = JSON.parse(body);
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

async function askAnthropic(userText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: modelFor("anthropic"),
      max_tokens: MAX_TOKENS,
      system: TANGLEWIRE_SYSTEM,
      messages: [{ role: "user", content: userText }]
    })
  });

  const body = await res.text();
  if (!res.ok) {
    let detail = body.slice(0, 300);
    try { detail = JSON.parse(body)?.error?.message || detail; } catch (e) {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  const data = JSON.parse(body);
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

/* A browser request from another site has no business here. Requests with no
 * Origin at all (scripts, curl) still get through — the rate limits are what
 * hold the line there — but this stops the endpoint being embedded as a free
 * backend for someone else's page.
 */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  try {
    if (new URL(origin).host === host) return true;
  } catch (e) {
    return false;
  }
  const extra = String(process.env.TW_ALLOWED_ORIGINS || "")
    .split(",").map((x) => x.trim()).filter(Boolean);
  return extra.includes(origin);
}

function redact(v) {
  let t = typeof v === "string" ? v : String(v == null ? "" : v);
  for (const k of [process.env.GEMINI_API_KEY, process.env.ANTHROPIC_API_KEY]) {
    if (k && k.length > 6) t = t.split(k).join("[key]");
  }
  // and anything key-shaped we did not plant ourselves
  return t.replace(/\bkey=[^&\s"']+/gi, "key=[redacted]")
          .replace(/\b(sk-ant-|AIza|AQ\.)[A-Za-z0-9_-]{8,}/g, "[redacted]");
}

function bad(res, status, message) {
  res.status(status).json({ error: message });
}

/* ---- handler ------------------------------------------------------------ */

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") return bad(res, 405, "Use POST.");
  if (!originAllowed(req)) return bad(res, 403, "Not available from this site.");

  const which = provider();
  if (!which) {
    return bad(res, 503, "This deployment has no model key configured yet.");
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, "Could not read that request."); }
  }
  if (!body || typeof body !== "object") return bad(res, 400, "Could not read that request.");

  const dump = String(body.dump || "").slice(0, MAX_DUMP).trim();
  if (!dump) return bad(res, 400, "Nothing to sort.");

  const context = String(body.context || "").slice(0, MAX_CONTEXT).trim();
  const existing = Array.isArray(body.existing) ? body.existing.slice(0, MAX_EXISTING) : [];

  // --- limits ---
  const day = today();
  const visitor = visitorKey(req);
  const counts = await bump([`tw:v:${day}:${visitor}`, `tw:g:${day}`]);
  const used = counts
    ? { visitor: counts[`tw:v:${day}:${visitor}`], total: counts[`tw:g:${day}`] }
    : memBump(day, visitor);

  if (used.total > GLOBAL_PER_DAY) {
    return bad(res, 429, "TangleWire has hit its shared limit for today. Add your own API key in settings to keep going.");
  }
  if (used.visitor > PER_VISITOR_PER_DAY) {
    return bad(res, 429, `That's your ${PER_VISITOR_PER_DAY} free untangles for today. Add your own API key in settings for unlimited use.`);
  }

  // --- build the message ---
  const parts = [];
  if (context) parts.push("Standing context on the founder and company:\n" + context);
  if (existing.length) {
    const lines = existing
      .map((s) => {
        const title = String((s && s.title) || "").slice(0, 120);
        const kind = String((s && s.kind) || "").slice(0, 20);
        const tension = Number(s && s.tension) || 0;
        return title ? `- ${title} [${kind}, tension ${tension}]` : "";
      })
      .filter(Boolean);
    if (lines.length) {
      parts.push("Already on the board (re-rank these together with anything new, keep titles stable where the thing is the same):\n" + lines.join("\n"));
    }
  }
  parts.push("Today's dump:\n" + dump);
  const userText = parts.join("\n\n");

  try {
    const raw = which === "gemini" ? await askGemini(userText) : await askAnthropic(userText);
    if (!raw || !raw.trim()) {
      return bad(res, 502, "Nothing came back. Try again, or add a bit more detail.");
    }
    res.setHeader("cache-control", "no-store");
    res.status(200).json({ raw: raw, model: modelFor(which) });
  } catch (err) {
    // log the real reason, tell the browser nothing about keys or billing
    console.error("untangle", which, err && err.status, redact(err && err.message));
    const s = err && err.status;
    if (s === 429 || s === 503 || s === 529) {
      return bad(res, 503, "The free allowance is busy right now. Try again in a minute.");
    }
    if (s === 401 || s === 403) {
      return bad(res, 502, "This deployment's API key isn't working. The owner needs to check it.");
    }
    return bad(res, 502, "The sorting service is having a problem. Try again shortly.");
  }
};
